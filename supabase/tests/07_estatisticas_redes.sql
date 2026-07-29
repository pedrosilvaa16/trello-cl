-- Estatísticas de redes sociais: quem vê os números e quem liga as contas.
--
-- Duas asserções mandam em tudo o resto:
--
--   1. Um cliente vê as métricas do quadro dele e NÃO vê as do quadro de outro
--      cliente. Falhar isto é mostrar a um cliente os resultados de um
--      concorrente direto — pior do que mostrar-lhe o quadro, porque são
--      números que ele sabe ler.
--   2. NINGUÉM com `set role authenticated` lê `ligacoes_segredos`. Nem o
--      gestor do quadro, nem o super_admin. Um token da conta do cliente não
--      tem razão nenhuma para ser legível a partir de um browser.
--
-- Corre com: ./scripts/testar-rls.sh

\set ON_ERROR_STOP on

\echo '\n== Estatísticas de redes: o elenco =='

-- Reaproveita as contas e os quadros de 05, como o 06 faz. Os `set_config` de
-- lá não chegam aqui: cada ficheiro corre na sua própria sessão de psql.
--
-- sofia     super_admin                              (…0001)
-- marta     admin global, gestora do quadro A        (…0002)
-- rui       admin global, gestor do quadro B         (…0003)
-- cliente_a externo + comentador no quadro A         (…0004)
-- cliente_b externo + comentador no quadro B         (…0005)
select set_config('testes.quadro_a',
  (select id::text from public.boards where nome = 'Cliente A'), false);
select set_config('testes.quadro_b',
  (select id::text from public.boards where nome = 'Cliente B'), false);

-- ---------------------------------------------------------------------------
-- A marta liga o Instagram ao quadro dela
-- ---------------------------------------------------------------------------

\echo '\n== Ligar uma conta =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

select public.definir_ligacao_rede(
  current_setting('testes.quadro_a')::uuid,
  'instagram',
  'ig-17841400000000001',
  'creativeline.pt',
  'https://exemplo.pt/avatar.jpg',
  now() + interval '60 days'
) as ligacao_a \gset
select set_config('testes.ligacao_a', :'ligacao_a', false);

do $$
begin
  perform testes.verificar(
    'a gestora liga uma conta ao quadro dela',
    (select count(*) from public.ligacoes_redes
      where id = current_setting('testes.ligacao_a')::uuid) = 1
  );
  perform testes.verificar(
    'e a ligação nasce activa',
    (select estado from public.ligacoes_redes
      where id = current_setting('testes.ligacao_a')::uuid) = 'activa'
  );
  perform testes.verificar(
    'e fica com quem a ligou',
    (select ligado_por from public.ligacoes_redes
      where id = current_setting('testes.ligacao_a')::uuid)
      = 'a0000000-0000-4000-8000-000000000002'::uuid
  );
end;
$$;

-- A escrita direta continua fechada, como em profiles.papel_global: quem quer
-- ligar uma conta passa pela função, não pela tabela.
select testes.deve_falhar(
  'a gestora NÃO escreve direto em ligacoes_redes',
  format($f$insert into public.ligacoes_redes
             (board_id, rede, conta_externa_id, nome_conta)
           values (%L, 'facebook', 'fb-1', 'a torto')$f$,
         current_setting('testes.quadro_a'))
);

select testes.deve_falhar(
  'nem lhe muda o estado à mão',
  format($f$update public.ligacoes_redes set estado = 'activa' where id = %L$f$,
         current_setting('testes.ligacao_a'))
);

reset role;

-- ---------------------------------------------------------------------------
-- O rui liga o Instagram ao quadro dele, para haver dois clientes com dados
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000003"}';
set role authenticated;

select public.definir_ligacao_rede(
  current_setting('testes.quadro_b')::uuid,
  'instagram',
  'ig-17841400000000002',
  'outro.cliente',
  null,
  now() + interval '60 days'
) as ligacao_b \gset
select set_config('testes.ligacao_b', :'ligacao_b', false);

-- Um gestor de quadro é gestor DAQUELE quadro. Ser admin global não abre o
-- quadro de outro cliente — é a secção 10 a funcionar.
select testes.deve_falhar(
  'o gestor do quadro B não liga contas no quadro A',
  format($f$select public.definir_ligacao_rede(%L, 'facebook', 'fb-x', 'intruso')$f$,
         current_setting('testes.quadro_a'))
);

reset role;

-- ---------------------------------------------------------------------------
-- As métricas entram pelo sincronizador, nunca pelo browser
-- ---------------------------------------------------------------------------

\echo '\n== Escrever métricas =='

set role service_role;

-- Sem board_id nem rede na lista de colunas: é o trigger que os põe, e é isso
-- que garante que nunca divergem da ligação.
insert into public.metricas_redes (ligacao_id, dia, metrica, valor) values
  (current_setting('testes.ligacao_a')::uuid, current_date - 2, 'seguidores', 500),
  (current_setting('testes.ligacao_a')::uuid, current_date - 1, 'seguidores', 512),
  (current_setting('testes.ligacao_a')::uuid, current_date,     'seguidores', 523),
  (current_setting('testes.ligacao_a')::uuid, current_date,     'alcance',    418),
  (current_setting('testes.ligacao_b')::uuid, current_date,     'seguidores', 9999);

insert into public.demografia_redes (ligacao_id, dia, dimensao, grupo, valor) values
  (current_setting('testes.ligacao_a')::uuid, current_date, 'pais',   'PT', 87.5),
  (current_setting('testes.ligacao_a')::uuid, current_date, 'idade',  '25-34', 45),
  (current_setting('testes.ligacao_b')::uuid, current_date, 'pais',   'BR', 60);

insert into public.publicacoes_redes
  (ligacao_id, id_externo, publicado_em, tipo, legenda, metricas) values
  (current_setting('testes.ligacao_a')::uuid, 'post-1', now() - interval '1 day',
   'imagem', 'Uma legenda', '{"gostos": 30, "comentarios": 4}'::jsonb),
  (current_setting('testes.ligacao_b')::uuid, 'post-2', now() - interval '1 day',
   'reel', 'Outra', '{"gostos": 1}'::jsonb);

insert into public.sincronizacoes (ligacao_id, estado, linhas)
  values (current_setting('testes.ligacao_a')::uuid, 'concluida', 5);

do $$
begin
  perform testes.verificar(
    'o trigger preenche o board_id a partir da ligação',
    (select board_id from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid
        and metrica = 'alcance')
      = current_setting('testes.quadro_a')::uuid
  );
  perform testes.verificar(
    'e preenche a rede',
    (select distinct rede::text from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid) = 'instagram'
  );
  perform testes.verificar(
    'o mesmo trigger serve a demografia e as publicações',
    (select count(*) from public.demografia_redes
      where board_id = current_setting('testes.quadro_a')::uuid) = 2
    and
    (select count(*) from public.publicacoes_redes
      where board_id = current_setting('testes.quadro_a')::uuid) = 1
  );
end;
$$;

-- Sincronizar duas vezes no mesmo dia dá o mesmo que sincronizar uma. Sem isto
-- o cron a repetir-se duplicava a série inteira.
insert into public.metricas_redes (ligacao_id, dia, metrica, valor)
values (current_setting('testes.ligacao_a')::uuid, current_date, 'seguidores', 524)
on conflict (ligacao_id, dia, metrica) do update set valor = excluded.valor;

do $$
begin
  perform testes.verificar(
    'a sincronização é repetível: um dia, uma métrica, uma linha',
    (select count(*) from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid
        and dia = current_date and metrica = 'seguidores') = 1
  );
  perform testes.verificar(
    'e a segunda passagem substitui o valor',
    (select valor from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid
        and dia = current_date and metrica = 'seguidores') = 524
  );
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- 1. O cliente vê os números dele. Só os dele.
-- ---------------------------------------------------------------------------

\echo '\n== O cliente A vê o que é dele =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000004"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'um comentador vê as redes ligadas ao quadro dele',
    (select count(*) from public.ligacoes_redes
      where board_id = current_setting('testes.quadro_a')::uuid) = 1
  );
  perform testes.verificar(
    'e vê as métricas dele',
    (select count(*) from public.metricas_redes
      where board_id = current_setting('testes.quadro_a')::uuid) = 4
  );
  perform testes.verificar(
    'e a demografia dele',
    (select count(*) from public.demografia_redes) = 2
  );
  perform testes.verificar(
    'e as publicações dele',
    (select count(*) from public.publicacoes_redes) = 1
  );

  -- O teste que interessa. `select *` sem filtro: se o RLS falhasse, as linhas
  -- do outro cliente apareciam aqui.
  perform testes.verificar(
    'NÃO vê a ligação do outro cliente',
    (select count(*) from public.ligacoes_redes
      where board_id = current_setting('testes.quadro_b')::uuid) = 0
  );
  perform testes.verificar(
    'NÃO vê as métricas do outro cliente',
    (select count(*) from public.metricas_redes) = 4
  );
  perform testes.verificar(
    'e os 9999 seguidores do outro cliente não existem para ele',
    (select coalesce(max(valor), 0) from public.metricas_redes
      where metrica = 'seguidores') = 524
  );
end;
$$;

-- Ver é uma coisa; ligar é outra. O cliente não é gestor do quadro dele.
select testes.deve_falhar(
  'um comentador NÃO liga contas, nem no quadro dele',
  format($f$select public.definir_ligacao_rede(%L, 'tiktok', 'tt-1', 'a minha conta')$f$,
         current_setting('testes.quadro_a'))
);

select testes.deve_falhar(
  'nem desliga a que lá está',
  format($f$select public.remover_ligacao_rede(%L)$f$,
         current_setting('testes.ligacao_a'))
);

-- Um painel de cliente com números que o próprio pudesse escrever não seria um
-- painel, seria um campo de texto.
select testes.deve_falhar(
  'e NÃO escreve métricas',
  format($f$insert into public.metricas_redes (ligacao_id, dia, metrica, valor)
            values (%L, current_date, 'seguidores', 1000000)$f$,
         current_setting('testes.ligacao_a'))
);

-- `deve_falhar` e não `linhas_afetadas`: aqui o UPDATE é recusado pelo GRANT,
-- não escondido pelo RLS. É a diferença entre "não encontrou linha nenhuma" e
-- "não tens esse privilégio", e a segunda é a que se quer.
select testes.deve_falhar(
  'nem sequer as consegue alterar',
  'update public.metricas_redes set valor = 1 where metrica = ''seguidores'''
);

-- Diagnóstico é de quem gere. O cliente vê o painel, não a máquina por baixo.
do $$
begin
  perform testes.verificar(
    'e não vê o registo de sincronizações',
    (select count(*) from public.sincronizacoes) = 0
  );
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- 2. Os segredos não se leem a partir de um browser. Por ninguém.
-- ---------------------------------------------------------------------------

\echo '\n== Os tokens =='

set role service_role;
insert into public.ligacoes_segredos (ligacao_id, token_cifrado, ambito)
values (current_setting('testes.ligacao_a')::uuid,
        'iv:tag:isto-seria-um-token-cifrado', 'instagram_business_manage_insights');
reset role;

-- A gestora do quadro. A dona da ligação. Nada.
set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;
select testes.deve_falhar(
  'a gestora do quadro NÃO lê os tokens',
  'select token_cifrado from public.ligacoes_segredos'
);
reset role;

-- O super_admin passa em tudo o resto — e é suposto não passar aqui.
set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001"}';
set role authenticated;
select testes.deve_falhar(
  'nem o super_admin lê os tokens',
  'select token_cifrado from public.ligacoes_segredos'
);
select testes.deve_falhar(
  'nem os escreve',
  format($f$insert into public.ligacoes_segredos (ligacao_id, token_cifrado)
            values (%L, 'meu')$f$, current_setting('testes.ligacao_b'))
);

-- Marcar uma ligação como expirada é trabalho do sincronizador. Se fosse
-- chamável do browser, qualquer pessoa desligava o painel de um cliente.
select testes.deve_falhar(
  'marcar_estado_ligacao não é chamável por authenticated',
  format($f$select public.marcar_estado_ligacao(%L, 'expirada', 'a martelo')$f$,
         current_setting('testes.ligacao_a'))
);
reset role;

do $$
begin
  perform testes.verificar(
    'a service_role lê o token, que é o único sítio onde ele é preciso',
    (select count(*) from public.ligacoes_segredos) = 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- O super_admin vê os números de todos os quadros
-- ---------------------------------------------------------------------------

\echo '\n== O super_admin =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001"}';
set role authenticated;

do $$
begin
  -- pode_aceder_quadro devolve verdadeiro para o super_admin sem convite
  -- nenhum, e as políticas destas tabelas delegam nela — logo isto sai de
  -- graça, e é a prova de que delega mesmo.
  perform testes.verificar(
    'o super_admin vê as ligações dos dois clientes',
    (select count(*) from public.ligacoes_redes) = 2
  );
  perform testes.verificar(
    'e as métricas dos dois',
    (select count(*) from public.metricas_redes) = 5
  );
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Trocar de conta deita fora o histórico; renovar a mesma preserva-o
-- ---------------------------------------------------------------------------

\echo '\n== Trocar e renovar =='

set role service_role;
update public.ligacoes_redes
set primeiro_dia = current_date - 2, sincronizada_em = now()
where id = current_setting('testes.ligacao_a')::uuid;
reset role;

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

-- Renovar um token expirado é voltar a ligar a MESMA conta. É o caso comum, e
-- deitar fora um ano de histórico por causa dele seria um desastre silencioso.
select public.definir_ligacao_rede(
  current_setting('testes.quadro_a')::uuid,
  'instagram',
  'ig-17841400000000001',
  'creativeline.pt',
  null,
  now() + interval '60 days'
);

do $$
begin
  perform testes.verificar(
    'voltar a ligar a mesma conta preserva o histórico',
    (select count(*) from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid) = 4
  );
  perform testes.verificar(
    'e preserva o primeiro dia',
    (select primeiro_dia from public.ligacoes_redes
      where id = current_setting('testes.ligacao_a')::uuid) = current_date - 2
  );
end;
$$;

-- Ligar OUTRA conta é outra série. Somar os números de duas contas diferentes
-- seria mentir ao cliente com um gráfico.
select public.definir_ligacao_rede(
  current_setting('testes.quadro_a')::uuid,
  'instagram',
  'ig-17841400000000009',
  'creativeline.novo',
  null,
  now() + interval '60 days'
);

do $$
begin
  perform testes.verificar(
    'trocar de conta apaga o histórico da anterior',
    (select count(*) from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid) = 0
  );
  perform testes.verificar(
    'e a demografia dela',
    (select count(*) from public.demografia_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid) = 0
  );
  perform testes.verificar(
    'e as publicações dela',
    (select count(*) from public.publicacoes_redes
      where ligacao_id = current_setting('testes.ligacao_a')::uuid) = 0
  );
  perform testes.verificar(
    'e recomeça o primeiro dia do zero',
    (select primeiro_dia from public.ligacoes_redes
      where id = current_setting('testes.ligacao_a')::uuid) is null
  );
end;
$$;

reset role;

/*
  A limpeza acima apaga por `ligacao_id`, e o que é do outro cliente tem de
  ficar inteiro. Isto só se verifica de fora: a sessão da marta não vê o quadro
  B — que é, ele próprio, o comportamento certo — e uma contagem a zero lá
  dentro não distinguia "não apagou" de "não vejo".
*/
set role service_role;
do $$
begin
  perform testes.verificar(
    'trocar de conta não toca no que é do outro cliente',
    (select count(*) from public.metricas_redes
      where ligacao_id = current_setting('testes.ligacao_b')::uuid) = 1
  );
end;
$$;
reset role;

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

-- ---------------------------------------------------------------------------
-- Desligar
-- ---------------------------------------------------------------------------

\echo '\n== Desligar =='

do $$
declare
  v_ok boolean;
begin
  select public.remover_ligacao_rede(current_setting('testes.ligacao_a')::uuid)
    into v_ok;

  perform testes.verificar('a gestora desliga a conta do quadro dela', v_ok);
  perform testes.verificar(
    'e a ligação desaparece',
    (select count(*) from public.ligacoes_redes
      where id = current_setting('testes.ligacao_a')::uuid) = 0
  );

  -- Repetir o pedido é um duplo-clique, não um erro.
  select public.remover_ligacao_rede(current_setting('testes.ligacao_a')::uuid)
    into v_ok;
  perform testes.verificar('desligar duas vezes devolve falso, não rebenta', not v_ok);
end;
$$;

reset role;

-- O segredo vai atrás da ligação. Um token órfão é um token esquecido.
do $$
begin
  perform testes.verificar(
    'apagar a ligação leva o token com ela',
    (select count(*) from public.ligacoes_segredos) = 0
  );
  perform testes.verificar(
    'e o registo de sincronizações dela',
    (select count(*) from public.sincronizacoes) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- O registo
-- ---------------------------------------------------------------------------

do $$
begin
  perform testes.verificar(
    'ligar, trocar e desligar ficaram todos no acessos_log',
    (select count(*) from public.acessos_log
      where accao in ('rede:ligar', 'rede:desligar')) >= 5
  );
  perform testes.verificar(
    'e o registo diz que conta é que substituiu qual',
    (select count(*) from public.acessos_log
      where accao = 'rede:ligar'
        and detalhe ->> 'substituiu' = 'ig-17841400000000001') = 1
  );
  -- Renovar um token não é trocar de conta, e o registo tem de saber a
  -- diferença: é a única pergunta que se lhe faz mais tarde.
  perform testes.verificar(
    'e distingue renovar de substituir',
    (select count(*) from public.acessos_log
      where accao = 'rede:ligar' and (detalhe -> 'renovacao')::boolean) = 1
  );
end;
$$;

\echo '\n== Estatísticas de redes: passou =='
