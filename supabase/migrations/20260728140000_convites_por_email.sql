-- Convites: envio por email e um painel para os gerir.
--
-- Duas coisas ao mesmo tempo, porque a segunda não fazia sentido sem a
-- primeira estar arrumada.
--
-- 1. O convite passa a ser enviado, e não só criado. Guarda-se quando saiu e
--    quantas vezes, para o painel poder dizer "enviado há 3 dias" em vez de
--    deixar quem gere a adivinhar se a pessoa recebeu.
--
-- 2. QUEM VÊ QUE CONVITES. A política que existia era
--    `using (public.e_admin_algures())`: qualquer gestor de qualquer quadro
--    via TODOS os convites da plataforma — incluindo o email de quem foi
--    convidado para o quadro de outro cliente. Com um eixo de papéis globais
--    e clientes que são concorrentes entre si, isso é uma fuga.
--
--    Passa a ser: um super_admin vê tudo; toda a gente vê os convites que
--    criou e os que dizem respeito a quadros que gere.

-- ---------------------------------------------------------------------------
-- Rasto do envio
-- ---------------------------------------------------------------------------

alter table public.convites
  add column enviado_em timestamptz,
  add column reenvios integer not null default 0;

comment on column public.convites.enviado_em is
  'Quando o email saiu pela última vez. Nulo = criado mas nunca enviado.';
comment on column public.convites.reenvios is
  'Quantas vezes foi reenviado depois do primeiro envio.';

-- O painel lista por criação, e quase sempre só os que faltam usar.
create index convites_pendentes_idx on public.convites (criado_em desc)
  where usado_em is null;

-- ---------------------------------------------------------------------------
-- Quem vê que convites
-- ---------------------------------------------------------------------------

/*
  Um convite é visível a quem o criou e a quem manda nos quadros a que ele dá
  acesso. O `board_id` é o quadro principal; `convite_acessos` guarda os
  restantes, e um convite para três quadros é visível a quem gere qualquer um
  deles — é o mesmo convite, e revogá-lo afeta-os a todos.
*/
create or replace function public.pode_ver_convite(p_convite uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.e_super_admin())
    or exists (
      select 1
      from public.convites c
      where c.id = p_convite
        and (
          c.criado_por = (select auth.uid())
          or (c.board_id is not null and public.pode_gerir_quadro(c.board_id))
        )
    )
    or exists (
      select 1
      from public.convite_acessos a
      where a.convite_id = p_convite
        and public.pode_gerir_quadro(
          coalesce(a.board_id, public.quadro_do_cartao(a.card_id))
        )
    ),
    false
  );
$$;

revoke execute on function public.pode_ver_convite(uuid) from public, anon;
grant execute on function public.pode_ver_convite(uuid) to authenticated;

drop policy "admins veem convites"   on public.convites;
drop policy "admins revogam convites" on public.convites;

create policy "cada um ve os convites que lhe dizem respeito"
  on public.convites for select to authenticated
  using (public.pode_ver_convite(id));

create policy "quem ve o convite revoga-o"
  on public.convites for delete to authenticated
  using (public.pode_ver_convite(id));

-- A política de INSERT fica como estava: `criar_convite` é que valida quem
-- convida quem, e é por lá que a aplicação passa.

-- O mesmo âmbito para os acessos que o convite transporta.
drop policy "quem ve o convite ve os acessos dele" on public.convite_acessos;

create policy "quem ve o convite ve os acessos dele"
  on public.convite_acessos for select to authenticated
  using (public.pode_ver_convite(convite_id));

-- ---------------------------------------------------------------------------
-- O painel
-- ---------------------------------------------------------------------------

/*
  A lista de convites, com tudo o que o ecrã mostra numa consulta só: a que dá
  acesso, quem o criou, e em que estado está.

  `estado` é calculado aqui e não na interface, porque "expirado" depende do
  relógio do servidor — e um convite que o browser julgue válido por estar com
  a hora trocada é uma confusão desnecessária.
*/
create or replace function public.listar_convites()
returns table (
  id            uuid,
  email         text,
  papel         public.papel_quadro,
  papel_global  public.papel_global,
  token         text,
  estado        text,
  expira_em     timestamptz,
  usado_em      timestamptz,
  enviado_em    timestamptz,
  reenvios      integer,
  criado_em     timestamptz,
  criado_por    uuid,
  autor         text,
  acessos       json
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.conta_activa()) then
    raise exception 'Sem sessão iniciada.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    c.id,
    c.email,
    c.papel,
    c.papel_global,
    c.token,
    case
      when c.usado_em is not null then 'usado'
      when c.expira_em <= now() then 'expirado'
      when c.enviado_em is null then 'por-enviar'
      else 'pendente'
    end,
    c.expira_em,
    c.usado_em,
    c.enviado_em,
    c.reenvios,
    c.criado_em,
    c.criado_por,
    quem.nome,
    -- Os quadros e cartões a que dá acesso, com nome, para o ecrã não ter de
    -- fazer uma consulta por convite.
    coalesce((
      select json_agg(json_build_object(
        'tipo', case when a.board_id is not null then 'quadro' else 'cartao' end,
        'nome', coalesce(b.nome, cartao.titulo),
        'papel', a.papel,
        'expira_em', a.expira_em
      ) order by a.criado_em)
      from public.convite_acessos a
      left join public.boards b on b.id = a.board_id
      left join public.cards cartao on cartao.id = a.card_id
      where a.convite_id = c.id
    ), '[]'::json)
  from public.convites c
  left join public.profiles quem on quem.id = c.criado_por
  where public.pode_ver_convite(c.id)
  order by (c.usado_em is not null), c.criado_em desc;
end;
$$;

grant execute on function public.listar_convites() to authenticated;

-- ---------------------------------------------------------------------------
-- Reenviar
-- ---------------------------------------------------------------------------

/*
  Reenviar um convite válido manda o mesmo link outra vez. Reenviar um que
  expirou dá-lhe um token novo e mais sete dias — e invalida o antigo, que é o
  que se quer: um link que já andou a passear por caixas de correio durante
  duas semanas não deve voltar a funcionar por causa de um clique de renovação.

  Devolve o convite. Quem envia o email é o servidor, a seguir.
*/
create or replace function public.renovar_convite(p_convite uuid, p_token text)
returns public.convites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
begin
  if not public.pode_ver_convite(p_convite) then
    raise exception 'Sem permissão para reenviar este convite.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_convite from public.convites where id = p_convite for update;

  if v_convite.id is null then
    raise exception 'Convite inexistente.' using errcode = 'no_data_found';
  end if;

  if v_convite.usado_em is not null then
    raise exception 'Este convite já foi usado. Cria um novo, se for preciso.'
      using errcode = 'check_violation';
  end if;

  if v_convite.expira_em <= now() then
    update public.convites
    set token = p_token,
        expira_em = now() + interval '7 days'
    where id = p_convite
    returning * into v_convite;

    perform public.registar_no_log(
      'convite:renovar', null,
      jsonb_build_object('convite', p_convite, 'email', v_convite.email)
    );
  end if;

  return v_convite;
end;
$$;

grant execute on function public.renovar_convite(uuid, text) to authenticated;

-- Marca o envio. Separada da anterior de propósito: só se regista o que saiu
-- mesmo, depois de o fornecedor de email confirmar que aceitou a mensagem.
create or replace function public.marcar_convite_enviado(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.pode_ver_convite(p_convite) then
    raise exception 'Sem permissão para este convite.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.convites
  set enviado_em = now(),
      reenvios = case when enviado_em is null then 0 else reenvios + 1 end
  where id = p_convite;
end;
$$;

grant execute on function public.marcar_convite_enviado(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Revogar
-- ---------------------------------------------------------------------------

-- A política de DELETE já chega para o apagar; isto existe para o registo.
-- Revogar um convite é uma alteração de acesso como as outras.
create or replace function public.revogar_convite(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
begin
  if not public.pode_ver_convite(p_convite) then
    raise exception 'Sem permissão para revogar este convite.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_convite from public.convites where id = p_convite;
  if v_convite.id is null then
    return;
  end if;

  delete from public.convites where id = p_convite;

  perform public.registar_no_log(
    'convite:revogar', null,
    jsonb_build_object(
      'email', v_convite.email,
      'quadro', v_convite.board_id,
      'usado', v_convite.usado_em is not null
    )
  );
end;
$$;

grant execute on function public.revogar_convite(uuid) to authenticated;
