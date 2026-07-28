-- Reversão de 20260728120000_niveis_de_acesso.sql.
--
-- Vive fora de supabase/migrations/ de propósito: o `supabase db push` aplica
-- tudo o que estiver lá dentro, por ordem, e uma reversão aplicada por engano
-- devolvia a plataforma ao modelo antigo sem ninguém pedir.
--
-- Correr à mão, e só com uma boa razão:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/reverter/20260728120000_niveis_de_acesso.sql
--
-- O QUE SE PERDE. Isto desfaz o esquema, não a história:
--   - `card_access` desaparece. Todo o acesso de freelancer a cartões soltos
--     vai com ela, e não há de onde o reconstruir.
--   - `acessos_log` desaparece, e com ele o registo de quem mudou o quê.
--   - `papel_global` desaparece. Quem era admin ou super_admin passa a não ser
--     nada — mas ninguém perde acesso a quadros, porque esses vivem em
--     `board_members`, que fica intacta.
--   - Os membros com papel `comentador` passam a `leitor`. É a conversão
--     conservadora: perdem a capacidade de comentar, não ganham nenhuma.
-- Se algum destes doer, copia a tabela para um lado antes de correr isto.

begin;

-- A ordem aqui não é arbitrária: as políticas dependem das funções e as
-- funções dependem do tipo. Larga-se sempre de cima para baixo — políticas,
-- depois tabelas, depois funções, depois o enum — senão o Postgres recusa-se
-- a deixar cair o que ainda tem quem dependa dele.

-- ---------------------------------------------------------------------------
-- Triggers e funções novas
-- ---------------------------------------------------------------------------

drop trigger if exists cards_mover_so_do_quadro on public.cards;
drop trigger if exists cards_herdar_quadro      on public.cards;
drop trigger if exists lists_propagar_quadro    on public.lists;

drop function if exists public.impedir_mover_cartao_sem_quadro();
drop function if exists public.cartao_herdar_quadro();
drop function if exists public.lista_propagar_quadro();

-- ---------------------------------------------------------------------------
-- Políticas: repor as que a migração substituiu
-- ---------------------------------------------------------------------------

drop policy if exists "quem tem acesso ve o cartao"                on public.cards;
drop policy if exists "editores criam cartoes"                     on public.cards;
drop policy if exists "editores alteram cartoes"                   on public.cards;
drop policy if exists "editores apagam cartoes"                    on public.cards;
drop policy if exists "quem tem acesso ao cartao le os comentarios" on public.comments;
drop policy if exists "comentadores comentam em nome proprio"      on public.comments;
drop policy if exists "cada um edita os seus comentarios"          on public.comments;
drop policy if exists "cada um apaga os seus comentarios"          on public.comments;
drop policy if exists "quem tem acesso ao cartao ve os anexos"     on public.attachments;
drop policy if exists "editores carregam anexos"                   on public.attachments;
drop policy if exists "editores removem anexos"                    on public.attachments;
drop policy if exists "admins criam quadros"                       on public.boards;

create policy "membros veem os cartoes"
  on public.cards for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_da_lista(list_id)));

create policy "editores criam cartoes"
  on public.cards for insert to authenticated
  with check (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

create policy "editores alteram cartoes"
  on public.cards for update to authenticated
  using (public.pode_editar_quadro(public.quadro_da_lista(list_id)))
  with check (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

create policy "editores apagam cartoes"
  on public.cards for delete to authenticated
  using (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

create policy "membros leem comentarios"
  on public.comments for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_do_cartao(card_id)));

create policy "editores comentam em nome proprio"
  on public.comments for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and public.pode_editar_quadro(public.quadro_do_cartao(card_id))
  );

create policy "cada um edita os seus comentarios"
  on public.comments for update to authenticated
  using (autor_id = (select auth.uid()))
  with check (autor_id = (select auth.uid()));

create policy "cada um apaga os seus comentarios"
  on public.comments for delete to authenticated
  using (autor_id = (select auth.uid()));

create policy "membros veem anexos"
  on public.attachments for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_do_cartao(card_id)));

create policy "editores carregam anexos"
  on public.attachments for insert to authenticated
  with check (
    carregado_por = (select auth.uid())
    and public.pode_editar_quadro(public.quadro_do_cartao(card_id))
  );

create policy "editores removem anexos"
  on public.attachments for delete to authenticated
  using (public.pode_editar_quadro(public.quadro_do_cartao(card_id)));

create policy "qualquer colaborador cria quadros"
  on public.boards for insert to authenticated
  with check (criado_por = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Tabelas novas
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'card_access'
  ) then
    alter publication supabase_realtime drop table public.card_access;
  end if;
end;
$$;

-- Estas devolvem os tipos-linha de `card_access` e de `profiles`, e por isso
-- têm de sair antes das tabelas de onde esses tipos vêm.
drop function if exists public.registar_acesso();
drop function if exists public.registar_no_log(text, uuid, jsonb);
drop function if exists public.super_admins_activos();
drop function if exists public.definir_papel_global(uuid, public.papel_global);
drop function if exists public.definir_estado_conta(uuid, boolean);
drop function if exists public.definir_membro_quadro(uuid, uuid, public.papel_quadro);
drop function if exists public.remover_membro_quadro(uuid, uuid);
drop function if exists public.conceder_acesso_cartao(uuid, uuid, public.papel_quadro, timestamptz);
drop function if exists public.revogar_acesso_cartao(uuid, uuid);
drop function if exists public.revogar_todos_os_acessos(uuid);
drop function if exists public.criar_convite(text, text, public.papel_global, jsonb);
drop function if exists public.listar_pessoas();
drop function if exists public.detalhe_pessoa(uuid);
drop function if exists public.os_meus_trabalhos();
drop function if exists public.tenho_trabalhos_soltos();

drop table if exists public.card_access;
drop table if exists public.acessos_log;
drop table if exists public.convite_acessos;

-- Só agora: até aqui, as políticas de card_access ainda dependiam delas.
drop function if exists public.pode_aceder_cartao(uuid);
drop function if exists public.pode_editar_cartao(uuid);
drop function if exists public.pode_comentar_cartao(uuid);
drop function if exists public.pode_aceder_cartao_em(uuid, uuid);
drop function if exists public.pode_editar_cartao_em(uuid, uuid);
drop function if exists public.pode_comentar_cartao_em(uuid, uuid);
drop function if exists public.papel_efectivo_no_cartao(uuid, uuid);
drop function if exists public.papel_no_cartao_directo(uuid);
drop function if exists public.pode_gerir_quadro(uuid);
drop function if exists public.e_super_admin();
drop function if exists public.e_admin_global();
drop function if exists public.papel_global_atual();
drop function if exists public.conta_activa();


-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------

drop index if exists public.cards_board_id_idx;
alter table public.cards drop column if exists board_id;

drop index if exists public.profiles_papel_global_idx;
alter table public.profiles
  drop column if exists papel_global,
  drop column if exists ativo,
  drop column if exists ultimo_acesso;

alter table public.convites drop column if exists papel_global;

-- Devolver o UPDATE da tabela inteira: sem `papel_global` não há coluna
-- sensível para proteger, e a política "cada um edita o seu perfil" volta a
-- ser a única barreira, como era.
grant update on public.profiles to authenticated;
grant insert on public.convites to authenticated;

create index if not exists board_members_user_id_idx on public.board_members (user_id);
drop index if exists public.board_members_user_board_idx;

-- ---------------------------------------------------------------------------
-- O enum de volta a ('admin', 'editor', 'leitor')
-- ---------------------------------------------------------------------------

drop function if exists public.papel_no_quadro(uuid);
drop function if exists public.convite_por_token(text);

create type public.papel_quadro_antigo as enum ('admin', 'editor', 'leitor');

alter table public.board_members  alter column papel drop default;
alter table public.convites       alter column papel drop default;
alter table public.membros_trello alter column papel drop default;

-- 'comentador' não tem correspondência no modelo antigo. Desce a 'leitor':
-- perde-se a capacidade de comentar, não se ganha nenhuma que não existisse.
alter table public.board_members
  alter column papel type public.papel_quadro_antigo
  using (case papel::text
           when 'gestor' then 'admin'
           when 'comentador' then 'leitor'
           else papel::text
         end)::public.papel_quadro_antigo;

alter table public.convites
  alter column papel type public.papel_quadro_antigo
  using (case papel::text
           when 'gestor' then 'admin'
           when 'comentador' then 'leitor'
           else papel::text
         end)::public.papel_quadro_antigo;

alter table public.membros_trello
  alter column papel type public.papel_quadro_antigo
  using (case papel::text
           when 'gestor' then 'admin'
           when 'comentador' then 'leitor'
           else papel::text
         end)::public.papel_quadro_antigo;

alter table public.board_members  alter column papel set default 'editor';
alter table public.convites       alter column papel set default 'editor';
alter table public.membros_trello alter column papel set default 'editor';

drop type public.papel_quadro;
alter type public.papel_quadro_antigo rename to papel_quadro;

-- ---------------------------------------------------------------------------
-- Funções que voltam ao corpo antigo
-- ---------------------------------------------------------------------------

create or replace function public.papel_no_quadro(board_id uuid)
returns public.papel_quadro
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
  from public.board_members m
  where m.board_id = papel_no_quadro.board_id
    and m.user_id = (select auth.uid());
$$;

create or replace function public.pode_aceder_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members m
    where m.board_id = pode_aceder_quadro.board_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.pode_editar_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members m
    where m.board_id = pode_editar_quadro.board_id
      and m.user_id = (select auth.uid())
      and m.papel in ('admin', 'editor')
  );
$$;

create or replace function public.e_admin_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members m
    where m.board_id = e_admin_quadro.board_id
      and m.user_id = (select auth.uid())
      and m.papel = 'admin'
  );
$$;

create or replace function public.quadro_do_cartao(cartao uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.board_id
  from public.cards c
  join public.lists l on l.id = c.list_id
  where c.id = quadro_do_cartao.cartao;
$$;

create or replace function public.partilha_quadro(outro_utilizador uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members meu
    join public.board_members dele on dele.board_id = meu.board_id
    where meu.user_id = (select auth.uid())
      and dele.user_id = partilha_quadro.outro_utilizador
  );
$$;

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
    where m.board_id = e_membro_do_quadro.quadro
      and m.user_id = e_membro_do_quadro.utilizador
  );
$$;

create or replace function public.e_admin_algures()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.user_id = (select auth.uid())
      and m.papel = 'admin'
  );
$$;

create or replace function public.impedir_quadro_sem_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admins_restantes integer;
  v_resultado public.board_members;
begin
  v_resultado := case when tg_op = 'DELETE' then old else new end;

  if tg_op = 'UPDATE' and new.papel = 'admin' then
    return v_resultado;
  end if;

  if old.papel <> 'admin' then
    return v_resultado;
  end if;

  if not exists (select 1 from public.boards b where b.id = old.board_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return v_resultado;
  end if;

  select count(*) into v_admins_restantes
  from public.board_members m
  where m.board_id = old.board_id
    and m.papel = 'admin'
    and m.user_id <> old.user_id;

  if v_admins_restantes = 0 then
    raise exception 'Este é o único admin do quadro. Promove outro membro primeiro.'
      using errcode = 'check_violation';
  end if;

  return v_resultado;
end;
$$;

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

  insert into public.boards (nome, descricao, cor, criado_por)
  values (trim(p_nome), nullif(trim(coalesce(p_descricao, '')), ''), coalesce(p_cor, 'ardosia'), v_utilizador)
  returning * into v_quadro;

  insert into public.board_members (board_id, user_id, papel)
  values (v_quadro.id, v_utilizador, 'admin');

  insert into public.labels (board_id, nome, cor)
  select v_quadro.id, '', cor
  from unnest(array['verde', 'amarelo', 'laranja', 'vermelho', 'roxo', 'azul']) as cor;

  return v_quadro;
end;
$$;

create or replace function public.convite_por_token(p_token text)
returns table (
  id           uuid,
  email        text,
  board_id     uuid,
  nome_quadro  text,
  papel        public.papel_quadro,
  expira_em    timestamptz,
  usado_em     timestamptz,
  valido       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.email, c.board_id, b.nome, c.papel,
    c.expira_em, c.usado_em,
    (c.usado_em is null and c.expira_em > now()) as valido
  from public.convites c
  left join public.boards b on b.id = c.board_id
  where c.token = p_token;
$$;

create or replace function public.resgatar_convite(p_token text, p_utilizador uuid)
returns public.convites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
begin
  select * into v_convite from public.convites where token = p_token for update;

  if v_convite.id is null then
    raise exception 'Convite inexistente' using errcode = 'no_data_found';
  end if;
  if v_convite.usado_em is not null then
    raise exception 'Este convite já foi usado' using errcode = 'check_violation';
  end if;
  if v_convite.expira_em <= now() then
    raise exception 'Este convite expirou' using errcode = 'check_violation';
  end if;

  update public.convites set usado_em = now()
  where id = v_convite.id returning * into v_convite;

  if v_convite.board_id is not null then
    insert into public.board_members (board_id, user_id, papel)
    values (v_convite.board_id, p_utilizador, v_convite.papel)
    on conflict (board_id, user_id) do nothing;
  end if;

  return v_convite;
end;
$$;

revoke execute on function
  public.convite_por_token(text),
  public.resgatar_convite(text, uuid)
from public, anon, authenticated;

grant execute on function
  public.convite_por_token(text),
  public.resgatar_convite(text, uuid)
to service_role;

revoke execute on function
  public.papel_no_quadro(uuid),
  public.pode_aceder_quadro(uuid),
  public.pode_editar_quadro(uuid),
  public.e_admin_quadro(uuid),
  public.quadro_do_cartao(uuid),
  public.partilha_quadro(uuid),
  public.e_membro_do_quadro(uuid, uuid),
  public.e_admin_algures(),
  public.criar_quadro(text, text, text)
from public, anon;

grant execute on function
  public.papel_no_quadro(uuid),
  public.pode_aceder_quadro(uuid),
  public.pode_editar_quadro(uuid),
  public.e_admin_quadro(uuid),
  public.quadro_do_cartao(uuid),
  public.partilha_quadro(uuid),
  public.e_membro_do_quadro(uuid, uuid),
  public.e_admin_algures(),
  public.criar_quadro(text, text, text)
to authenticated;

drop type if exists public.papel_global;

commit;
