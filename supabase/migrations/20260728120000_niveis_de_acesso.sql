-- Níveis de acesso: dois eixos, não uma lista de papéis.
--
-- EIXO A — papel global (profiles.papel_global). O que a pessoa pode fazer no
-- sistema: super_admin gere toda a gente e vê tudo; admin cria quadros e gere
-- os seus; externo não tem poderes próprios.
--
-- EIXO B — papel por recurso (board_members.papel, card_access.papel). O que a
-- pessoa pode fazer num quadro ou num cartão concreto: gestor, editor,
-- comentador, leitor.
--
-- "Cliente" e "freelancer" não são papéis, são combinações: um cliente é
-- externo + comentador no quadro dele; um freelancer é externo + editor em
-- cartões soltos. É de propósito — quem muda de função resolve-se com uma
-- linha nova, não com uma exceção no código.
--
-- A reversão desta migração vive em supabase/reverter/, fora do diretório que
-- o `supabase db push` aplica.

-- ---------------------------------------------------------------------------
-- Eixo B: o enum do papel por recurso
-- ---------------------------------------------------------------------------

/*
  Duas mudanças de uma vez, e por isso um tipo novo em vez de dois ALTER TYPE:

  1. 'admin' passa a 'gestor'. O papel de quadro chamava-se igual ao papel
     global que esta migração introduz, e são poderes diferentes — um gestor
     manda no quadro dele, um admin cria quadros. Ler `papel = 'admin'` e ter
     de perceber de qual dos dois se falava era um erro à espera de acontecer.
  2. 'comentador' entra entre 'editor' e 'leitor'.

  `alter type ... add value` não deixa usar o valor novo na mesma transação em
  que o acrescenta, e `rename value` não reordena nada. Criar o tipo, converter
  as colunas e trocar os nomes faz as duas coisas numa transação só.
*/

create type public.papel_quadro_novo as enum (
  'gestor',      -- tudo no quadro, incluindo convidar e remover pessoas
  'editor',      -- cria e edita cartões, comenta, anexa
  'comentador',  -- lê tudo e comenta; não cria nem edita cartões
  'leitor'       -- só lê
);

-- Estas duas devolvem papel_quadro e por isso bloqueiam o drop do tipo antigo.
-- São recriadas mais abaixo: papel_no_quadro já com a regra do super_admin,
-- convite_por_token a mostrar também o papel global que o convite traz.
drop function if exists public.papel_no_quadro(uuid);
drop function if exists public.convite_por_token(text);

alter table public.board_members  alter column papel drop default;
alter table public.convites       alter column papel drop default;
alter table public.membros_trello alter column papel drop default;

alter table public.board_members
  alter column papel type public.papel_quadro_novo
  using (case papel::text when 'admin' then 'gestor' else papel::text end)::public.papel_quadro_novo;

alter table public.convites
  alter column papel type public.papel_quadro_novo
  using (case papel::text when 'admin' then 'gestor' else papel::text end)::public.papel_quadro_novo;

alter table public.membros_trello
  alter column papel type public.papel_quadro_novo
  using (case papel::text when 'admin' then 'gestor' else papel::text end)::public.papel_quadro_novo;

alter table public.board_members  alter column papel set default 'editor';
alter table public.convites       alter column papel set default 'editor';
alter table public.membros_trello alter column papel set default 'editor';

drop type public.papel_quadro;
alter type public.papel_quadro_novo rename to papel_quadro;

comment on type public.papel_quadro is
  'Eixo B: o que a pessoa pode fazer num quadro ou cartão concreto.';

-- ---------------------------------------------------------------------------
-- Eixo A: o papel global
-- ---------------------------------------------------------------------------

create type public.papel_global as enum ('super_admin', 'admin', 'externo');

comment on type public.papel_global is
  'Eixo A: o que a pessoa pode fazer no sistema, independentemente dos quadros.';

alter table public.profiles
  add column papel_global public.papel_global not null default 'externo',
  -- Utilizadores não se apagam: apagar quebra a autoria dos comentários e o
  -- histórico dos cartões. Desativado não entra e deixa de contar como membro,
  -- mas o nome continua a aparecer no que escreveu.
  add column ativo boolean not null default true,
  add column ultimo_acesso timestamptz;

comment on column public.profiles.papel_global is
  'super_admin gere pessoas e vê tudo; admin cria e gere os seus quadros; externo só vê o que lhe deram.';
comment on column public.profiles.ativo is
  'Falso = não entra e não conta como membro. O nome continua a aparecer no que escreveu.';

-- O painel /pessoas filtra por papel, quase sempre sobre contas ativas.
create index profiles_papel_global_idx on public.profiles (papel_global) where ativo;

/*
  FECHO DA ESCALADA DE PRIVILÉGIOS.

  A política "cada um edita o seu perfil" deixa cada pessoa fazer UPDATE à sua
  própria linha — o que, a partir de agora, incluiria `papel_global`. Qualquer
  utilizador se promovia a super_admin com uma chamada do browser.

  O RLS não distingue colunas; os GRANTs distinguem. Tirar o UPDATE da tabela e
  devolvê-lo só sobre `nome` e `avatar_url` fecha isto na raiz: a política
  continua a passar, o privilégio é que já não existe. As três colunas novas só
  mudam por dentro das funções SECURITY DEFINER mais abaixo.
*/
revoke update on public.profiles from authenticated;
grant update (nome, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Convites: papel global e acessos a conceder no resgate
-- ---------------------------------------------------------------------------

alter table public.convites
  add column papel_global public.papel_global not null default 'externo';

comment on column public.convites.papel_global is
  'Papel global que a conta recebe ao resgatar. Só um super_admin o pode pôr acima de externo.';

/*
  Mesmo problema, mesma solução: sem isto, um admin criava um convite com
  papel_global = 'super_admin' por insert direto e promovia-se na conta
  seguinte. A coluna só se preenche pela função criar_convite().
*/
revoke insert on public.convites from authenticated;
grant insert (email, board_id, papel, token, expira_em, criado_por)
  on public.convites to authenticated;

/*
  "Convite: email, papel global, e a que quadros ou cartões dá acesso, tudo no
  mesmo passo." `convites.board_id` só chega para um quadro; isto guarda o
  resto, e é aplicado no resgate.
*/
create table public.convite_acessos (
  id          uuid primary key default gen_random_uuid(),
  convite_id  uuid not null references public.convites (id) on delete cascade,
  board_id    uuid references public.boards (id) on delete cascade,
  card_id     uuid references public.cards (id) on delete cascade,
  papel       public.papel_quadro not null default 'editor',
  expira_em   timestamptz,
  criado_em   timestamptz not null default now(),
  -- Um acesso é a um quadro ou a um cartão, nunca aos dois nem a nenhum.
  constraint convite_acessos_alvo check (num_nonnulls(board_id, card_id) = 1)
);

create index convite_acessos_convite_idx on public.convite_acessos (convite_id);

-- ---------------------------------------------------------------------------
-- cards.board_id
-- ---------------------------------------------------------------------------

/*
  Desnormalização deliberada. Sem ela, cada verificação de RLS num cartão faz
  um join até `lists` para descobrir o quadro — uma vez por linha, em todas as
  consultas do quadro. Com alguns milhares de cartões nota-se.

  É mantida por trigger nos dois sentidos: quando um cartão muda de lista, e
  quando uma lista muda de quadro. O segundo caso não acontece pela interface,
  mas um board_id desatualizado aqui é um cartão visível a quem não devia — não
  é sítio para confiar em que "nunca acontece".
*/
alter table public.cards
  add column board_id uuid references public.boards (id) on delete cascade;

update public.cards c
set board_id = l.board_id
from public.lists l
where l.id = c.list_id;

alter table public.cards alter column board_id set not null;

create index cards_board_id_idx on public.cards (board_id);

comment on column public.cards.board_id is
  'Cópia de lists.board_id, mantida por trigger. Existe para o RLS não ter de fazer o join.';

create or replace function public.cartao_herdar_quadro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select l.board_id into new.board_id
  from public.lists l
  where l.id = new.list_id;

  -- Lista inexistente (ou invisível a quem escreve) deixa board_id a nulo e a
  -- restrição NOT NULL recusa a linha. Falhar é o comportamento certo.
  return new;
end;
$$;

create trigger cards_herdar_quadro
  before insert or update of list_id on public.cards
  for each row
  execute function public.cartao_herdar_quadro();

create or replace function public.lista_propagar_quadro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.board_id is distinct from old.board_id then
    update public.cards set board_id = new.board_id where list_id = new.id;
  end if;
  return new;
end;
$$;

create trigger lists_propagar_quadro
  after update of board_id on public.lists
  for each row
  execute function public.lista_propagar_quadro();

-- ---------------------------------------------------------------------------
-- Acesso a cartões soltos
-- ---------------------------------------------------------------------------

/*
  O caso do freelancer: acesso a cartões concretos sem acesso ao quadro à volta.
  `expira_em` é o que faz um trabalho pontual terminar sozinho — sem ninguém se
  lembrar de o revogar.
*/
create table public.card_access (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.cards (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  papel          public.papel_quadro not null default 'editor',
  concedido_por  uuid references public.profiles (id) on delete set null,
  expira_em      timestamptz,
  criado_em      timestamptz not null default now(),
  unique (card_id, user_id)
);

create index card_access_user_card_idx on public.card_access (user_id, card_id);

comment on table public.card_access is
  'Acesso a um cartão sem acesso ao quadro. Válido enquanto expira_em for nulo ou futuro.';

-- ---------------------------------------------------------------------------
-- Registo de alterações de acesso
-- ---------------------------------------------------------------------------

create table public.acessos_log (
  id         bigserial primary key,
  ator_id    uuid references public.profiles (id) on delete set null,
  alvo_id    uuid references public.profiles (id) on delete set null,
  accao      text not null,
  detalhe    jsonb,
  criado_em  timestamptz not null default now()
);

create index acessos_log_alvo_idx on public.acessos_log (alvo_id, criado_em desc);
create index acessos_log_ator_idx on public.acessos_log (ator_id, criado_em desc);

comment on table public.acessos_log is
  'Toda a alteração de acesso passa por aqui. Escrito só pelas funções SECURITY DEFINER.';

-- Ninguém escreve aqui diretamente: um registo que o próprio ator pudesse
-- forjar ou apagar não serviria de registo nenhum.
revoke insert, update, delete on public.acessos_log from authenticated, anon;
revoke usage, select on sequence public.acessos_log_id_seq from authenticated, anon;

-- ---------------------------------------------------------------------------
-- board_members(user_id, board_id)
-- ---------------------------------------------------------------------------

-- A chave primária é (board_id, user_id) e serve as consultas por quadro. Este
-- serve o sentido contrário — "que quadros é que esta pessoa vê" — que é o que
-- as funções de permissão perguntam a toda a hora. O índice antigo, só sobre
-- (user_id), passa a ser um prefixo deste e deixa de ter uso.
create index board_members_user_board_idx on public.board_members (user_id, board_id);
drop index public.board_members_user_id_idx;

-- ===========================================================================
-- FUNÇÕES DE PERMISSÃO
-- ===========================================================================

/*
  ATENÇÃO À RECURSÃO. Uma política sobre `profiles` que consultasse `profiles`
  entrava em recursão infinita, e o mesmo vale para `board_members` e para
  `card_access`. Todas as funções abaixo são SECURITY DEFINER: ao correrem como
  dono, as consultas lá dentro não reavaliam RLS e o ciclo não chega a existir.

  `set search_path = ''` com nomes totalmente qualificados, como o resto do
  esquema: é a versão estrita de fixar o search_path, e impede que um schema no
  caminho de quem chama sequestre a resolução dos nomes.

  As chamadas vão embrulhadas em `(select ...)`. É o mesmo truque que o
  `(select auth.uid())` usa por todo o lado: o planeador avalia a subconsulta
  uma vez por comando em vez de uma vez por linha, o que numa política sobre
  milhares de cartões é a diferença entre um quadro que abre e um que arrasta.

  As políticas usam SEMPRE estas funções. Duas cópias da mesma regra que
  divirjam com o tempo são uma falha de segurança silenciosa — por isso há um
  único sítio onde cada regra está escrita, e os casos particulares delegam
  nele em vez de o repetir.

  NENHUMA DELAS DEVOLVE NULL. `papel_no_quadro` devolve nulo para quem não é
  membro, e `nulo in ('gestor','editor')` é nulo, não falso. Numa política isso
  não se nota — o RLS trata nulo como recusa. Mas em PL/pgSQL, `if not <nulo>`
  não entra no ramo: a guarda cala-se e o comando segue. É por isso que todas
  as funções booleanas aqui acabam num `coalesce(..., false)`.
*/

-- ---------------------------------------------------------------------------
-- Eixo A
-- ---------------------------------------------------------------------------

-- Uma conta desativada não tem acesso nenhum, seja qual for o papel ou a
-- pertença. É a primeira coisa que todas as outras funções perguntam.
create or replace function public.conta_activa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo
  );
$$;

create or replace function public.papel_global_atual()
returns public.papel_global
language sql
stable
security definer
set search_path = ''
as $$
  select p.papel_global
  from public.profiles p
  where p.id = (select auth.uid()) and p.ativo;
$$;

comment on function public.papel_global_atual() is
  'O papel global de quem está autenticado. Nulo se a conta estiver desativada.';

-- Devolve verdadeiro para tudo, em todas as funções abaixo.
create or replace function public.e_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.papel_global_atual()) = 'super_admin', false);
$$;

-- Quem pode criar quadros e convidar gente nova para eles.
create or replace function public.e_admin_global()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.papel_global_atual()) in ('super_admin', 'admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- Eixo B: quadros
-- ---------------------------------------------------------------------------

/*
  O núcleo de tudo o que diz respeito a quadros. As três funções a seguir
  limitam-se a ler o papel que esta devolve — não repetem a consulta.

  Um super_admin é gestor de qualquer quadro sem precisar de convite; é o que
  significa "acede a todos os quadros sem precisar de convite".
*/
create or replace function public.papel_no_quadro(board_id uuid)
returns public.papel_quadro
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (select public.conta_activa()) then null
    when (select public.e_super_admin()) then 'gestor'::public.papel_quadro
    else (
      select m.papel
      from public.board_members m
      where m.board_id = papel_no_quadro.board_id
        and m.user_id = (select auth.uid())
    )
  end;
$$;

create or replace function public.pode_aceder_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.papel_no_quadro(pode_aceder_quadro.board_id) is not null;
$$;

-- gestor e editor escrevem; comentador e leitor não.
create or replace function public.pode_editar_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.papel_no_quadro(pode_editar_quadro.board_id) in ('gestor', 'editor'),
    false
  );
$$;

-- Convidar, remover pessoas, apagar o quadro.
create or replace function public.pode_gerir_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.papel_no_quadro(pode_gerir_quadro.board_id) = 'gestor', false);
$$;

/*
  As políticas de `boards`, `board_members` e `convites` foram escritas contra
  este nome e continuam intocadas. Delega — não é uma segunda implementação da
  mesma regra, é o mesmo sítio com dois nomes enquanto o nome antigo tiver uso.
*/
create or replace function public.e_admin_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pode_gerir_quadro(e_admin_quadro.board_id);
$$;

-- ---------------------------------------------------------------------------
-- Eixo B: cartões
-- ---------------------------------------------------------------------------

-- O quadro de um cartão, agora sem join: é para isto que cards.board_id existe.
create or replace function public.quadro_do_cartao(cartao uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.board_id from public.cards c where c.id = quadro_do_cartao.cartao;
$$;

-- Acesso concedido ao cartão em si, sem passar pelo quadro. Um acesso expirado
-- deixa de contar sem que ninguém tenha de o ir revogar.
create or replace function public.papel_no_cartao_directo(p_cartao uuid)
returns public.papel_quadro
language sql
stable
security definer
set search_path = ''
as $$
  select a.papel
  from public.card_access a
  where a.card_id = p_cartao
    and a.user_id = (select auth.uid())
    and (a.expira_em is null or a.expira_em > now())
    and (select public.conta_activa());
$$;

/*
  O papel que vale num cartão: o mais forte entre o que vem do quadro e o que
  foi concedido ao cartão. `min` sobre o enum devolve exatamente isso, porque a
  ordem declarada vai do mais forte (gestor) para o mais fraco (leitor), e
  ignora os nulos — quem só tem um dos dois fica com esse.
*/
create or replace function public.papel_efectivo_no_cartao(p_cartao uuid, p_quadro uuid)
returns public.papel_quadro
language sql
stable
security definer
set search_path = ''
as $$
  select min(papel)
  from (values
    (public.papel_no_quadro(p_quadro)),
    (public.papel_no_cartao_directo(p_cartao))
  ) as papeis (papel);
$$;

/*
  As variantes `_em` recebem o board_id que a política já tem à mão na linha;
  as outras descobrem-no. Mesmo corpo, dois pontos de entrada — a política de
  `cards` não precisa de reler o cartão para saber a que quadro pertence.
*/
create or replace function public.pode_aceder_cartao_em(p_cartao uuid, p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- O `or` curto-circuita: para um membro do quadro — o caso comum — fica-se
  -- pela primeira consulta e o card_access nem chega a ser tocado.
  select public.papel_no_quadro(p_quadro) is not null
      or public.papel_no_cartao_directo(p_cartao) is not null;
$$;

create or replace function public.pode_editar_cartao_em(p_cartao uuid, p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.papel_efectivo_no_cartao(p_cartao, p_quadro) in ('gestor', 'editor'),
    false
  );
$$;

/*
  Os comentários são o caso próprio de que a especificação fala: um comentador
  passa em `pode_aceder_*`, falha em `pode_editar_*` e mesmo assim escreve
  comentários. É a definição de "cliente" — vê o quadro dele e responde nos
  cartões, sem lhes poder mexer.
*/
create or replace function public.pode_comentar_cartao_em(p_cartao uuid, p_quadro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.papel_efectivo_no_cartao(p_cartao, p_quadro)
      in ('gestor', 'editor', 'comentador'),
    false
  );
$$;

create or replace function public.pode_aceder_cartao(p_cartao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pode_aceder_cartao_em(p_cartao, public.quadro_do_cartao(p_cartao));
$$;

create or replace function public.pode_editar_cartao(p_cartao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pode_editar_cartao_em(p_cartao, public.quadro_do_cartao(p_cartao));
$$;

create or replace function public.pode_comentar_cartao(p_cartao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pode_comentar_cartao_em(p_cartao, public.quadro_do_cartao(p_cartao));
$$;

-- ---------------------------------------------------------------------------
-- Funções existentes que passam a conhecer os dois eixos
-- ---------------------------------------------------------------------------

/*
  Um super_admin vê o perfil de toda a gente — sem isto, o painel de pessoas
  ficava vazio para quem existe precisamente para o usar.

  O outro utilizador não é filtrado por `ativo` de propósito: uma conta
  desativada continua a ter de mostrar o nome nos comentários que escreveu.
  Quem deixa de contar como membro é filtrado onde os membros são listados, não
  aqui, onde o que está em causa é só saber a quem pertence um nome.
*/
create or replace function public.partilha_quadro(outro_utilizador uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.e_super_admin()), false)
      -- A regra base, como sempre foi: pertença ao mesmo quadro.
      or exists (
        select 1
        from public.board_members meu
        join public.board_members dele on dele.board_id = meu.board_id
        where meu.user_id = (select auth.uid())
          and dele.user_id = partilha_quadro.outro_utilizador
      )
      -- Quem manda no quadro vê o freelancer a quem foi dado um cartão dele.
      -- Sem isto, o painel mostrava um acesso concedido a um nome em branco.
      or exists (
        select 1
        from public.card_access dele
        join public.cards c on c.id = dele.card_id
        where dele.user_id = partilha_quadro.outro_utilizador
          and public.papel_no_quadro(c.board_id) is not null
      )
      -- E o freelancer vê quem lhe deu o acesso e quem está do outro lado do
      -- cartão em que trabalha — nada mais do quadro à volta.
      or exists (
        select 1
        from public.card_access meu
        where meu.user_id = (select auth.uid())
          and (meu.expira_em is null or meu.expira_em > now())
          and (
            meu.concedido_por = partilha_quadro.outro_utilizador
            or exists (
              select 1 from public.comments cm
              where cm.card_id = meu.card_id
                and cm.autor_id = partilha_quadro.outro_utilizador
            )
            or exists (
              select 1 from public.card_members cmb
              where cmb.card_id = meu.card_id
                and cmb.user_id = partilha_quadro.outro_utilizador
            )
          )
      );
$$;

-- Só se atribui um cartão a quem já pertence ao quadro, e a quem está ativo:
-- atribuir trabalho a uma conta desativada é criar uma tarefa sem dono.
create or replace function public.e_membro_do_quadro(quadro uuid, utilizador uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    join public.profiles p on p.id = m.user_id
    where m.board_id = e_membro_do_quadro.quadro
      and m.user_id = e_membro_do_quadro.utilizador
      and p.ativo
  );
$$;

/*
  Quem pode convidar gente para a plataforma. Deixou de ser só "admin de algum
  quadro": um admin global convida para os quadros que gere, e um super_admin
  convida quem quiser. Um gestor de quadro continua a poder convidar para o
  quadro dele, mesmo sendo externo — é o que "tudo no quadro, incluindo
  convidar" quer dizer.
*/
create or replace function public.e_admin_algures()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.e_admin_global()), false)
      or (
        (select public.conta_activa())
        and exists (
          select 1
          from public.board_members m
          where m.user_id = (select auth.uid())
            and m.papel = 'gestor'
        )
      );
$$;

-- Um quadro sem gestor fica sem ninguém que o possa gerir ou apagar. Contam só
-- os gestores ativos: um quadro cujo único gestor foi desativado está tão sem
-- gestor como um que não tenha nenhum.
create or replace function public.impedir_quadro_sem_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestores_restantes integer;
  v_resultado public.board_members;
begin
  v_resultado := case when tg_op = 'DELETE' then old else new end;

  if tg_op = 'UPDATE' and new.papel = 'gestor' then
    return v_resultado;
  end if;

  if old.papel <> 'gestor' then
    return v_resultado;
  end if;

  -- Apagar o quadro (ou a conta) apaga estas linhas em cascata; aí a regra não
  -- se aplica, senão o único gestor nunca conseguiria apagar o próprio quadro.
  if not exists (select 1 from public.boards b where b.id = old.board_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return v_resultado;
  end if;

  select count(*) into v_gestores_restantes
  from public.board_members m
  join public.profiles p on p.id = m.user_id
  where m.board_id = old.board_id
    and m.papel = 'gestor'
    and m.user_id <> old.user_id
    and p.ativo;

  if v_gestores_restantes = 0 then
    raise exception 'Este é o único gestor do quadro. Promove outro membro primeiro.'
      using errcode = 'check_violation';
  end if;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------

revoke execute on function
  public.conta_activa(),
  public.papel_global_atual(),
  public.e_super_admin(),
  public.e_admin_global(),
  public.papel_no_quadro(uuid),
  public.pode_aceder_quadro(uuid),
  public.pode_editar_quadro(uuid),
  public.pode_gerir_quadro(uuid),
  public.e_admin_quadro(uuid),
  public.quadro_do_cartao(uuid),
  public.papel_no_cartao_directo(uuid),
  public.papel_efectivo_no_cartao(uuid, uuid),
  public.pode_aceder_cartao_em(uuid, uuid),
  public.pode_editar_cartao_em(uuid, uuid),
  public.pode_comentar_cartao_em(uuid, uuid),
  public.pode_aceder_cartao(uuid),
  public.pode_editar_cartao(uuid),
  public.pode_comentar_cartao(uuid),
  public.partilha_quadro(uuid),
  public.e_membro_do_quadro(uuid, uuid),
  public.e_admin_algures()
from public, anon;

grant execute on function
  public.conta_activa(),
  public.papel_global_atual(),
  public.e_super_admin(),
  public.e_admin_global(),
  public.papel_no_quadro(uuid),
  public.pode_aceder_quadro(uuid),
  public.pode_editar_quadro(uuid),
  public.pode_gerir_quadro(uuid),
  public.e_admin_quadro(uuid),
  public.quadro_do_cartao(uuid),
  public.papel_no_cartao_directo(uuid),
  public.papel_efectivo_no_cartao(uuid, uuid),
  public.pode_aceder_cartao_em(uuid, uuid),
  public.pode_editar_cartao_em(uuid, uuid),
  public.pode_comentar_cartao_em(uuid, uuid),
  public.pode_aceder_cartao(uuid),
  public.pode_editar_cartao(uuid),
  public.pode_comentar_cartao(uuid),
  public.partilha_quadro(uuid),
  public.e_membro_do_quadro(uuid, uuid),
  public.e_admin_algures()
to authenticated;

-- ===========================================================================
-- POLÍTICAS RLS
-- ===========================================================================

/*
  As políticas de `boards`, `board_members`, `lists`, `labels`, `card_labels`,
  `card_members`, `convites`, `profiles` e `dominios_permitidos` ficam como
  estavam, palavra por palavra. Só mudou o que as funções que elas chamam
  respondem — que é o sítio certo para as regras mudarem.

  Mudam três tabelas, porque nenhuma delas podia ficar como estava:

  - `cards`     — passa a ler `board_id` em vez de subir até `lists`, e passa a
                  conhecer o acesso ao cartão solto.
  - `comments`  — o comentador tem de poder comentar sem poder editar, e isso
                  não cabe em `pode_editar_quadro`.
  - `attachments` — segue o cartão, para o freelancer poder abrir e entregar
                  ficheiros no cartão em que trabalha.

  E `boards` perde o INSERT aberto a toda a gente: criar quadros passa a ser
  dos papéis globais, e um externo não tem poderes próprios.
*/

alter table public.card_access     enable row level security;
alter table public.acessos_log     enable row level security;
alter table public.convite_acessos enable row level security;

revoke all on public.card_access, public.acessos_log, public.convite_acessos from anon;

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------

drop policy "membros veem os cartoes"   on public.cards;
drop policy "editores criam cartoes"    on public.cards;
drop policy "editores alteram cartoes"  on public.cards;
drop policy "editores apagam cartoes"   on public.cards;

create policy "quem tem acesso ve o cartao"
  on public.cards for select to authenticated
  using (public.pode_aceder_cartao_em(id, board_id));

-- Criar continua a ser trabalho de quadro: o acesso a um cartão solto não dá
-- para semear cartões novos ao lado dele. O board_id ainda não existe na linha
-- nova (é o trigger que o põe), por isso a verificação sobe pela lista.
create policy "editores criam cartoes"
  on public.cards for insert to authenticated
  with check (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

/*
  USING olha para o cartão como ele está — e é aí que o acesso solto conta.
  WITH CHECK olha para o destino: quem só tem o cartão não o pode empurrar para
  dentro de um quadro onde não escreve.

  Mudar de lista é caso à parte e está no trigger `cards_mover_so_do_quadro`:
  numa política não há como comparar o destino com a origem.
*/
create policy "editores alteram cartoes"
  on public.cards for update to authenticated
  using (public.pode_editar_cartao_em(id, board_id))
  with check (
    public.pode_editar_quadro(public.quadro_da_lista(list_id))
    or public.papel_no_cartao_directo(id) in ('gestor', 'editor')
  );

create policy "editores apagam cartoes"
  on public.cards for delete to authenticated
  using (public.pode_editar_quadro(board_id));

/*
  Quem tem o cartão e não tem o quadro edita-o onde ele está, e não o arrasta
  para outro sítio. Sem isto, um freelancer com `editor` num cartão movia-o
  para uma lista de um quadro qualquer — a política de UPDATE só vê a linha
  nova e não tem como saber de onde ela veio.
*/
create or replace function public.impedir_mover_cartao_sem_quadro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.list_id is distinct from old.list_id
     and not public.pode_editar_quadro(old.board_id) then
    raise exception 'Só quem pode editar o quadro é que muda um cartão de lista.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger cards_mover_so_do_quadro
  before update of list_id on public.cards
  for each row
  execute function public.impedir_mover_cartao_sem_quadro();

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

drop policy "membros leem comentarios"          on public.comments;
drop policy "editores comentam em nome proprio" on public.comments;
drop policy "cada um edita os seus comentarios" on public.comments;
drop policy "cada um apaga os seus comentarios" on public.comments;

create policy "quem tem acesso ao cartao le os comentarios"
  on public.comments for select to authenticated
  using (public.pode_aceder_cartao(card_id));

-- O caso próprio: o comentador entra aqui e não entra em mais lado nenhum.
create policy "comentadores comentam em nome proprio"
  on public.comments for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and public.pode_comentar_cartao(card_id)
  );

-- Editar e apagar: só os próprios, e só com a conta ativa.
create policy "cada um edita os seus comentarios"
  on public.comments for update to authenticated
  using (autor_id = (select auth.uid()) and public.conta_activa())
  with check (autor_id = (select auth.uid()));

create policy "cada um apaga os seus comentarios"
  on public.comments for delete to authenticated
  using (autor_id = (select auth.uid()) and public.conta_activa());

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------

drop policy "membros veem anexos"        on public.attachments;
drop policy "editores carregam anexos"   on public.attachments;
drop policy "editores removem anexos"    on public.attachments;

create policy "quem tem acesso ao cartao ve os anexos"
  on public.attachments for select to authenticated
  using (public.pode_aceder_cartao(card_id));

create policy "editores carregam anexos"
  on public.attachments for insert to authenticated
  with check (
    carregado_por = (select auth.uid())
    and public.pode_editar_cartao(card_id)
  );

create policy "editores removem anexos"
  on public.attachments for delete to authenticated
  using (public.pode_editar_cartao(card_id));

-- Continua sem UPDATE: um anexo é imutável.

-- ---------------------------------------------------------------------------
-- boards: criar deixa de ser de toda a gente
-- ---------------------------------------------------------------------------

/*
  "externo — sem poderes próprios." Criar quadros é do eixo A. A política
  antiga deixava qualquer conta autenticada inserir em `boards`; o quadro
  ficava invisível (sem linha em board_members ninguém o vê, nem quem o criou),
  mas ficava lá. Agora não chega a entrar.
*/
drop policy "qualquer colaborador cria quadros" on public.boards;

create policy "admins criam quadros"
  on public.boards for insert to authenticated
  with check (criado_por = (select auth.uid()) and public.e_admin_global());

-- ---------------------------------------------------------------------------
-- card_access
-- ---------------------------------------------------------------------------

-- Cada um vê os acessos que tem; quem gere o quadro vê os que concedeu.
create policy "ve os acessos que tem ou que geriu"
  on public.card_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.pode_gerir_quadro(public.quadro_do_cartao(card_id))
  );

create policy "gestores concedem acesso a cartoes"
  on public.card_access for insert to authenticated
  with check (
    concedido_por = (select auth.uid())
    and public.pode_gerir_quadro(public.quadro_do_cartao(card_id))
  );

create policy "gestores alteram os acessos que concederam"
  on public.card_access for update to authenticated
  using (public.pode_gerir_quadro(public.quadro_do_cartao(card_id)))
  with check (public.pode_gerir_quadro(public.quadro_do_cartao(card_id)));

-- Um gestor revoga; e quem recebeu pode sempre abrir mão do que lhe deram.
create policy "gestores revogam, ou o proprio abre mao"
  on public.card_access for delete to authenticated
  using (
    public.pode_gerir_quadro(public.quadro_do_cartao(card_id))
    or user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- acessos_log
-- ---------------------------------------------------------------------------

-- Um super_admin lê o registo todo; um admin lê o que fez e o que lhe fizeram.
-- Escrever é só das funções SECURITY DEFINER — não há política de INSERT, e o
-- privilégio já foi retirado acima.
create policy "o registo de acessos le-se conforme o papel"
  on public.acessos_log for select to authenticated
  using (
    public.e_super_admin()
    or ator_id = (select auth.uid())
    or alvo_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- convite_acessos
-- ---------------------------------------------------------------------------

create policy "quem ve o convite ve os acessos dele"
  on public.convite_acessos for select to authenticated
  using (
    exists (
      select 1 from public.convites c
      where c.id = convite_id and public.e_admin_algures()
    )
  );

-- Escrito só pela função criar_convite(), que valida quem convida quem.
revoke insert, update, delete on public.convite_acessos from authenticated;

-- ===========================================================================
-- GESTÃO
-- ===========================================================================

/*
  Tudo o que altera acessos passa por aqui, e não por escritas soltas do
  cliente. Não é por comodidade: é o único sítio onde as regras de quem pode
  fazer o quê a quem cabem inteiras — e "a última conta super_admin ativa não
  pode ser desativada nem despromovida" não é uma regra que uma política de RLS
  saiba exprimir.

  As rotas do backend chamam estas funções com a sessão do utilizador. Esconder
  um botão não é uma permissão; isto é.
*/

-- ---------------------------------------------------------------------------
-- Registo
-- ---------------------------------------------------------------------------

create or replace function public.registar_no_log(
  p_accao text,
  p_alvo uuid,
  p_detalhe jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.acessos_log (ator_id, alvo_id, accao, detalhe)
  values ((select auth.uid()), p_alvo, p_accao, p_detalhe);
$$;

-- Só as funções desta secção escrevem no registo. Chamadas de dentro de outra
-- SECURITY DEFINER, a permissão é verificada contra o dono, não contra quem
-- pediu a página — por isso isto não as impede a elas e impede toda a gente.
revoke execute on function public.registar_no_log(text, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Último acesso
-- ---------------------------------------------------------------------------

-- Chamada a cada render de página com sessão. A escrita só acontece de cinco
-- em cinco minutos: a coluna serve para saber quem anda a usar isto, não para
-- cronometrar cliques, e um UPDATE por pedido era um preço absurdo.
create or replace function public.registar_acesso()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set ultimo_acesso = now()
  where id = (select auth.uid())
    and (ultimo_acesso is null or ultimo_acesso < now() - interval '5 minutes');
$$;

grant execute on function public.registar_acesso() to authenticated;

-- ---------------------------------------------------------------------------
-- A última conta super_admin
-- ---------------------------------------------------------------------------

create or replace function public.super_admins_activos()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.profiles
  where papel_global = 'super_admin' and ativo;
$$;

grant execute on function public.super_admins_activos() to authenticated;

-- ---------------------------------------------------------------------------
-- Papel global
-- ---------------------------------------------------------------------------

/*
  Só um super_admin mexe no eixo A. Um admin não promove ninguém — nem a admin,
  nem a super_admin, nem a si próprio — e a verificação está aqui, e não na
  rota, para valer também para quem chame o API diretamente.
*/
create or replace function public.definir_papel_global(
  p_alvo uuid,
  p_papel public.papel_global
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.profiles;
  v_depois public.profiles;
begin
  if not (select public.e_super_admin()) then
    raise exception 'Só um super_admin pode alterar papéis globais.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_antes from public.profiles where id = p_alvo;
  if v_antes.id is null then
    raise exception 'Não existe nenhuma conta com esse id.'
      using errcode = 'no_data_found';
  end if;

  if v_antes.papel_global = p_papel then
    return v_antes;
  end if;

  -- Despromover o último super_admin ativo deixava a plataforma sem ninguém
  -- que pudesse voltar a promover alguém. Não há caminho de volta sem SQL.
  if v_antes.papel_global = 'super_admin'
     and v_antes.ativo
     and (select public.super_admins_activos()) <= 1 then
    raise exception 'É a última conta super_admin ativa. Promove outra pessoa primeiro.'
      using errcode = 'check_violation';
  end if;

  update public.profiles
  set papel_global = p_papel
  where id = p_alvo
  returning * into v_depois;

  perform public.registar_no_log(
    'papel_global',
    p_alvo,
    jsonb_build_object('de', v_antes.papel_global, 'para', p_papel)
  );

  return v_depois;
end;
$$;

grant execute on function public.definir_papel_global(uuid, public.papel_global)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Ativar e desativar
-- ---------------------------------------------------------------------------

/*
  UTILIZADORES NÃO SE APAGAM. Apagar quebra a autoria dos comentários e o
  histórico dos cartões. Desativado não entra e deixa de contar como membro,
  mas o nome continua a aparecer no que escreveu — e é por isso que a linha em
  `profiles` fica onde está.
*/
create or replace function public.definir_estado_conta(p_alvo uuid, p_ativo boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.profiles;
  v_depois public.profiles;
begin
  if not (select public.e_super_admin()) then
    raise exception 'Só um super_admin pode ativar ou desativar contas.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_antes from public.profiles where id = p_alvo;
  if v_antes.id is null then
    raise exception 'Não existe nenhuma conta com esse id.'
      using errcode = 'no_data_found';
  end if;

  if v_antes.ativo = p_ativo then
    return v_antes;
  end if;

  if not p_ativo
     and v_antes.papel_global = 'super_admin'
     and (select public.super_admins_activos()) <= 1 then
    raise exception 'É a última conta super_admin ativa. Não pode ser desativada.'
      using errcode = 'check_violation';
  end if;

  update public.profiles
  set ativo = p_ativo
  where id = p_alvo
  returning * into v_depois;

  perform public.registar_no_log(
    case when p_ativo then 'reativar' else 'desativar' end,
    p_alvo,
    jsonb_build_object('papel_global', v_antes.papel_global)
  );

  return v_depois;
end;
$$;

grant execute on function public.definir_estado_conta(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Membros de um quadro
-- ---------------------------------------------------------------------------

create or replace function public.definir_membro_quadro(
  p_quadro uuid,
  p_utilizador uuid,
  p_papel public.papel_quadro
)
returns public.board_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.board_members;
  v_antes public.papel_quadro;
begin
  if not public.pode_gerir_quadro(p_quadro) then
    raise exception 'Só quem gere o quadro pode acrescentar ou mudar membros.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profiles where id = p_utilizador and ativo) then
    raise exception 'A conta não existe ou está desativada.'
      using errcode = 'check_violation';
  end if;

  select papel into v_antes
  from public.board_members
  where board_id = p_quadro and user_id = p_utilizador;

  insert into public.board_members (board_id, user_id, papel)
  values (p_quadro, p_utilizador, p_papel)
  on conflict (board_id, user_id) do update set papel = excluded.papel
  returning * into v_linha;

  perform public.registar_no_log(
    case when v_antes is null then 'quadro:adicionar' else 'quadro:papel' end,
    p_utilizador,
    jsonb_build_object('quadro', p_quadro, 'de', v_antes, 'para', p_papel)
  );

  return v_linha;
end;
$$;

grant execute on function
  public.definir_membro_quadro(uuid, uuid, public.papel_quadro) to authenticated;

create or replace function public.remover_membro_quadro(p_quadro uuid, p_utilizador uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removidas integer;
begin
  -- Um gestor remove quem quiser; qualquer membro pode sair por sua iniciativa.
  if not public.pode_gerir_quadro(p_quadro)
     and p_utilizador is distinct from (select auth.uid()) then
    raise exception 'Só quem gere o quadro pode remover membros.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O trigger do último gestor corre por baixo disto e rebenta se for o caso.
  delete from public.board_members
  where board_id = p_quadro and user_id = p_utilizador;
  get diagnostics v_removidas = row_count;

  if v_removidas > 0 then
    perform public.registar_no_log(
      'quadro:remover', p_utilizador, jsonb_build_object('quadro', p_quadro)
    );
  end if;
end;
$$;

grant execute on function public.remover_membro_quadro(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Acesso a cartões soltos
-- ---------------------------------------------------------------------------

create or replace function public.conceder_acesso_cartao(
  p_cartao uuid,
  p_utilizador uuid,
  p_papel public.papel_quadro default 'editor',
  p_expira_em timestamptz default null
)
returns public.card_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid := public.quadro_do_cartao(p_cartao);
  v_linha public.card_access;
begin
  if v_quadro is null then
    raise exception 'Cartão inexistente.' using errcode = 'no_data_found';
  end if;

  if not public.pode_gerir_quadro(v_quadro) then
    raise exception 'Só quem gere o quadro pode dar acesso a um cartão dele.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profiles where id = p_utilizador and ativo) then
    raise exception 'A conta não existe ou está desativada.'
      using errcode = 'check_violation';
  end if;

  if p_expira_em is not null and p_expira_em <= now() then
    raise exception 'A data de expiração já passou. Escolhe uma data futura.'
      using errcode = 'check_violation';
  end if;

  insert into public.card_access (card_id, user_id, papel, concedido_por, expira_em)
  values (p_cartao, p_utilizador, p_papel, (select auth.uid()), p_expira_em)
  on conflict (card_id, user_id) do update
    set papel = excluded.papel,
        expira_em = excluded.expira_em,
        concedido_por = excluded.concedido_por
  returning * into v_linha;

  perform public.registar_no_log(
    'cartao:conceder',
    p_utilizador,
    jsonb_build_object(
      'cartao', p_cartao, 'quadro', v_quadro,
      'papel', p_papel, 'expira_em', p_expira_em
    )
  );

  return v_linha;
end;
$$;

grant execute on function
  public.conceder_acesso_cartao(uuid, uuid, public.papel_quadro, timestamptz)
  to authenticated;

create or replace function public.revogar_acesso_cartao(p_cartao uuid, p_utilizador uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid := public.quadro_do_cartao(p_cartao);
  v_removidas integer;
begin
  if not public.pode_gerir_quadro(v_quadro)
     and p_utilizador is distinct from (select auth.uid()) then
    raise exception 'Só quem gere o quadro pode revogar este acesso.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.card_access
  where card_id = p_cartao and user_id = p_utilizador;
  get diagnostics v_removidas = row_count;

  if v_removidas > 0 then
    perform public.registar_no_log(
      'cartao:revogar',
      p_utilizador,
      jsonb_build_object('cartao', p_cartao, 'quadro', v_quadro)
    );
  end if;
end;
$$;

grant execute on function public.revogar_acesso_cartao(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Revogar tudo
-- ---------------------------------------------------------------------------

/*
  O botão do pânico: alguém saiu da empresa, ou um acesso foi dado por engano.
  Um super_admin corta tudo; um admin corta o que está ao alcance dele — os
  quadros que gere e os cartões dentro deles. O que não é seu não lhe compete.

  Não desativa a conta: são duas decisões diferentes e é bom que continuem a
  ser tomadas uma de cada vez.
*/
create or replace function public.revogar_todos_os_acessos(p_alvo uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadros integer := 0;
  v_cartoes integer := 0;
  v_super boolean := (select public.e_super_admin());
begin
  if not (select public.e_admin_global()) and not (select public.e_admin_algures()) then
    raise exception 'Sem permissão para revogar acessos.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_alvo = (select auth.uid()) then
    raise exception 'Não podes revogar os teus próprios acessos.'
      using errcode = 'check_violation';
  end if;

  delete from public.card_access a
  where a.user_id = p_alvo
    and (v_super or public.pode_gerir_quadro(public.quadro_do_cartao(a.card_id)));
  get diagnostics v_cartoes = row_count;

  delete from public.board_members m
  where m.user_id = p_alvo
    and (v_super or public.pode_gerir_quadro(m.board_id));
  get diagnostics v_quadros = row_count;

  perform public.registar_no_log(
    'revogar-tudo',
    p_alvo,
    jsonb_build_object('quadros', v_quadros, 'cartoes', v_cartoes, 'ambito',
      case when v_super then 'tudo' else 'quadros-que-gere' end)
  );

  return json_build_object('quadros', v_quadros, 'cartoes', v_cartoes);
end;
$$;

grant execute on function public.revogar_todos_os_acessos(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Convidar
-- ---------------------------------------------------------------------------

/*
  Regras, por ordem de quem convida:

  - super_admin  convida qualquer pessoa com qualquer papel global.
  - admin        convida apenas com papel global externo, e apenas para
                 quadros onde é gestor.
  - gestor       o mesmo, dentro do quadro que gere.

  Um admin NUNCA promove ninguém a admin ou super_admin, e um convite é a
  forma mais discreta de tentar fazê-lo — daí a regra viver aqui e não só na
  interface.

  `p_acessos` é um array de objetos {quadro|cartao, papel, expira_em}: o convite
  dá acesso a vários quadros e cartões no mesmo passo, como pede o ecrã.
*/
create or replace function public.criar_convite(
  p_email text,
  p_token text,
  p_papel_global public.papel_global default 'externo',
  p_acessos jsonb default '[]'::jsonb
)
returns public.convites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
  v_acesso jsonb;
  v_quadro uuid;
  v_cartao uuid;
  v_papel public.papel_quadro;
  v_email text := lower(trim(p_email));
  v_primeiro_quadro uuid;
begin
  if not (select public.e_admin_algures()) then
    raise exception 'Sem permissão para convidar.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_papel_global <> 'externo' and not (select public.e_super_admin()) then
    raise exception 'Só um super_admin pode convidar alguém com papel global acima de externo.'
      using errcode = 'insufficient_privilege';
  end if;

  if position('@' in v_email) < 2 then
    raise exception 'Email inválido.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Já existe uma conta com esse email. Dá-lhe acesso em vez de a convidares.'
      using errcode = 'unique_violation';
  end if;

  -- Valida os acessos ANTES de criar o convite: um convite meio aplicado seria
  -- pior do que nenhum. A transação trata do resto.
  for v_acesso in select * from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb))
  loop
    v_quadro := nullif(v_acesso ->> 'quadro', '')::uuid;
    v_cartao := nullif(v_acesso ->> 'cartao', '')::uuid;

    if v_cartao is not null then
      v_quadro := public.quadro_do_cartao(v_cartao);
    end if;

    if v_quadro is null then
      raise exception 'Acesso sem quadro nem cartão válido.' using errcode = 'check_violation';
    end if;

    if not public.pode_gerir_quadro(v_quadro) then
      raise exception 'Só podes convidar para quadros que geres.'
        using errcode = 'insufficient_privilege';
    end if;

    if v_primeiro_quadro is null and v_cartao is null then
      v_primeiro_quadro := v_quadro;
    end if;
  end loop;

  insert into public.convites (email, board_id, papel, papel_global, token, criado_por)
  values (
    v_email,
    v_primeiro_quadro,
    coalesce(
      (select (a ->> 'papel')::public.papel_quadro
       from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb)) a
       where nullif(a ->> 'quadro', '')::uuid = v_primeiro_quadro
       limit 1),
      'editor'
    ),
    p_papel_global,
    p_token,
    (select auth.uid())
  )
  returning * into v_convite;

  for v_acesso in select * from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb))
  loop
    v_quadro := nullif(v_acesso ->> 'quadro', '')::uuid;
    v_cartao := nullif(v_acesso ->> 'cartao', '')::uuid;
    v_papel := coalesce((v_acesso ->> 'papel')::public.papel_quadro, 'editor');

    insert into public.convite_acessos (convite_id, board_id, card_id, papel, expira_em)
    values (
      v_convite.id,
      v_quadro,
      v_cartao,
      v_papel,
      nullif(v_acesso ->> 'expira_em', '')::timestamptz
    );
  end loop;

  perform public.registar_no_log(
    'convite:criar',
    null,
    jsonb_build_object(
      'email', v_email,
      'papel_global', p_papel_global,
      'acessos', coalesce(p_acessos, '[]'::jsonb)
    )
  );

  return v_convite;
end;
$$;

grant execute on function
  public.criar_convite(text, text, public.papel_global, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Resgate: aplicar o papel global e os acessos do convite
-- ---------------------------------------------------------------------------

create or replace function public.resgatar_convite(p_token text, p_utilizador uuid)
returns public.convites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
  v_acesso public.convite_acessos;
begin
  select * into v_convite
  from public.convites
  where token = p_token
  for update;

  if v_convite.id is null then
    raise exception 'Convite inexistente' using errcode = 'no_data_found';
  end if;

  if v_convite.usado_em is not null then
    raise exception 'Este convite já foi usado' using errcode = 'check_violation';
  end if;

  if v_convite.expira_em <= now() then
    raise exception 'Este convite expirou' using errcode = 'check_violation';
  end if;

  update public.convites
  set usado_em = now()
  where id = v_convite.id
  returning * into v_convite;

  -- O papel global vem do convite, e o convite já foi validado quando foi
  -- criado: um admin nunca conseguiu pôr aqui outra coisa que não 'externo'.
  update public.profiles
  set papel_global = v_convite.papel_global
  where id = p_utilizador;

  if v_convite.board_id is not null then
    insert into public.board_members (board_id, user_id, papel)
    values (v_convite.board_id, p_utilizador, v_convite.papel)
    on conflict (board_id, user_id) do nothing;
  end if;

  for v_acesso in
    select * from public.convite_acessos where convite_id = v_convite.id
  loop
    if v_acesso.board_id is not null then
      insert into public.board_members (board_id, user_id, papel)
      values (v_acesso.board_id, p_utilizador, v_acesso.papel)
      on conflict (board_id, user_id) do nothing;
    else
      insert into public.card_access (card_id, user_id, papel, concedido_por, expira_em)
      values (
        v_acesso.card_id, p_utilizador, v_acesso.papel,
        v_convite.criado_por, v_acesso.expira_em
      )
      on conflict (card_id, user_id) do nothing;
    end if;
  end loop;

  insert into public.acessos_log (ator_id, alvo_id, accao, detalhe)
  values (
    v_convite.criado_por, p_utilizador, 'convite:resgatar',
    jsonb_build_object('convite', v_convite.id, 'papel_global', v_convite.papel_global)
  );

  return v_convite;
end;
$$;

revoke execute on function public.resgatar_convite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.resgatar_convite(text, uuid) to service_role;

-- Recriada com o mesmo contrato de antes, mais `papel_global` e a contagem dos
-- acessos que o convite traz — o ecrã de resgate diz "vais entrar em 3 quadros"
-- antes de a conta existir.
create or replace function public.convite_por_token(p_token text)
returns table (
  id            uuid,
  email         text,
  board_id      uuid,
  nome_quadro   text,
  papel         public.papel_quadro,
  papel_global  public.papel_global,
  n_acessos     integer,
  expira_em     timestamptz,
  usado_em      timestamptz,
  valido        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.email,
    c.board_id,
    b.nome,
    c.papel,
    c.papel_global,
    (select count(*)::integer from public.convite_acessos a where a.convite_id = c.id),
    c.expira_em,
    c.usado_em,
    (c.usado_em is null and c.expira_em > now()) as valido
  from public.convites c
  left join public.boards b on b.id = c.board_id
  where c.token = p_token;
$$;

revoke execute on function public.convite_por_token(text)
  from public, anon, authenticated;
grant execute on function public.convite_por_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- Leitura para o painel
-- ---------------------------------------------------------------------------

/*
  A lista de /pessoas. Âmbitos diferentes conforme quem pergunta:
  um super_admin vê todas as contas, um admin vê quem partilha quadros consigo.

  Vai buscar o email a auth.users, que o cliente não pode ler diretamente — é
  precisamente por isso que isto é uma função e não um select.
*/
create or replace function public.listar_pessoas()
returns table (
  id             uuid,
  nome           text,
  email          text,
  avatar_url     text,
  papel_global   public.papel_global,
  ativo          boolean,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz,
  quadros        integer,
  cartoes        integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.e_admin_global()) then
    raise exception 'Esta lista é para quem gere pessoas.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    p.id,
    p.nome,
    u.email::text,
    p.avatar_url,
    p.papel_global,
    p.ativo,
    p.ultimo_acesso,
    p.criado_em,
    (select count(*)::integer from public.board_members m where m.user_id = p.id),
    (select count(*)::integer from public.card_access a
      where a.user_id = p.id and (a.expira_em is null or a.expira_em > now()))
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select public.e_super_admin()) or public.partilha_quadro(p.id)
  order by p.ativo desc, p.nome;
end;
$$;

grant execute on function public.listar_pessoas() to authenticated;

/*
  O detalhe de uma pessoa: em que quadros está e com que papel, que cartões
  soltos lhe foram concedidos, por quem e até quando.

  Só mostra o que quem pergunta já podia ver — um admin não descobre por aqui
  os quadros de outro admin.
*/
create or replace function public.detalhe_pessoa(p_alvo uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_super boolean := (select public.e_super_admin());
  v_pessoa json;
  v_quadros json;
  v_cartoes json;
begin
  if not (select public.e_admin_global()) then
    raise exception 'Esta página é para quem gere pessoas.'
      using errcode = 'insufficient_privilege';
  end if;

  if not v_super and not public.partilha_quadro(p_alvo) then
    raise exception 'Não tens acesso a esta pessoa.'
      using errcode = 'insufficient_privilege';
  end if;

  select json_build_object(
    'id', p.id, 'nome', p.nome, 'email', u.email, 'avatar_url', p.avatar_url,
    'papel_global', p.papel_global, 'ativo', p.ativo,
    'ultimo_acesso', p.ultimo_acesso, 'criado_em', p.criado_em
  )
  into v_pessoa
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_alvo;

  if v_pessoa is null then
    raise exception 'Não existe nenhuma conta com esse id.' using errcode = 'no_data_found';
  end if;

  select coalesce(json_agg(json_build_object(
    'board_id', b.id, 'nome', b.nome, 'papel', m.papel,
    'arquivado', b.arquivado, 'desde', m.criado_em,
    'posso_gerir', public.pode_gerir_quadro(b.id)
  ) order by b.nome), '[]'::json)
  into v_quadros
  from public.board_members m
  join public.boards b on b.id = m.board_id
  where m.user_id = p_alvo
    and (v_super or public.pode_aceder_quadro(b.id));

  select coalesce(json_agg(json_build_object(
    'card_id', c.id, 'titulo', c.titulo,
    'board_id', b.id, 'quadro', b.nome,
    'papel', a.papel, 'expira_em', a.expira_em,
    'expirado', a.expira_em is not null and a.expira_em <= now(),
    'concedido_em', a.criado_em,
    'concedido_por', quem.nome,
    'posso_gerir', public.pode_gerir_quadro(b.id)
  ) order by a.criado_em desc), '[]'::json)
  into v_cartoes
  from public.card_access a
  join public.cards c on c.id = a.card_id
  join public.boards b on b.id = c.board_id
  left join public.profiles quem on quem.id = a.concedido_por
  where a.user_id = p_alvo
    and (v_super or public.pode_gerir_quadro(b.id));

  return json_build_object(
    'pessoa', v_pessoa, 'quadros', v_quadros, 'cartoes', v_cartoes
  );
end;
$$;

grant execute on function public.detalhe_pessoa(uuid) to authenticated;

/*
  "Os meus trabalhos": os cartões a que se tem acesso solto, agrupados por
  cliente. Um freelancer não pode abrir o quadro — veria os cartões dos outros
  — por isso precisa de um sítio onde os seus apareçam, com o nome do cliente,
  e abram diretamente.

  O nome do quadro sai daqui e não de um select em `boards`: o freelancer não
  tem, nem deve ter, acesso à linha do quadro.
*/
create or replace function public.os_meus_trabalhos()
returns table (
  card_id     uuid,
  titulo      text,
  descricao   text,
  data_limite timestamptz,
  concluido   boolean,
  arquivado   boolean,
  papel       public.papel_quadro,
  expira_em   timestamptz,
  board_id    uuid,
  quadro      text,
  lista       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.titulo, c.descricao, c.data_limite, c.concluido, c.arquivado,
    a.papel, a.expira_em, b.id, b.nome, l.nome
  from public.card_access a
  join public.cards c on c.id = a.card_id
  join public.boards b on b.id = c.board_id
  join public.lists l on l.id = c.list_id
  where a.user_id = (select auth.uid())
    and (a.expira_em is null or a.expira_em > now())
    and (select public.conta_activa())
  order by b.nome, c.data_limite nulls last, c.titulo;
$$;

grant execute on function public.os_meus_trabalhos() to authenticated;

-- Quantos cartões soltos é que esta conta tem. Serve para decidir, à entrada,
-- se a pessoa vai para a lista de quadros ou para "Os meus trabalhos".
create or replace function public.tenho_trabalhos_soltos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.card_access a
    where a.user_id = (select auth.uid())
      and (a.expira_em is null or a.expira_em > now())
  );
$$;

grant execute on function public.tenho_trabalhos_soltos() to authenticated;

-- ---------------------------------------------------------------------------
-- criar_quadro: gestor, e só para quem tem papel global para isso
-- ---------------------------------------------------------------------------

create or replace function public.criar_quadro(
  p_nome text,
  p_descricao text default null,
  p_cor text default 'ardosia'
)
returns public.boards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utilizador uuid := (select auth.uid());
  v_quadro public.boards;
begin
  if v_utilizador is null then
    raise exception 'É preciso sessão iniciada para criar um quadro'
      using errcode = 'insufficient_privilege';
  end if;

  -- Eixo A: criar quadros é de admin e super_admin. Um externo não tem
  -- poderes próprios — só vê aquilo a que lhe deram acesso.
  if not (select public.e_admin_global()) then
    raise exception 'Só um admin pode criar quadros.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.boards (nome, descricao, cor, criado_por)
  values (trim(p_nome), nullif(trim(coalesce(p_descricao, '')), ''), coalesce(p_cor, 'ardosia'), v_utilizador)
  returning * into v_quadro;

  insert into public.board_members (board_id, user_id, papel)
  values (v_quadro.id, v_utilizador, 'gestor');

  insert into public.labels (board_id, nome, cor)
  select v_quadro.id, '', cor
  from unnest(array['verde', 'amarelo', 'laranja', 'vermelho', 'roxo', 'azul']) as cor;

  perform public.registar_no_log(
    'quadro:criar', v_utilizador, jsonb_build_object('quadro', v_quadro.id, 'nome', v_quadro.nome)
  );

  return v_quadro;
end;
$$;

-- ===========================================================================
-- BACKFILL
-- ===========================================================================

/*
  Ninguém perde acesso nenhum com esta migração: `board_members` fica como
  está, e o eixo A só acrescenta poderes.

  Quem já era admin de um quadro (agora gestor) passa a admin global — é a
  leitura fiel do que essas contas já faziam: criar quadros e convidar gente
  para eles. Todas as outras ficam em `externo`, que é o default da coluna.
*/
update public.profiles p
set papel_global = 'admin'
where exists (
  select 1 from public.board_members m
  where m.user_id = p.id and m.papel = 'gestor'
);

-- O super_admin é um. Se a conta ainda não existir neste ambiente (local, ou
-- um projeto novo), isto não faz nada e o papel dá-se depois com
-- `npm run papel-global -- <email> super_admin`.
update public.profiles p
set papel_global = 'super_admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = 'cozinharte.pt@gmail.com';

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

-- O Realtime reavalia o RLS por subscritor, por isso pôr card_access na
-- publicação não vaza nada: cada um recebe as linhas que já podia ler. Sem
-- isto, um acesso revogado só desaparecia do ecrã ao recarregar a página.
alter table public.card_access replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'card_access'
  ) then
    alter publication supabase_realtime add table public.card_access;
  end if;
end;
$$;
