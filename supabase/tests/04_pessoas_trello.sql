-- Associar e desassociar pessoas vindas da Trello.
--
-- É a peça que torna a importação corrigível: se estiver errada, uma atribuição
-- má fica lá para sempre e ninguém dá por isso. Daí ser testada ao detalhe.

\set ON_ERROR_STOP on

\echo '\n== Pessoas da Trello: preparação =='

set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

do $$
declare
  v_quadro uuid;
  v_lista uuid;
  v_cartao uuid;
begin
  v_quadro := (public.criar_quadro('Quadro migrado')).id;
  insert into public.lists (board_id, nome, posicao)
  values (v_quadro, 'Da Trello', 1) returning id into v_lista;
  insert into public.cards (list_id, titulo, posicao, criado_por)
  values (v_lista, 'Cartão migrado', 1, (select auth.uid())) returning id into v_cartao;

  perform set_config('testes.quadro_migrado', v_quadro::text, false);
  perform set_config('testes.cartao_migrado', v_cartao::text, false);
end;
$$;

reset role;

-- O importador corre com service_role; é ele que semeia isto.
do $$
declare
  v_cartao uuid := current_setting('testes.cartao_migrado')::uuid;
  v_quadro uuid := current_setting('testes.quadro_migrado')::uuid;
begin
  insert into public.pessoas_trello (id_trello, username, nome)
  values ('trello-carla', 'carlanunes', 'Carla Nunes');

  -- Dois comentários sem conta: autor_id nulo, nome em texto, ligação ao id.
  insert into public.comments (card_id, autor_id, autor_externo, autor_trello, corpo)
  values
    (v_cartao, null, 'Carla Nunes', 'trello-carla', 'Primeiro comentário migrado'),
    (v_cartao, null, 'Carla Nunes', 'trello-carla', 'Segundo comentário migrado');

  insert into public.membros_trello (board_id, id_trello, papel)
  values (v_quadro, 'trello-carla', 'editor');

  insert into public.atribuicoes_trello (card_id, id_trello)
  values (v_cartao, 'trello-carla');

  perform testes.verificar(
    'a vista de resumo conta o que a pessoa deixou atrás',
    (select comentarios from public.pessoas_trello_resumo where id_trello = 'trello-carla') = 2
      and (select cartoes from public.pessoas_trello_resumo where id_trello = 'trello-carla') = 1
      and (select quadros from public.pessoas_trello_resumo where id_trello = 'trello-carla') = 1
  );
end;
$$;

\echo '\n== Só admins associam =='

-- O diogo entrou por convite num quadro que entretanto foi apagado: não é
-- admin de nada, que é o que este teste precisa. (O bruno é admin do quadro
-- dele, vindo do 01_rls.sql.)
set request.jwt.claims = '{"sub": "44444444-4444-4444-8444-444444444444"}';
set role authenticated;

do $$
begin
  perform testes.deve_falhar(
    'quem não é admin de nada não associa ninguém',
    $sql$select public.associar_pessoa_trello('trello-carla',
          '33333333-3333-4333-8333-333333333333')$sql$
  );
  perform testes.verificar(
    'nem sequer vê o elenco da importação',
    (select count(*) from public.pessoas_trello_resumo) = 0
  );
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

\echo '\n== Associar arrasta tudo atrás =='

do $$
declare
  v_feito json;
  v_carla uuid := '33333333-3333-4333-8333-333333333333';
begin
  v_feito := public.associar_pessoa_trello('trello-carla', v_carla);

  perform testes.verificar(
    'devolve a conta do que mexeu',
    (v_feito ->> 'comentarios')::int = 2
      and (v_feito ->> 'quadros')::int = 1
      and (v_feito ->> 'cartoes')::int = 1
  );
  perform testes.verificar(
    'os comentários passaram a ser da conta',
    (select count(*) from public.comments
      where autor_trello = 'trello-carla' and autor_id = v_carla) = 2
  );
  perform testes.verificar(
    'e o nome em texto deixou de ser preciso',
    (select count(*) from public.comments
      where autor_trello = 'trello-carla' and autor_externo is not null) = 0
  );
  perform testes.verificar(
    'entrou no quadro com o papel que tinha na Trello',
    (select papel from public.board_members
      where board_id = current_setting('testes.quadro_migrado')::uuid
        and user_id = v_carla) = 'editor'
  );
  perform testes.verificar(
    'e o cartão que era dela ficou-lhe atribuído',
    (select count(*) from public.card_members
      where card_id = current_setting('testes.cartao_migrado')::uuid
        and user_id = v_carla) = 1
  );
  perform testes.verificar(
    'a ligação à pessoa da Trello não é apagada — é o que permite corrigir',
    (select count(*) from public.comments where autor_trello = 'trello-carla') = 2
  );
end;
$$;

\echo '\n== Associar à pessoa errada corrige-se =='

do $$
declare
  v_bruno uuid := '22222222-2222-4222-8222-222222222222';
  v_carla uuid := '33333333-3333-4333-8333-333333333333';
begin
  -- Sem limpar `autor_trello`, re-apontar é só chamar outra vez.
  perform public.associar_pessoa_trello('trello-carla', v_bruno);

  perform testes.verificar(
    'os comentários passaram para a conta certa',
    (select count(*) from public.comments
      where autor_trello = 'trello-carla' and autor_id = v_bruno) = 2
  );
  perform testes.verificar(
    'e o elenco aponta agora para essa',
    (select perfil_id from public.pessoas_trello where id_trello = 'trello-carla') = v_bruno
  );

  perform public.associar_pessoa_trello('trello-carla', v_carla);
  perform testes.verificar(
    'e volta atrás na mesma',
    (select perfil_id from public.pessoas_trello where id_trello = 'trello-carla') = v_carla
  );
end;
$$;

\echo '\n== Desassociar devolve o nome em texto =='

do $$
declare
  v_feito json;
  v_carla uuid := '33333333-3333-4333-8333-333333333333';
begin
  v_feito := public.desassociar_pessoa_trello('trello-carla');

  perform testes.verificar(
    'os comentários ficaram sem conta',
    (select count(*) from public.comments
      where autor_trello = 'trello-carla' and autor_id is null) = 2
  );
  perform testes.verificar(
    'com o nome de volta em texto',
    (select count(*) from public.comments
      where autor_trello = 'trello-carla' and autor_externo = 'Carla Nunes') = 2
  );
  perform testes.verificar(
    'o cartão deixou de estar atribuído',
    (select count(*) from public.card_members
      where card_id = current_setting('testes.cartao_migrado')::uuid
        and user_id = v_carla) = 0
  );
  -- Tirar alguém de um quadro onde já pode ter estado a trabalhar seria fazer
  -- estragos por causa de um engano de mapeamento.
  perform testes.verificar(
    'mas continua membro do quadro, de propósito',
    (select count(*) from public.board_members
      where board_id = current_setting('testes.quadro_migrado')::uuid
        and user_id = v_carla) = 1
  );
  perform testes.verificar(
    'e a associação pode ser refeita',
    ((public.associar_pessoa_trello('trello-carla', v_carla)) ->> 'comentarios')::int = 2
  );
end;
$$;

\echo '\n== Casos de erro =='

do $$
begin
  perform testes.deve_falhar(
    'associar a um perfil que não existe é recusado',
    $sql$select public.associar_pessoa_trello('trello-carla',
          '99999999-9999-4999-8999-999999999999')$sql$
  );
  perform testes.deve_falhar(
    'associar alguém que não veio da importação é recusado',
    $sql$select public.associar_pessoa_trello('nao-existe',
          '33333333-3333-4333-8333-333333333333')$sql$
  );
end;
$$;

reset role;

\echo '\n== Todos os testes de pessoas da Trello passaram =='
