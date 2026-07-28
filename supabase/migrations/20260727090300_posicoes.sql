-- Ordenação por posição fracionária.
--
-- `posicao` nunca é um inteiro sequencial. Ao largar um item entre dois outros,
-- a nova posição é a média das posições vizinhas; no topo, `primeira - 1`; no
-- fundo, `ultima + 1`. Arrastar custa UM update de UMA linha.
--
-- O preço a pagar é a folga entre posições encolher a cada inserção no mesmo
-- sítio (1, 0.5, 0.25, ...). Quando desce abaixo de LIMIAR_FOLGA, corre-se o
-- reequilíbrio que reatribui 1, 2, 3... à lista inteira. Com passo de 0.5 são
-- precisas ~13 inserções seguidas no mesmo intervalo para lá chegar, e o
-- numeric do Postgres tem precisão de sobra até lá.

-- Folga mínima tolerada entre duas posições vizinhas.
create or replace function public.limiar_folga()
returns numeric
language sql
immutable
as $$ select 0.0001::numeric $$;

-- ---------------------------------------------------------------------------
-- Reequilíbrio
-- ---------------------------------------------------------------------------

-- Reatribui 1, 2, 3... aos cartões de uma lista, preservando a ordem visível.
create or replace function public.reequilibrar_lista(p_lista uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.cards c
  set posicao = ordenados.nova
  from (
    select id, row_number() over (order by posicao, criado_em, id) as nova
    from public.cards
    where list_id = p_lista
  ) as ordenados
  where c.id = ordenados.id
    and c.posicao is distinct from ordenados.nova;
end;
$$;

-- O mesmo para as listas de um quadro.
create or replace function public.reequilibrar_listas_do_quadro(p_quadro uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.lists l
  set posicao = ordenados.nova
  from (
    select id, row_number() over (order by posicao, criado_em, id) as nova
    from public.lists
    where board_id = p_quadro
  ) as ordenados
  where l.id = ordenados.id
    and l.posicao is distinct from ordenados.nova;
end;
$$;

-- Menor folga entre posições consecutivas de uma lista (null se tiver 0 ou 1 cartão).
create or replace function public.folga_minima_cartoes(p_lista uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select min(folga)
  from (
    select posicao - lag(posicao) over (order by posicao, criado_em, id) as folga
    from public.cards
    where list_id = p_lista
  ) as folgas;
$$;

create or replace function public.folga_minima_listas(p_quadro uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select min(folga)
  from (
    select posicao - lag(posicao) over (order by posicao, criado_em, id) as folga
    from public.lists
    where board_id = p_quadro
  ) as folgas;
$$;

-- ---------------------------------------------------------------------------
-- Mover
-- ---------------------------------------------------------------------------

-- Move um cartão (dentro da lista ou entre listas) e devolve a posição final.
--
-- SECURITY INVOKER: as políticas de UPDATE de `cards` decidem se o movimento é
-- permitido — USING valida a lista de origem, WITH CHECK a de destino.
-- Se a folga ficar demasiado apertada, reequilibra antes de devolver, para o
-- cliente poder corrigir o seu estado local numa só resposta.
create or replace function public.mover_cartao(
  p_cartao uuid,
  p_lista uuid,
  p_posicao numeric
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_posicao numeric;
begin
  update public.cards
  set list_id = p_lista,
      posicao = p_posicao
  where id = p_cartao;

  if not found then
    raise exception 'Cartão inexistente ou sem permissão para o mover'
      using errcode = 'check_violation';
  end if;

  if coalesce(public.folga_minima_cartoes(p_lista), 1) < public.limiar_folga() then
    perform public.reequilibrar_lista(p_lista);
  end if;

  select posicao into v_posicao from public.cards where id = p_cartao;
  return v_posicao;
end;
$$;

create or replace function public.mover_lista(
  p_lista uuid,
  p_posicao numeric
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_quadro uuid;
  v_posicao numeric;
begin
  update public.lists
  set posicao = p_posicao
  where id = p_lista
  returning board_id into v_quadro;

  if v_quadro is null then
    raise exception 'Lista inexistente ou sem permissão para a mover'
      using errcode = 'check_violation';
  end if;

  if coalesce(public.folga_minima_listas(v_quadro), 1) < public.limiar_folga() then
    perform public.reequilibrar_listas_do_quadro(v_quadro);
  end if;

  select posicao into v_posicao from public.lists where id = p_lista;
  return v_posicao;
end;
$$;

-- Posição para acrescentar ao fundo, calculada no servidor para evitar corridas
-- entre dois utilizadores a criar cartões ao mesmo tempo.
create or replace function public.posicao_fim_da_lista(p_lista uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(max(posicao), 0) + 1 from public.cards where list_id = p_lista;
$$;

create or replace function public.posicao_fim_do_quadro(p_quadro uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(max(posicao), 0) + 1 from public.lists where board_id = p_quadro;
$$;

-- ---------------------------------------------------------------------------
-- Criar quadro
-- ---------------------------------------------------------------------------

-- Criar um quadro e ficar admin dele tem de ser atómico, e um INSERT com
-- RETURNING falharia a política de SELECT (a linha de board_members ainda não
-- existe nesse instante). Daí ser um RPC SECURITY DEFINER.
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

  -- Conjunto inicial de etiquetas, sem nome: a cor é o ponto de partida e cada
  -- equipa baptiza-as como quiser.
  insert into public.labels (board_id, nome, cor)
  select v_quadro.id, '', cor
  from unnest(array['verde', 'amarelo', 'laranja', 'vermelho', 'roxo', 'azul']) as cor;

  return v_quadro;
end;
$$;

-- ---------------------------------------------------------------------------
-- Membros por email
-- ---------------------------------------------------------------------------

-- Procura um colaborador pelo email sem expor auth.users ao cliente.
-- Devolve o perfil, ou nada se ainda não tiver conta (nesse caso a interface
-- propõe criar um convite).
create or replace function public.perfil_por_email(p_email text)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perfil public.profiles;
begin
  if not public.e_admin_algures() then
    raise exception 'Sem permissão para procurar colaboradores'
      using errcode = 'insufficient_privilege';
  end if;

  select p.* into v_perfil
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(trim(p_email));

  return v_perfil;
end;
$$;

-- ---------------------------------------------------------------------------
-- Último admin
-- ---------------------------------------------------------------------------

-- Um quadro sem admin fica sem ninguém que possa gerir membros ou apagá-lo.
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

  -- Continua a ser admin: nada a validar.
  if tg_op = 'UPDATE' and new.papel = 'admin' then
    return v_resultado;
  end if;

  if old.papel <> 'admin' then
    return v_resultado;
  end if;

  -- Apagar o quadro (ou a conta) apaga estas linhas em cascata; aí a regra não
  -- se aplica, senão o único admin nunca conseguiria apagar o próprio quadro.
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

create trigger board_members_ultimo_admin
  before update or delete on public.board_members
  for each row
  execute function public.impedir_quadro_sem_admin();

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------

revoke execute on function
  public.reequilibrar_lista(uuid),
  public.reequilibrar_listas_do_quadro(uuid),
  public.folga_minima_cartoes(uuid),
  public.folga_minima_listas(uuid),
  public.mover_cartao(uuid, uuid, numeric),
  public.mover_lista(uuid, numeric),
  public.posicao_fim_da_lista(uuid),
  public.posicao_fim_do_quadro(uuid),
  public.criar_quadro(text, text, text),
  public.perfil_por_email(text)
from public, anon;

grant execute on function
  public.reequilibrar_lista(uuid),
  public.reequilibrar_listas_do_quadro(uuid),
  public.folga_minima_cartoes(uuid),
  public.folga_minima_listas(uuid),
  public.mover_cartao(uuid, uuid, numeric),
  public.mover_lista(uuid, numeric),
  public.posicao_fim_da_lista(uuid),
  public.posicao_fim_do_quadro(uuid),
  public.criar_quadro(text, text, text),
  public.perfil_por_email(text)
to authenticated;
