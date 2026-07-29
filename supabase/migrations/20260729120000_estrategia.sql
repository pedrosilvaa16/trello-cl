-- Separador «Estratégia»: onde o contexto de cada cliente se cura.
--
-- Nesta fase não há modelo de linguagem nenhum ligado. O que se constrói é o
-- sítio onde vive o contexto que um dia o alimentará — a estratégia, a voz da
-- marca, o porquê de cada referência, o que funcionou e o que não funcionou.
-- A parte cara fica para depois de se saber se isto se usa.
--
-- ACESSO: só quem gere o quadro. Não é "vê e não pode editar" — é não saber
-- que existe. Um cliente comentador ou um freelancer não têm nada que ver o
-- documento onde se discute a estratégia da conta deles, e um separador
-- desativado no cabeçalho já conta essa história. Daí as políticas serem todas
-- `pode_gerir_quadro` e as rotas responderem 404 em vez de 403: um 403 confirma
-- que o recurso existe.

-- ---------------------------------------------------------------------------
-- O documento macro de cada quadro
-- ---------------------------------------------------------------------------

create table public.board_contexto (
  board_id        uuid primary key references public.boards (id) on delete cascade,
  estrategia      text,
  voz_marca       text,
  atualizado_por  uuid references public.profiles (id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

comment on table public.board_contexto is
  'Estratégia e voz da marca de um quadro. Uma linha por quadro, criada à primeira gravação.';

-- ---------------------------------------------------------------------------
-- Tipar as listas, em vez de as procurar pelo nome
-- ---------------------------------------------------------------------------

/*
  Os quadros não têm listas com nomes iguais entre si — «Ideias e Referências»
  num, «Inspiração» noutro, «Referências ⭐» num terceiro. Código que procure a
  lista pelo nome parte no primeiro quadro que fuja ao padrão, e parte em
  silêncio: devolve zero referências e ninguém percebe porquê.

  O tipo é uma propriedade da lista, posta uma vez e depois esquecida.
*/
alter table public.lists
  add column tipo text not null default 'normal'
    check (tipo in ('normal', 'referencias', 'publicados'));

comment on column public.lists.tipo is
  'Para que serve esta lista na montagem de contexto. Só muda por definir_tipo_lista().';

create index lists_board_tipo_idx on public.lists (board_id, tipo);

/*
  Heurística de arranque, e só isso: marca o que der para adivinhar pelo nome,
  para os 18 quadros não começarem do zero. A partir daqui é a gestora que
  corrige na interface — este bloco corre uma vez e nunca mais.

  Os `_` em vez das letras acentuadas são de propósito: o ILIKE não normaliza
  acentos e não vale instalar a extensão `unaccent` por causa de um UPDATE que
  corre uma vez. `lan_ad` apanha «lançad» e «lancad»; `refer` apanha
  «referência», «referencias» e «referências» sem se preocupar com o «ê».
*/
update public.lists
set tipo = 'referencias'
where tipo = 'normal'
  and (nome ilike '%refer%' or nome ilike '%ideia%' or nome ilike '%inspira%');

update public.lists
set tipo = 'publicados'
where tipo = 'normal'
  and (nome ilike '%public%' or nome ilike '%lan_ad%' or nome ilike '%feito%');

-- ---------------------------------------------------------------------------
-- O porquê de cada referência
-- ---------------------------------------------------------------------------

/*
  Uma referência sem o porquê é uma imagem bonita. O que serve de contexto não
  é «este post», é «este post, porque o tom é seco e resultou». É o campo mais
  vazio de todos e o que mais decide a qualidade do que vier a sair daqui.
*/
alter table public.cards
  add column referencia_porque text check (char_length(referencia_porque) <= 2000),
  add column referencia_url text check (char_length(referencia_url) <= 2000);

comment on column public.cards.referencia_porque is
  'Porque é que este cartão é uma referência. Só muda por definir_referencia_cartao().';

/*
  Fecho por coluna, como `cards.capa_*` e `profiles.papel_global`.

  Sem isto, a política de UPDATE de `cards` — que deixa passar qualquer editor
  — dava a um editor a escrita nestes campos. E o separador é de gestores.

  A lista repete a de 20260728180000 com as duas colunas novas de fora. As
  colunas `capa_*` continuam igualmente fora, como lá ficaram.
*/
revoke update on public.cards from authenticated;
grant update (list_id, titulo, descricao, posicao, data_limite, concluido, arquivado)
  on public.cards to authenticated;

-- Mesma coisa para `lists`: o tipo é configuração de estratégia, não conteúdo.
revoke update on public.lists from authenticated;
grant update (nome, posicao, arquivada) on public.lists to authenticated;

-- ---------------------------------------------------------------------------
-- Aprendizagens
-- ---------------------------------------------------------------------------

create table public.aprendizagens (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id) on delete cascade,
  texto       text not null check (char_length(texto) between 1 and 2000),
  tipo        text not null check (tipo in ('funcionou', 'nao_funcionou', 'nota')),
  criado_por  uuid references public.profiles (id) on delete set null,
  criado_em   timestamptz not null default now()
);

create index aprendizagens_board_idx on public.aprendizagens (board_id, criado_em desc);

comment on table public.aprendizagens is
  'O que resultou e o que não resultou neste cliente. Entra no contexto tal como está escrito.';

-- ---------------------------------------------------------------------------
-- Gerações
-- ---------------------------------------------------------------------------

/*
  Preparada agora, usada quando o modelo entrar. O gerador simulado já escreve
  aqui exatamente como o real escreverá — incluindo o retrato do contexto e o
  respetivo hash — para a persistência estar testada quando chegar a altura, e
  não ser a primeira coisa a descobrir-se partida no dia em que custa dinheiro.

  `contexto_snapshot` guarda o que foi enviado, e não uma referência ao que
  existia: o contexto muda, e uma resposta má só se explica olhando para a
  entrada que a produziu.
*/
create table public.geracoes (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references public.boards (id) on delete cascade,
  card_id            uuid references public.cards (id) on delete set null,
  tarefa             text not null,
  contexto_snapshot  jsonb not null,
  contexto_hash      text not null,
  pedido             text,
  resposta           text,
  modelo             text,
  tokens_entrada     int,
  tokens_saida       int,
  avaliacao          smallint check (avaliacao between -1 and 1),
  criado_por         uuid references public.profiles (id) on delete set null,
  criado_em          timestamptz not null default now()
);

create index geracoes_board_idx on public.geracoes (board_id, criado_em desc);

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.board_contexto enable row level security;
alter table public.aprendizagens  enable row level security;
alter table public.geracoes       enable row level security;

revoke all on public.board_contexto, public.aprendizagens, public.geracoes from anon;

/*
  Uma regra só, em todas: `pode_gerir_quadro`. Já contempla o super_admin, que
  é gestor de qualquer quadro, e já devolve falso para conta desativada.

  Não há política de SELECT mais aberta do que a de escrita — de propósito. Ver
  a estratégia é tão restrito como escrevê-la.
*/

create policy "so quem gere o quadro ve o contexto"
  on public.board_contexto for select to authenticated
  using (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro escreve o contexto"
  on public.board_contexto for insert to authenticated
  with check (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro altera o contexto"
  on public.board_contexto for update to authenticated
  using (public.pode_gerir_quadro(board_id))
  with check (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro ve as aprendizagens"
  on public.aprendizagens for select to authenticated
  using (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro cria aprendizagens"
  on public.aprendizagens for insert to authenticated
  with check (public.pode_gerir_quadro(board_id) and criado_por = (select auth.uid()));

create policy "so quem gere o quadro altera aprendizagens"
  on public.aprendizagens for update to authenticated
  using (public.pode_gerir_quadro(board_id))
  with check (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro apaga aprendizagens"
  on public.aprendizagens for delete to authenticated
  using (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro ve as geracoes"
  on public.geracoes for select to authenticated
  using (public.pode_gerir_quadro(board_id));

create policy "so quem gere o quadro grava geracoes"
  on public.geracoes for insert to authenticated
  with check (public.pode_gerir_quadro(board_id) and criado_por = (select auth.uid()));

-- Uma geração é o registo do que aconteceu; só a avaliação se altera depois.
create policy "so quem gere o quadro avalia geracoes"
  on public.geracoes for update to authenticated
  using (public.pode_gerir_quadro(board_id))
  with check (public.pode_gerir_quadro(board_id));

-- ===========================================================================
-- ESCRITAS QUE NÃO CABEM NUMA POLÍTICA
-- ===========================================================================

/*
  As duas funções abaixo existem porque as colunas que escrevem estão fora do
  GRANT de UPDATE das respetivas tabelas. É a mesma técnica de `capa_*`: a
  política de UPDATE de `cards` e de `lists` deixa passar um editor, e estas
  colunas são de quem gere o quadro.
*/

create or replace function public.definir_tipo_lista(p_lista uuid, p_tipo text)
returns public.lists
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid;
  v_linha public.lists;
begin
  select board_id into v_quadro from public.lists where id = p_lista;
  if v_quadro is null then
    raise exception 'Lista inexistente.' using errcode = 'no_data_found';
  end if;

  if not public.pode_gerir_quadro(v_quadro) then
    raise exception 'Só quem gere o quadro pode tipar as listas.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_tipo not in ('normal', 'referencias', 'publicados') then
    raise exception 'Tipo de lista desconhecido.' using errcode = 'check_violation';
  end if;

  update public.lists set tipo = p_tipo where id = p_lista returning * into v_linha;
  return v_linha;
end;
$$;

revoke execute on function public.definir_tipo_lista(uuid, text) from public, anon;
grant execute on function public.definir_tipo_lista(uuid, text) to authenticated;

create or replace function public.definir_referencia_cartao(
  p_cartao uuid,
  p_porque text default null,
  p_url text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid := public.quadro_do_cartao(p_cartao);
  v_porque text := nullif(trim(coalesce(p_porque, '')), '');
  v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if v_quadro is null then
    raise exception 'Cartão inexistente.' using errcode = 'no_data_found';
  end if;

  if not public.pode_gerir_quadro(v_quadro) then
    raise exception 'Só quem gere o quadro pode anotar referências.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.cards
  set referencia_porque = v_porque,
      referencia_url = v_url
  where id = p_cartao;

  return json_build_object('referencia_porque', v_porque, 'referencia_url', v_url);
end;
$$;

revoke execute on function public.definir_referencia_cartao(uuid, text, text)
  from public, anon;
grant execute on function public.definir_referencia_cartao(uuid, text, text)
  to authenticated;

/*
  Guardar a estratégia e a voz da marca.

  É um upsert porque a linha nasce à primeira gravação — criar uma linha vazia
  por quadro no momento em que o quadro é criado daria 18 linhas a dizer nada,
  e mais um sítio por onde a criação de um quadro podia falhar.

  Passa por função e não por escrita direta só por causa de `atualizado_por` e
  `atualizado_em`: postos aqui, não há como gravar por cima do trabalho de
  outra pessoa e ficar com o nome dela no ecrã.
*/
create or replace function public.guardar_contexto_quadro(
  p_quadro uuid,
  p_estrategia text default null,
  p_voz_marca text default null
)
returns public.board_contexto
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.board_contexto;
begin
  if not public.pode_gerir_quadro(p_quadro) then
    raise exception 'Só quem gere o quadro pode escrever a estratégia.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.board_contexto (board_id, estrategia, voz_marca, atualizado_por)
  values (
    p_quadro,
    nullif(trim(coalesce(p_estrategia, '')), ''),
    nullif(trim(coalesce(p_voz_marca, '')), ''),
    (select auth.uid())
  )
  on conflict (board_id) do update
    set estrategia = excluded.estrategia,
        voz_marca = excluded.voz_marca,
        atualizado_por = excluded.atualizado_por,
        atualizado_em = now()
  returning * into v_linha;

  return v_linha;
end;
$$;

revoke execute on function public.guardar_contexto_quadro(uuid, text, text)
  from public, anon;
grant execute on function public.guardar_contexto_quadro(uuid, text, text)
  to authenticated;
