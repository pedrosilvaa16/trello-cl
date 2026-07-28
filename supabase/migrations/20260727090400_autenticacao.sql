-- Registo fechado.
--
-- O registo público está desativado em Supabase Auth → Providers → Email. As
-- contas nascem sempre do resgate de um convite, feito no servidor com
-- service_role. Estes triggers são a segunda barreira: mesmo que alguém
-- consiga chamar signup, o email tem de pertencer a um domínio da empresa.

-- ---------------------------------------------------------------------------
-- Perfil automático
-- ---------------------------------------------------------------------------

create or replace function public.tratar_novo_utilizador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger auth_user_criado
  after insert on auth.users
  for each row
  execute function public.tratar_novo_utilizador();

-- ---------------------------------------------------------------------------
-- Domínios permitidos
-- ---------------------------------------------------------------------------

-- Cinto e suspensórios. Com a tabela vazia não há restrição — é o que permite
-- correr localmente com emails de teste.
create or replace function public.validar_dominio_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dominio text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if not exists (select 1 from public.dominios_permitidos) then
    return new;
  end if;

  if not exists (
    select 1 from public.dominios_permitidos d where d.dominio = v_dominio
  ) then
    raise exception 'O domínio "%" não está autorizado nesta plataforma.', v_dominio
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger auth_user_dominio
  before insert on auth.users
  for each row
  execute function public.validar_dominio_email();

-- ---------------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------------

-- Lê um convite pelo token sem exigir sessão. Só o servidor lhe chega
-- (service_role): é o que permite mostrar "Foste convidado para o quadro X"
-- antes de a conta existir.
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
    c.id,
    c.email,
    c.board_id,
    b.nome,
    c.papel,
    c.expira_em,
    c.usado_em,
    (c.usado_em is null and c.expira_em > now()) as valido
  from public.convites c
  left join public.boards b on b.id = c.board_id
  where c.token = p_token;
$$;

-- Marca o convite como usado e liga o novo utilizador ao quadro, se o convite
-- indicava um. Idempotente por email: resgatar duas vezes não duplica nada.
create or replace function public.resgatar_convite(p_token text, p_utilizador uuid)
returns public.convites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
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

  if v_convite.board_id is not null then
    insert into public.board_members (board_id, user_id, papel)
    values (v_convite.board_id, p_utilizador, v_convite.papel)
    on conflict (board_id, user_id) do nothing;
  end if;

  return v_convite;
end;
$$;

-- Só o servidor: quem resgata ainda não tem sessão, e quem tem sessão não
-- precisa destas funções.
revoke execute on function
  public.convite_por_token(text),
  public.resgatar_convite(text, uuid)
from public, anon, authenticated;

grant execute on function
  public.convite_por_token(text),
  public.resgatar_convite(text, uuid)
to service_role;
