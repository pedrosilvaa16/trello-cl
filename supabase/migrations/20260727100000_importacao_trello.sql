-- Ajustes ao esquema para receber a migração da Trello.
--
-- Todos vieram de dados reais, não de suposições: 19 quadros, 1195 cartões,
-- 369 comentários e 859 anexos exportados de uma conta a sério bateram nestes
-- quatro sítios e em mais nenhum.

-- ---------------------------------------------------------------------------
-- Limites de texto
-- ---------------------------------------------------------------------------

-- Os CHECK originais foram criados sem nome; o nome automático depende da
-- ordem das colunas e não é seguro adivinhá-lo. Procuram-se pela definição.
do $$
declare
  v_restricao record;
begin
  for v_restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.cards'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%titulo%'
  loop
    execute format('alter table public.cards drop constraint %I', v_restricao.conname);
  end loop;

  for v_restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.comments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%corpo%'
  loop
    execute format('alter table public.comments drop constraint %I', v_restricao.conname);
  end loop;
end;
$$;

-- Um cartão da Trello trazia um título de 714 caracteres — é uma nota inteira
-- escrita no sítio errado, mas é dado do cliente e não se trunca.
alter table public.cards
  add constraint cards_titulo_tamanho
  check (char_length(titulo) between 1 and 1000);

-- O comentário mais longo tinha 6259 caracteres. Passa a acompanhar o limite
-- das descrições, que é onde um texto destes acabaria por ir parar.
alter table public.comments
  add constraint comments_corpo_tamanho
  check (char_length(corpo) between 1 and 20000);

-- ---------------------------------------------------------------------------
-- Anexos que são ligações
-- ---------------------------------------------------------------------------

-- A Trello deixa anexar um URL em vez de um ficheiro, e a equipa usa isso para
-- Canva, Drive e Instagram. Um anexo passa a ser uma de duas coisas: ficheiro
-- no bucket, ou ligação para fora. Nunca as duas, nunca nenhuma.
alter table public.attachments
  add column url text,
  alter column caminho_storage drop not null,
  alter column tamanho_bytes drop not null;

do $$
declare
  v_restricao record;
begin
  for v_restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.attachments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tamanho_bytes%'
  loop
    execute format('alter table public.attachments drop constraint %I', v_restricao.conname);
  end loop;
end;
$$;

alter table public.attachments
  add constraint attachments_ficheiro_ou_ligacao
  check (
    (caminho_storage is not null and tamanho_bytes is not null and url is null)
    or
    (caminho_storage is null and tamanho_bytes is null and url is not null)
  );

-- Mantém-se o limite de 25 MB da especificação para o que é mesmo ficheiro.
alter table public.attachments
  add constraint attachments_tamanho
  check (tamanho_bytes is null or (tamanho_bytes > 0 and tamanho_bytes <= 26214400));

-- ---------------------------------------------------------------------------
-- Autoria de fora da plataforma
-- ---------------------------------------------------------------------------

-- A API da Trello não devolve o email de terceiros, por isso nem toda a gente
-- que escreveu ali tem (ou terá) conta aqui. Em vez de deitar fora o nome de
-- quem escreveu, guarda-se em texto. `autor_id` continua a ser a verdade
-- quando existe; isto é o que resta quando não existe.
alter table public.comments
  add column autor_externo text check (char_length(autor_externo) <= 120);

alter table public.attachments
  add column carregado_por_externo text check (char_length(carregado_por_externo) <= 120);

comment on column public.comments.autor_externo is
  'Nome de quem escreveu, quando não corresponde a nenhum perfil (migração).';

-- ---------------------------------------------------------------------------
-- Rasto da importação
-- ---------------------------------------------------------------------------

-- Guarda a correspondência entre o id da Trello e o id local. É o que torna a
-- importação repetível: correr o script duas vezes não duplica nada, e uma
-- migração de 1200 cartões com 800 ficheiros vai mesmo precisar de ser
-- retomada a meio pelo menos uma vez.
create table public.importacoes_trello (
  tipo       text not null check (tipo in ('quadro', 'lista', 'cartao', 'etiqueta', 'comentario', 'anexo', 'pessoa')),
  id_trello  text not null,
  id_local   uuid not null,
  criado_em  timestamptz not null default now(),
  primary key (tipo, id_trello)
);

create index importacoes_trello_id_local_idx on public.importacoes_trello (id_local);

alter table public.importacoes_trello enable row level security;

-- Sem políticas: só o service_role (que ignora RLS) escreve e lê isto. É
-- andaime de migração, não faz parte do produto.
revoke all on public.importacoes_trello from anon, authenticated;
