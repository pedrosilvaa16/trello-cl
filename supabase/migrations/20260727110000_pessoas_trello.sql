-- Quem era quem na Trello, e como ligá-lo a uma conta daqui — depois da importação.
--
-- Sem isto, a atribuição decidida no momento da importação ficava lá para
-- sempre: guardar só o nome em texto permite mostrar, não permite corrigir.
-- Guardando o id da Trello em cada linha, associar uma pessoa passa a ser um
-- UPDATE — e re-associar à pessoa certa também.

-- ---------------------------------------------------------------------------
-- O elenco
-- ---------------------------------------------------------------------------

create table public.pessoas_trello (
  id_trello     text primary key,
  username      text not null,
  nome          text not null,
  -- A conta desta plataforma que corresponde a esta pessoa. Nulo = por ligar.
  perfil_id     uuid references public.profiles (id) on delete set null,
  associado_em  timestamptz,
  criado_em     timestamptz not null default now()
);

comment on table public.pessoas_trello is
  'Pessoas encontradas na importação da Trello e a conta a que correspondem.';

-- ---------------------------------------------------------------------------
-- A marca em cada linha importada
-- ---------------------------------------------------------------------------

-- `autor_trello` nunca é apagado, nem depois de associado: é o que permite
-- corrigir uma associação errada mais tarde, apontando as mesmas linhas a
-- outra conta.
alter table public.comments
  add column autor_trello text references public.pessoas_trello (id_trello) on delete set null;

alter table public.attachments
  add column autor_trello text references public.pessoas_trello (id_trello) on delete set null;

create index comments_autor_trello_idx on public.comments (autor_trello)
  where autor_trello is not null;
create index attachments_autor_trello_idx on public.attachments (autor_trello)
  where autor_trello is not null;

-- ---------------------------------------------------------------------------
-- O que ficou por atribuir
-- ---------------------------------------------------------------------------

-- `card_members.user_id` aponta para um perfil real, por isso um cartão
-- atribuído na Trello a quem ainda não tem conta aqui não tem onde ficar.
-- Fica aqui à espera, e passa a card_members no momento da associação.
create table public.atribuicoes_trello (
  card_id    uuid not null references public.cards (id) on delete cascade,
  id_trello  text not null references public.pessoas_trello (id_trello) on delete cascade,
  primary key (card_id, id_trello)
);

create index atribuicoes_trello_pessoa_idx on public.atribuicoes_trello (id_trello);

-- O mesmo para a pertença aos quadros, com o papel que a pessoa tinha lá.
create table public.membros_trello (
  board_id   uuid not null references public.boards (id) on delete cascade,
  id_trello  text not null references public.pessoas_trello (id_trello) on delete cascade,
  papel      public.papel_quadro not null default 'editor',
  primary key (board_id, id_trello)
);

create index membros_trello_pessoa_idx on public.membros_trello (id_trello);

-- ---------------------------------------------------------------------------
-- Associar
-- ---------------------------------------------------------------------------

/*
  Liga uma pessoa da Trello a uma conta e arrasta atrás tudo o que ela deixou:
  comentários, anexos, pertença aos quadros e cartões atribuídos.

  É repetível e corrigível. Chamar outra vez com outra conta re-aponta as
  mesmas linhas, porque `autor_trello` nunca é limpo. Devolve o que mexeu, para
  a interface poder dizer "12 comentários e 3 cartões" em vez de "feito".
*/
create or replace function public.associar_pessoa_trello(
  p_id_trello text,
  p_perfil uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comentarios integer := 0;
  v_anexos integer := 0;
  v_quadros integer := 0;
  v_cartoes integer := 0;
begin
  if not public.e_admin_algures() then
    raise exception 'Só um admin pode associar pessoas da Trello'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profiles where id = p_perfil) then
    raise exception 'Não existe nenhum perfil com esse id'
      using errcode = 'foreign_key_violation';
  end if;

  update public.pessoas_trello
  set perfil_id = p_perfil, associado_em = now()
  where id_trello = p_id_trello;

  if not found then
    raise exception 'Não existe ninguém na importação com esse id'
      using errcode = 'no_data_found';
  end if;

  -- A autoria passa a ser da conta; o nome em texto deixa de fazer falta.
  update public.comments
  set autor_id = p_perfil, autor_externo = null
  where autor_trello = p_id_trello;
  get diagnostics v_comentarios = row_count;

  update public.attachments
  set carregado_por = p_perfil, carregado_por_externo = null
  where autor_trello = p_id_trello;
  get diagnostics v_anexos = row_count;

  -- Primeiro os quadros: sem ser membro, não se pode receber um cartão.
  insert into public.board_members (board_id, user_id, papel)
  select m.board_id, p_perfil, m.papel
  from public.membros_trello m
  where m.id_trello = p_id_trello
  on conflict (board_id, user_id) do nothing;
  get diagnostics v_quadros = row_count;

  insert into public.card_members (card_id, user_id)
  select a.card_id, p_perfil
  from public.atribuicoes_trello a
  join public.cards c on c.id = a.card_id
  join public.lists l on l.id = c.list_id
  where a.id_trello = p_id_trello
    and exists (
      select 1 from public.board_members bm
      where bm.board_id = l.board_id and bm.user_id = p_perfil
    )
  on conflict (card_id, user_id) do nothing;
  get diagnostics v_cartoes = row_count;

  return json_build_object(
    'comentarios', v_comentarios,
    'anexos', v_anexos,
    'quadros', v_quadros,
    'cartoes', v_cartoes
  );
end;
$$;

/*
  Desfaz a associação: a autoria volta a ser um nome em texto e os cartões
  deixam de estar atribuídos. A pertença aos quadros não é retirada — tirar
  alguém de um quadro onde já pode ter estado a trabalhar entretanto seria
  fazer estragos por causa de um engano de mapeamento.
*/
create or replace function public.desassociar_pessoa_trello(p_id_trello text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pessoa public.pessoas_trello;
  v_comentarios integer := 0;
  v_cartoes integer := 0;
begin
  if not public.e_admin_algures() then
    raise exception 'Só um admin pode desassociar pessoas da Trello'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pessoa from public.pessoas_trello where id_trello = p_id_trello;
  if v_pessoa.id_trello is null then
    raise exception 'Não existe ninguém na importação com esse id'
      using errcode = 'no_data_found';
  end if;

  update public.comments
  set autor_id = null, autor_externo = v_pessoa.nome
  where autor_trello = p_id_trello;
  get diagnostics v_comentarios = row_count;

  update public.attachments
  set carregado_por = null, carregado_por_externo = v_pessoa.nome
  where autor_trello = p_id_trello;

  if v_pessoa.perfil_id is not null then
    delete from public.card_members cm
    using public.atribuicoes_trello a
    where a.id_trello = p_id_trello
      and cm.card_id = a.card_id
      and cm.user_id = v_pessoa.perfil_id;
    get diagnostics v_cartoes = row_count;
  end if;

  update public.pessoas_trello
  set perfil_id = null, associado_em = null
  where id_trello = p_id_trello;

  return json_build_object('comentarios', v_comentarios, 'cartoes', v_cartoes);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vista para a interface
-- ---------------------------------------------------------------------------

-- Contar isto por pessoa a cada render seriam quatro subconsultas repetidas em
-- código; aqui é uma vista, e a interface só a lê.
create or replace view public.pessoas_trello_resumo
with (security_invoker = true)
as
select
  p.id_trello,
  p.username,
  p.nome,
  p.perfil_id,
  p.associado_em,
  (select count(*) from public.comments c where c.autor_trello = p.id_trello) as comentarios,
  (select count(*) from public.attachments a where a.autor_trello = p.id_trello) as anexos,
  (select count(*) from public.atribuicoes_trello a where a.id_trello = p.id_trello) as cartoes,
  (select count(*) from public.membros_trello m where m.id_trello = p.id_trello) as quadros
from public.pessoas_trello p;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pessoas_trello     enable row level security;
alter table public.atribuicoes_trello enable row level security;
alter table public.membros_trello     enable row level security;

-- Só quem é admin de algum quadro vê o elenco da importação, e mesmo esse só
-- lê: mexer é exclusivamente pelas duas funções acima.
create policy "admins veem o elenco da trello"
  on public.pessoas_trello for select to authenticated
  using (public.e_admin_algures());

create policy "admins veem as atribuicoes pendentes"
  on public.atribuicoes_trello for select to authenticated
  using (public.e_admin_algures());

create policy "admins veem as pertencas pendentes"
  on public.membros_trello for select to authenticated
  using (public.e_admin_algures());

revoke all on public.pessoas_trello, public.atribuicoes_trello,
  public.membros_trello, public.pessoas_trello_resumo from anon;

grant select on public.pessoas_trello_resumo to authenticated;

revoke execute on function
  public.associar_pessoa_trello(text, uuid),
  public.desassociar_pessoa_trello(text)
from public, anon;

grant execute on function
  public.associar_pessoa_trello(text, uuid),
  public.desassociar_pessoa_trello(text)
to authenticated;
