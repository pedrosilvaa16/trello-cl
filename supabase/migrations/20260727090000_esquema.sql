-- Esquema base da plataforma de quadros.
-- Todas as tabelas vivem em `public` e ficam com RLS ativa (ver migração 20260727090200).
-- Convenção: nomes de tabelas e colunas em minúsculas, com underscore.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.papel_quadro as enum ('admin', 'editor', 'leitor');

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------

-- Espelho público de auth.users. Criado por trigger no registo (ver 20260727090400).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 80),
  avatar_url  text,
  criado_em   timestamptz not null default now()
);

comment on table public.profiles is
  'Dados públicos de cada colaborador. Preenchido automaticamente no registo.';

-- ---------------------------------------------------------------------------
-- Quadros e membros
-- ---------------------------------------------------------------------------

create table public.boards (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 1 and 120),
  descricao   text check (char_length(descricao) <= 2000),
  cor         text not null default 'ardosia',
  arquivado   boolean not null default false,
  criado_por  uuid references public.profiles (id) on delete set null,
  criado_em   timestamptz not null default now()
);

create table public.board_members (
  board_id   uuid not null references public.boards (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  papel      public.papel_quadro not null default 'editor',
  criado_em  timestamptz not null default now(),
  primary key (board_id, user_id)
);

-- Índice obrigatório: "que quadros é que este utilizador vê?" corre em todas as páginas.
create index board_members_user_id_idx on public.board_members (user_id);

-- ---------------------------------------------------------------------------
-- Listas e cartões
-- ---------------------------------------------------------------------------

-- `posicao` é numeric fracionário, nunca um inteiro sequencial: mover um item
-- é um UPDATE de uma linha. Ver public.mover_lista / public.mover_cartao.
create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  nome       text not null check (char_length(nome) between 1 and 120),
  posicao    numeric not null,
  arquivada  boolean not null default false,
  criado_em  timestamptz not null default now()
);

create index lists_board_id_posicao_idx on public.lists (board_id, posicao);

create table public.cards (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.lists (id) on delete cascade,
  titulo         text not null check (char_length(titulo) between 1 and 300),
  descricao      text check (char_length(descricao) <= 20000),
  posicao        numeric not null,
  data_limite    timestamptz,
  concluido      boolean not null default false,
  arquivado      boolean not null default false,
  criado_por     uuid references public.profiles (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index cards_list_id_posicao_idx on public.cards (list_id, posicao);

-- Cartões com data-limite por vencer: usado pela vista de pesquisa e pelos avisos.
create index cards_data_limite_idx on public.cards (data_limite)
  where data_limite is not null and not concluido and not arquivado;

-- ---------------------------------------------------------------------------
-- Etiquetas e membros do cartão
-- ---------------------------------------------------------------------------

create table public.labels (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  nome       text not null default '' check (char_length(nome) <= 60),
  cor        text not null,
  criado_em  timestamptz not null default now()
);

create index labels_board_id_idx on public.labels (board_id);

create table public.card_labels (
  card_id   uuid not null references public.cards (id) on delete cascade,
  label_id  uuid not null references public.labels (id) on delete cascade,
  primary key (card_id, label_id)
);

create index card_labels_label_id_idx on public.card_labels (label_id);

create table public.card_members (
  card_id  uuid not null references public.cards (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (card_id, user_id)
);

create index card_members_user_id_idx on public.card_members (user_id);

-- ---------------------------------------------------------------------------
-- Comentários e anexos
-- ---------------------------------------------------------------------------

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.cards (id) on delete cascade,
  autor_id    uuid references public.profiles (id) on delete set null,
  corpo       text not null check (char_length(corpo) between 1 and 5000),
  criado_em   timestamptz not null default now(),
  editado_em  timestamptz
);

create index comments_card_id_criado_em_idx on public.comments (card_id, criado_em);

-- Limite de 25 MB por ficheiro, imposto aqui e também no bucket (ver 20260727090500).
create table public.attachments (
  id               uuid primary key default gen_random_uuid(),
  card_id          uuid not null references public.cards (id) on delete cascade,
  nome_ficheiro    text not null check (char_length(nome_ficheiro) between 1 and 255),
  caminho_storage  text not null unique,
  tamanho_bytes    bigint not null check (tamanho_bytes > 0 and tamanho_bytes <= 26214400),
  tipo_mime        text not null,
  carregado_por    uuid references public.profiles (id) on delete set null,
  criado_em        timestamptz not null default now()
);

create index attachments_card_id_criado_em_idx on public.attachments (card_id, criado_em);

-- ---------------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------------

-- O registo público está fechado: entrar na plataforma só é possível por convite.
-- `board_id` é opcional — quando preenchido, o convidado entra já com `papel`
-- nesse quadro; quando nulo, o convite dá apenas acesso à plataforma.
create table public.convites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (position('@' in email) > 1),
  board_id    uuid references public.boards (id) on delete cascade,
  papel       public.papel_quadro not null default 'editor',
  token       text not null unique,
  expira_em   timestamptz not null default (now() + interval '7 days'),
  usado_em    timestamptz,
  criado_por  uuid references public.profiles (id) on delete set null,
  criado_em   timestamptz not null default now()
);

-- Um convite pendente por email de cada vez: evita dois links válidos em circulação.
create unique index convites_email_pendente_idx
  on public.convites (lower(email))
  where usado_em is null;

create index convites_board_id_idx on public.convites (board_id);

-- ---------------------------------------------------------------------------
-- Domínios de email permitidos
-- ---------------------------------------------------------------------------

-- Cinto e suspensórios: mesmo com um token válido, o email tem de pertencer a um
-- destes domínios. Tabela vazia = sem restrição de domínio (útil em local).
create table public.dominios_permitidos (
  dominio    text primary key check (dominio = lower(dominio)),
  criado_em  timestamptz not null default now()
);

comment on table public.dominios_permitidos is
  'Domínios de email da empresa. Se estiver vazia, não há restrição de domínio.';

-- ---------------------------------------------------------------------------
-- atualizado_em
-- ---------------------------------------------------------------------------

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger cards_atualizado_em
  before update on public.cards
  for each row
  execute function public.tocar_atualizado_em();
