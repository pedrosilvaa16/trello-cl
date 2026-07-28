-- Funções de acesso usadas por todas as políticas RLS.
--
-- São SECURITY DEFINER de propósito: uma política sobre `board_members` que
-- consultasse `board_members` diretamente entraria em recursão infinita. Ao
-- correr como dono, a consulta interna não reavalia RLS e a recursão desaparece.
--
-- `set search_path = ''` + nomes totalmente qualificados: sem isto, um schema
-- malicioso no search_path do chamador podia sequestrar a resolução de nomes.

-- ---------------------------------------------------------------------------
-- Pertença a um quadro
-- ---------------------------------------------------------------------------

-- Regra base de todo o modelo de permissões: só vês um quadro se existir uma
-- linha em board_members que te ligue a ele.
create or replace function public.pode_aceder_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = pode_aceder_quadro.board_id
      and m.user_id = (select auth.uid())
  );
$$;

comment on function public.pode_aceder_quadro(uuid) is
  'Verdadeiro se o utilizador autenticado for membro do quadro.';

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

-- Escrita: editor e admin podem criar e alterar; leitor só lê.
create or replace function public.pode_editar_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = pode_editar_quadro.board_id
      and m.user_id = (select auth.uid())
      and m.papel in ('admin', 'editor')
  );
$$;

-- Apagar quadros e gerir membros é exclusivo de admin.
create or replace function public.e_admin_quadro(board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = e_admin_quadro.board_id
      and m.user_id = (select auth.uid())
      and m.papel = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Herança de permissão: listas e cartões não guardam board_id redundante,
-- resolvem-no por estas funções.
-- ---------------------------------------------------------------------------

create or replace function public.quadro_da_lista(lista uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.board_id from public.lists l where l.id = quadro_da_lista.lista;
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

-- Pertença de terceiros, para validar atribuições: só se atribui um cartão a
-- quem já é membro do quadro.
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

-- ---------------------------------------------------------------------------
-- Visibilidade entre colaboradores
-- ---------------------------------------------------------------------------

-- Um utilizador vê o perfil de quem partilha pelo menos um quadro consigo.
-- Sem isto, atribuir um cartão a um colega mostraria um avatar sem nome.
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

-- Quem pode convidar gente nova para a plataforma: qualquer admin de qualquer
-- quadro. O primeiro utilizador é criado pelo script de arranque (service_role).
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

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------

revoke execute on function
  public.pode_aceder_quadro(uuid),
  public.papel_no_quadro(uuid),
  public.pode_editar_quadro(uuid),
  public.e_admin_quadro(uuid),
  public.quadro_da_lista(uuid),
  public.quadro_do_cartao(uuid),
  public.e_membro_do_quadro(uuid, uuid),
  public.partilha_quadro(uuid),
  public.e_admin_algures()
from public, anon;

grant execute on function
  public.pode_aceder_quadro(uuid),
  public.papel_no_quadro(uuid),
  public.pode_editar_quadro(uuid),
  public.e_admin_quadro(uuid),
  public.quadro_da_lista(uuid),
  public.quadro_do_cartao(uuid),
  public.e_membro_do_quadro(uuid, uuid),
  public.partilha_quadro(uuid),
  public.e_admin_algures()
to authenticated;
