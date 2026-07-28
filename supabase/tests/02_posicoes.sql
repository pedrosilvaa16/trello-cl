-- Testes das posições fracionárias.
--
-- Critério de aceitação da Fase 2: "arrastar 50 cartões seguidos não produz
-- nenhuma posição errada nem salto visual". Aqui está a metade verificável em
-- SQL — a ordem que o servidor devolve tem de bater certo com a ordem que o
-- cliente desenhou, arrasto a arrasto.
--
-- A aritmética replica exatamente a de src/lib/posicoes.ts. Se um dos lados
-- mudar sem o outro, este ficheiro dá o alerta.

\set ON_ERROR_STOP on

\echo '\n== Posições: 50 arrastos seguidos =='

set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

do $$
declare
  v_quadro uuid;
  v_lista uuid;
  v_ordem uuid[];
  v_atual uuid[];
  v_cartao uuid;
  v_origem integer;
  v_destino integer;
  v_antes numeric;
  v_depois numeric;
  v_nova numeric;
  v_total integer := 12;
  v_reequilibrios integer := 0;
  i integer;
begin
  v_quadro := (public.criar_quadro('Ensaio de arrasto')).id;

  insert into public.lists (board_id, nome, posicao)
  values (v_quadro, 'Única', 1)
  returning id into v_lista;

  for i in 1 .. v_total loop
    insert into public.cards (list_id, titulo, posicao, criado_por)
    values (v_lista, 'Cartão ' || i, i, (select auth.uid()));
  end loop;

  select array_agg(id order by posicao, criado_em, id)
  into v_ordem
  from public.cards where list_id = v_lista;

  -- Sequência determinística: uma falha é sempre reproduzível.
  perform setseed(0.4242);

  for i in 1 .. 50 loop
    v_origem := 1 + floor(random() * v_total)::integer;
    v_destino := 1 + floor(random() * v_total)::integer;
    v_cartao := v_ordem[v_origem];

    -- O cliente tira o cartão da lista e volta a inseri-lo no destino; a
    -- posição sai da média dos novos vizinhos.
    v_ordem := v_ordem[1 : v_origem - 1] || v_ordem[v_origem + 1 : v_total];
    v_ordem := v_ordem[1 : v_destino - 1] || array[v_cartao] || v_ordem[v_destino : v_total - 1];

    select posicao into v_antes from public.cards where id = v_ordem[v_destino - 1];
    select posicao into v_depois from public.cards where id = v_ordem[v_destino + 1];

    v_nova := case
      when v_antes is null and v_depois is null then 1
      when v_antes is null then v_depois - 1
      when v_depois is null then v_antes + 1
      else (v_antes + v_depois) / 2
    end;

    if public.folga_minima_cartoes(v_lista) < public.limiar_folga() then
      v_reequilibrios := v_reequilibrios + 1;
    end if;

    perform public.mover_cartao(v_cartao, v_lista, v_nova);

    select array_agg(id order by posicao, criado_em, id)
    into v_atual
    from public.cards where list_id = v_lista;

    if v_atual is distinct from v_ordem then
      raise exception 'FALHOU: ordem errada ao arrasto % (cartão % de % para %)',
        i, v_cartao, v_origem, v_destino;
    end if;

    if (select count(*) from (
          select posicao from public.cards where list_id = v_lista
          group by posicao having count(*) > 1
        ) as repetidas) > 0 then
      raise exception 'FALHOU: duas posições iguais ao arrasto %', i;
    end if;
  end loop;

  perform testes.verificar(
    '50 arrastos seguidos e a ordem do servidor bate sempre certo com a do cliente',
    true
  );
  perform testes.verificar(
    'nenhum cartão se perdeu pelo caminho',
    (select count(*) from public.cards where list_id = v_lista) = v_total
  );

  perform set_config('testes.lista_arrasto', v_lista::text, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reequilíbrio
-- ---------------------------------------------------------------------------

\echo '\n== Posições: o reequilíbrio dispara quando a folga fecha =='

do $$
declare
  v_lista uuid := current_setting('testes.lista_arrasto')::uuid;
  v_primeiro uuid;
  v_a uuid;
  v_b uuid;
  v_alvo uuid;
  v_outro uuid;
  v_antes numeric;
  v_depois numeric;
  v_pedida numeric;
  v_final numeric;
  v_folga_pedida numeric := 1;
  v_reequilibrios integer := 0;
  v_ordem uuid[];
  v_ordem_apos_reequilibrio uuid[];
  v_todas_inteiras boolean;
  v_posicoes_distintas boolean;
  v_alvo_no_lugar boolean;
  i integer;
begin
  perform public.reequilibrar_lista(v_lista);

  select array_agg(id order by posicao, criado_em, id)
  into v_ordem
  from public.cards where list_id = v_lista;

  v_primeiro := v_ordem[1];
  v_a := v_ordem[2];
  v_b := v_ordem[3];

  -- Pior caso possível: dois cartões a trocar de lugar no mesmo intervalo,
  -- sempre logo a seguir ao primeiro. A folga parte-se ao meio de cada vez
  -- (1, 0.5, 0.25...), por isso ao fim de ~14 voltas bate no limiar.
  for i in 1 .. 20 loop
    if i % 2 = 1 then
      v_alvo := v_a; v_outro := v_b;
    else
      v_alvo := v_b; v_outro := v_a;
    end if;

    select posicao into v_antes  from public.cards where id = v_primeiro;
    select posicao into v_depois from public.cards where id = v_outro;

    v_pedida := (v_antes + v_depois) / 2;
    v_folga_pedida := least(v_folga_pedida, v_pedida - v_antes);

    v_final := public.mover_cartao(v_alvo, v_lista, v_pedida);

    -- mover_cartao devolve a posição final: se não for a que pedimos, é porque
    -- a folga fechou e a rotina de reequilíbrio correu. O estado tem de ser
    -- observado aqui — os arrastos seguintes voltam a partir as posições ao
    -- meio, como é suposto.
    if v_final <> v_pedida then
      v_reequilibrios := v_reequilibrios + 1;

      select array_agg(id order by posicao, criado_em, id)
      into v_ordem_apos_reequilibrio
      from public.cards where list_id = v_lista;

      v_todas_inteiras := (
        select count(*) = 0 from public.cards
        where list_id = v_lista and posicao <> trunc(posicao)
      );
      v_posicoes_distintas := (
        select count(distinct posicao) = count(*)
        from public.cards where list_id = v_lista
      );
      -- O cartão largado tem de ficar exatamente onde o utilizador o largou:
      -- logo a seguir ao primeiro.
      v_alvo_no_lugar := (v_ordem_apos_reequilibrio[2] = v_alvo);
    end if;
  end loop;

  perform testes.verificar(
    'a folga pedida chegou mesmo a apertar abaixo de 0.0001',
    v_folga_pedida < public.limiar_folga()
  );
  perform testes.verificar(
    'e o reequilíbrio correu',
    v_reequilibrios > 0
  );
  perform testes.verificar(
    'deixando toda a lista em posições inteiras',
    v_todas_inteiras
  );
  perform testes.verificar(
    'sem nunca deixar duas posições iguais',
    v_posicoes_distintas
  );
  -- O que o utilizador não pode notar: renumerar não é reordenar.
  perform testes.verificar(
    'e sem mexer na ordem que o utilizador estava a ver',
    v_ordem_apos_reequilibrio[1] = v_primeiro and v_alvo_no_lugar
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mover entre listas
-- ---------------------------------------------------------------------------

\echo '\n== Posições: mover entre listas =='

do $$
declare
  v_quadro uuid;
  v_origem uuid;
  v_destino uuid;
  v_cartao uuid;
begin
  select board_id into v_quadro from public.lists
  where id = current_setting('testes.lista_arrasto')::uuid;

  v_origem := current_setting('testes.lista_arrasto')::uuid;

  insert into public.lists (board_id, nome, posicao)
  values (v_quadro, 'Destino', 2) returning id into v_destino;

  select id into v_cartao from public.cards
  where list_id = v_origem order by posicao limit 1;

  perform public.mover_cartao(v_cartao, v_destino, public.posicao_fim_da_lista(v_destino));

  perform testes.verificar(
    'o cartão mudou mesmo de lista',
    (select list_id from public.cards where id = v_cartao) = v_destino
  );
  perform testes.verificar(
    'a posição de fim de lista começa em 1 numa lista vazia',
    (select posicao from public.cards where id = v_cartao) = 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Um editor não move cartões para fora do seu alcance
-- ---------------------------------------------------------------------------

\echo '\n== Posições: mover respeita as permissões =='

do $$
declare
  v_cartao uuid;
begin
  select id into v_cartao from public.cards
  where list_id = current_setting('testes.lista_arrasto')::uuid limit 1;
  perform set_config('testes.cartao_arrasto', v_cartao::text, false);
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222"}';
set role authenticated;

do $$
declare
  v_lista_do_bruno uuid;
begin
  select l.id into v_lista_do_bruno
  from public.lists l
  join public.boards b on b.id = l.board_id
  where b.nome = 'Quadro do Bruno';

  if v_lista_do_bruno is null then
    insert into public.lists (board_id, nome, posicao)
    select b.id, 'A dele', 1 from public.boards b where b.nome = 'Quadro do Bruno'
    returning id into v_lista_do_bruno;
  end if;

  perform testes.deve_falhar(
    'roubar um cartão alheio para o próprio quadro é recusado',
    format($sql$select public.mover_cartao(%L, %L, 1)$sql$,
           current_setting('testes.cartao_arrasto'), v_lista_do_bruno)
  );
end;
$$;

reset role;

\echo '\n== Todos os testes de posições passaram =='
