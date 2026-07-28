-- Eliminar uma conta: a exceção à regra, e por isso com regras próprias.
--
-- A secção 10 da especificação diz "utilizadores não se apagam", e a razão é
-- boa: apagar quebra a autoria dos comentários e o histórico dos cartões. Mas
-- a regra não previa o caso que aparece sempre — a conta de teste, o convite
-- para o email escrito ao contrário, a pessoa que nunca chegou a entrar. Aí
-- não há autoria nenhuma para preservar, e desativar deixa o email preso: o
-- `criar_convite` recusa-se a convidar quem já tem conta, mesmo desativada.
--
-- O que esta migração faz é TIRAR A RAZÃO À OBJEÇÃO antes de deixar apagar. O
-- nome de quem escreveu passa para `autor_externo` e `carregado_por_externo` —
-- as mesmas colunas que a importação da Trello já usa para autoria sem conta —
-- e só depois é que a linha desaparece. O comentário fica onde estava, com o
-- nome de quem o escreveu; o que se perde é o link para um perfil que deixou
-- de existir.
--
-- Desativar continua a ser o caminho normal. Isto é a saída de emergência, e é
-- exclusiva do super_admin.

/*
  Carimba a autoria e regista a intenção. NÃO apaga nada.

  A eliminação em si é feita a seguir pela Admin API do GoTrue, que é quem sabe
  arrumar as sessões e os refresh tokens da pessoa — `delete from auth.users`
  num SECURITY DEFINER também funcionava, mas amarrava isto ao desenho interno
  do schema `auth`, que não é contrato nenhum.

  Isso quer dizer que há um instante entre os dois passos. É de propósito que
  este é o primeiro: se a eliminação falhar a seguir, o que fica é uma conta
  viva com um nome escrito a mais numa coluna que ninguém lê enquanto o perfil
  existir — a interface mostra sempre o perfil e só cai no nome em texto quando
  ele desaparece. Pela ordem contrária, uma falha aqui deixava os comentários
  órfãos e sem forma de recuperar o nome.
*/
create or replace function public.preparar_eliminacao_conta(p_alvo uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo public.profiles;
  v_email text;
  v_comentarios integer := 0;
  v_anexos integer := 0;
  v_quadros integer := 0;
  v_cartoes integer := 0;
begin
  if not (select public.e_super_admin()) then
    raise exception 'Só um super_admin pode eliminar contas.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_alvo from public.profiles where id = p_alvo;
  if v_alvo.id is null then
    raise exception 'Não existe nenhuma conta com esse id.'
      using errcode = 'no_data_found';
  end if;

  -- Eliminar-se a si próprio deixa a plataforma sem quem a administre, e é o
  -- tipo de clique que só se percebe depois de acontecer.
  if p_alvo = (select auth.uid()) then
    raise exception 'Não podes eliminar a tua própria conta.'
      using errcode = 'check_violation';
  end if;

  -- Mesma guarda de `definir_estado_conta` e `definir_papel_global`: sem uma
  -- conta super_admin ativa não há caminho de volta sem SQL à mão.
  if v_alvo.papel_global = 'super_admin'
     and v_alvo.ativo
     and (select public.super_admins_activos()) <= 1 then
    raise exception 'É a última conta super_admin ativa. Promove outra pessoa primeiro.'
      using errcode = 'check_violation';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_alvo;

  /*
    A autoria passa a ser um nome em texto, exatamente como em
    `desassociar_pessoa_trello`. O `coalesce` é para não pisar um nome que já
    lá esteja — um comentário migrado da Trello e depois associado a esta conta
    guarda o nome original, e é esse que deve ficar.
  */
  update public.comments
  set autor_externo = coalesce(autor_externo, v_alvo.nome)
  where autor_id = p_alvo;
  get diagnostics v_comentarios = row_count;

  update public.attachments
  set carregado_por_externo = coalesce(carregado_por_externo, v_alvo.nome)
  where carregado_por = p_alvo;
  get diagnostics v_anexos = row_count;

  select count(*)::integer into v_quadros
  from public.board_members m where m.user_id = p_alvo;

  select count(*)::integer into v_cartoes
  from public.card_access a where a.user_id = p_alvo;

  /*
    O registo é escrito ANTES da eliminação e leva o nome e o email por dentro:
    `acessos_log.alvo_id` é `on delete set null`, por isso daqui a um minuto
    esta linha já não sabe de quem falava. Um registo de acessos que não diz
    quem foi eliminado não serve de registo nenhum.
  */
  perform public.registar_no_log(
    'conta:eliminar',
    p_alvo,
    jsonb_build_object(
      'nome', v_alvo.nome,
      'email', v_email,
      'papel_global', v_alvo.papel_global,
      'ativo', v_alvo.ativo,
      'comentarios', v_comentarios,
      'anexos', v_anexos,
      'quadros', v_quadros,
      'cartoes', v_cartoes
    )
  );

  return json_build_object(
    'nome', v_alvo.nome,
    'email', v_email,
    'comentarios', v_comentarios,
    'anexos', v_anexos,
    'quadros', v_quadros,
    'cartoes', v_cartoes
  );
end;
$$;

comment on function public.preparar_eliminacao_conta(uuid) is
  'Carimba a autoria em texto e regista a eliminação. Não apaga — quem apaga é a Admin API a seguir.';

revoke execute on function public.preparar_eliminacao_conta(uuid) from public, anon;
grant execute on function public.preparar_eliminacao_conta(uuid) to authenticated;
