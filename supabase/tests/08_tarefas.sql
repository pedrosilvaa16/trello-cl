-- Testes do separador «Tarefas».
--
-- "Nenhuma tabela vai para produção sem políticas RLS testadas." Quatro
-- tabelas novas, e uma regra só a defendê-las — o que torna esta bateria curta
-- e o teste 1 o único que interessa mesmo: um cliente ou um freelancer não vê
-- nada disto, nem sequer sabe que existe.
--
-- Correm com sessões reais (`set role authenticated` + o claim `sub`), nunca
-- com a service_role: um teste que corra por cima do RLS não testa o RLS.
--
-- Correr com: ./scripts/testar-rls.sh

\set ON_ERROR_STOP on

\echo '\n== Tarefas: o elenco =='

-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------

-- helena   super_admin
-- tomas    admin  (equipa da casa)
-- ines     admin  (equipa da casa)
-- carlos   externo — cliente
-- vera     admin, mas DESATIVADA

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', 'helena@empresa.pt', '{"nome": "Helena Sá"}'),
  ('c0000000-0000-4000-8000-000000000002', 'tomas@empresa.pt',  '{"nome": "Tomás Melo"}'),
  ('c0000000-0000-4000-8000-000000000003', 'ines@empresa.pt',   '{"nome": "Inês Cruz"}'),
  ('c0000000-0000-4000-8000-000000000004', 'carlos@fora.pt',    '{"nome": "Carlos Cliente"}'),
  ('c0000000-0000-4000-8000-000000000005', 'vera@empresa.pt',   '{"nome": "Vera Antiga"}');

update public.profiles set papel_global = 'super_admin'
  where id = 'c0000000-0000-4000-8000-000000000001';
update public.profiles set papel_global = 'admin'
  where id in ('c0000000-0000-4000-8000-000000000002',
               'c0000000-0000-4000-8000-000000000003',
               'c0000000-0000-4000-8000-000000000005');
update public.profiles set ativo = false
  where id = 'c0000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- 1. A equipa da casa entra e escreve
-- ---------------------------------------------------------------------------

\echo '\n== A equipa da casa =='

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000002"}';
set role authenticated;

do $$
begin
  perform testes.verificar('o admin passa em pode_gerir_tarefas', public.pode_gerir_tarefas());
end;
$$;

insert into public.tarefa_espacos (nome, cor, posicao, criado_por)
values ('Comercial', 'azul', 10, 'c0000000-0000-4000-8000-000000000002')
returning id \gset espaco_
select set_config('testes.espaco', :'espaco_id', false);

insert into public.tarefa_listas (espaco_id, nome, posicao, criado_por)
values (:'espaco_id', 'Propostas', 1, 'c0000000-0000-4000-8000-000000000002')
returning id \gset lista_
select set_config('testes.lista', :'lista_id', false);

insert into public.tarefas (lista_id, titulo, posicao, criado_por)
values (:'lista_id', 'Proposta para a Metaloviana', 1, 'c0000000-0000-4000-8000-000000000002')
returning id \gset tarefa_
select set_config('testes.tarefa', :'tarefa_id', false);

do $$
begin
  perform testes.verificar(
    'a tarefa herda o espaço da lista, sem ninguém o escrever',
    (select espaco_id from public.tarefas where id = current_setting('testes.tarefa')::uuid)
      = current_setting('testes.espaco')::uuid
  );
  perform testes.verificar(
    'e nasce por fazer, sem prioridade',
    (select estado = 'por_fazer' and prioridade is null
       from public.tarefas where id = current_setting('testes.tarefa')::uuid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. O CLIENTE NÃO VÊ NADA. É este que decide se isto vai para produção.
-- ---------------------------------------------------------------------------

\echo '\n== O cliente não sabe que isto existe =='

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000004"}';

do $$
begin
  perform testes.verificar(
    'um externo não passa em pode_gerir_tarefas',
    not public.pode_gerir_tarefas()
  );
  perform testes.verificar(
    'não vê espaço nenhum',
    (select count(*) from public.tarefa_espacos) = 0
  );
  perform testes.verificar(
    'nem lista nenhuma',
    (select count(*) from public.tarefa_listas) = 0
  );
  perform testes.verificar(
    'nem tarefa nenhuma',
    (select count(*) from public.tarefas) = 0
  );
  perform testes.verificar(
    'nem quem é responsável por elas',
    (select count(*) from public.tarefa_responsaveis) = 0
  );
end;
$$;

do $$
begin
  perform testes.deve_falhar(
    'e não cria um espaço',
    $sql$insert into public.tarefa_espacos (nome, posicao) values ('Meu', 1)$sql$
  );
  perform testes.deve_falhar(
    'nem uma tarefa numa lista que não vê',
    format(
      $sql$insert into public.tarefas (lista_id, titulo, posicao) values (%L, 'Intrusa', 1)$sql$,
      current_setting('testes.lista')
    )
  );
end;
$$;

do $$
begin
  -- Sob RLS um UPDATE sem permissão não rebenta: não encontra linha nenhuma.
  -- A diferença entre "recusado" e "invisível" interessa nas duas direções.
  perform testes.verificar(
    'e um UPDATE às cegas não acerta em nada',
    testes.linhas_afetadas(
      $sql$update public.tarefas set titulo = 'Apropriada'$sql$
    ) = 0
  );
  perform testes.verificar(
    'nem um DELETE',
    testes.linhas_afetadas($sql$delete from public.tarefas$sql$) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Uma conta desativada é como se não fosse da casa
-- ---------------------------------------------------------------------------

\echo '\n== A conta desativada =='

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000005"}';

do $$
begin
  perform testes.verificar(
    'ser admin não chega: a conta está desativada',
    not public.pode_gerir_tarefas()
  );
  perform testes.verificar(
    'e por isso não vê tarefa nenhuma',
    (select count(*) from public.tarefas) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Entre gestores não há níveis
-- ---------------------------------------------------------------------------

\echo '\n== Entre gestores não há níveis =='

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000003"}';

do $$
begin
  perform testes.verificar(
    'a Inês vê a tarefa que o Tomás escreveu',
    (select count(*) from public.tarefas
      where id = current_setting('testes.tarefa')::uuid) = 1
  );
  perform testes.verificar(
    'e altera-a — o separador é da casa, não de quem o escreveu',
    testes.linhas_afetadas(
      format(
        $sql$update public.tarefas set estado = 'em_curso' where id = %L$sql$,
        current_setting('testes.tarefa')
      )
    ) = 1
  );
end;
$$;

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000001"}';

do $$
begin
  perform testes.verificar(
    'e o super_admin também lá está',
    (select estado from public.tarefas
      where id = current_setting('testes.tarefa')::uuid) = 'em_curso'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. As colunas fechadas
-- ---------------------------------------------------------------------------

\echo '\n== O que nem a equipa da casa escreve à mão =='

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000002"}';

-- Um segundo espaço, para haver para onde apontar o `espaco_id` à mão.
insert into public.tarefa_espacos (nome, posicao) values ('Financeiro', 20)
returning id \gset outro_
select set_config('testes.outro_espaco', :'outro_id', false);

do $$
begin
  perform testes.deve_falhar(
    'espaco_id é do trigger e não se escreve num UPDATE',
    format(
      $sql$update public.tarefas set espaco_id = %L where id = %L$sql$,
      current_setting('testes.outro_espaco'),
      current_setting('testes.tarefa')
    )
  );
  perform testes.deve_falhar(
    'nem num INSERT',
    format(
      $sql$insert into public.tarefas (lista_id, espaco_id, titulo, posicao)
           values (%L, %L, 'Torta', 1)$sql$,
      current_setting('testes.lista'),
      current_setting('testes.outro_espaco')
    )
  );
  perform testes.deve_falhar(
    'atualizado_em também não',
    format(
      $sql$update public.tarefas set atualizado_em = now() where id = %L$sql$,
      current_setting('testes.tarefa')
    )
  );
end;
$$;

-- Mover a lista de espaço arrasta as tarefas atrás dela.
do $$
begin
  perform testes.verificar(
    'mover a lista de espaço leva as tarefas com ela',
    testes.linhas_afetadas(
      format(
        $sql$update public.tarefa_listas set espaco_id = %L where id = %L$sql$,
        current_setting('testes.outro_espaco'),
        current_setting('testes.lista')
      )
    ) = 1
  );
  perform testes.verificar(
    'e a tarefa vai mesmo — a desnormalização não fica a mentir',
    (select espaco_id from public.tarefas where id = current_setting('testes.tarefa')::uuid)
      = current_setting('testes.outro_espaco')::uuid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Subtarefas: um nível, e na mesma lista
-- ---------------------------------------------------------------------------

\echo '\n== Subtarefas =='

insert into public.tarefas (lista_id, mae_id, titulo, posicao, criado_por)
values (
  current_setting('testes.lista')::uuid,
  current_setting('testes.tarefa')::uuid,
  'Juntar os números do ano passado', 2,
  'c0000000-0000-4000-8000-000000000002'
) returning id \gset sub_
select set_config('testes.sub', :'sub_id', false);

-- Uma segunda lista, para tentar pôr a filha longe da mãe.
insert into public.tarefa_listas (espaco_id, nome, posicao)
values (current_setting('testes.outro_espaco')::uuid, 'Faturação', 2)
returning id \gset lista2_
select set_config('testes.lista2', :'lista2_id', false);

do $$
begin
  perform testes.verificar(
    'uma subtarefa nasce agarrada à mãe',
    (select mae_id from public.tarefas where id = current_setting('testes.sub')::uuid)
      = current_setting('testes.tarefa')::uuid
  );

  perform testes.deve_falhar(
    'uma subtarefa não pode ter subtarefas',
    format(
      $sql$insert into public.tarefas (lista_id, mae_id, titulo, posicao)
           values (%L, %L, 'Neta', 3)$sql$,
      current_setting('testes.lista'),
      current_setting('testes.sub')
    )
  );

  perform testes.deve_falhar(
    'uma tarefa que já é mãe não passa a filha',
    format(
      $sql$update public.tarefas set mae_id = %L where id = %L$sql$,
      current_setting('testes.sub'),
      current_setting('testes.tarefa')
    )
  );

  perform testes.deve_falhar(
    'a subtarefa não sai da lista da mãe',
    format(
      $sql$update public.tarefas set lista_id = %L where id = %L$sql$,
      current_setting('testes.lista2'),
      current_setting('testes.sub')
    )
  );

  perform testes.deve_falhar(
    'e não é mãe de si própria',
    format(
      $sql$update public.tarefas set mae_id = id where id = %L$sql$,
      current_setting('testes.sub')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Responsáveis: só a equipa da casa
-- ---------------------------------------------------------------------------

\echo '\n== Responsáveis =='

do $$
begin
  perform testes.verificar(
    'atribuir a uma colega da casa',
    testes.linhas_afetadas(
      format(
        $sql$insert into public.tarefa_responsaveis (tarefa_id, user_id)
             values (%L, 'c0000000-0000-4000-8000-000000000003')$sql$,
        current_setting('testes.tarefa')
      )
    ) = 1
  );

  /*
    O que isto impede é o pior modo de falha do separador: uma tarefa
    atribuída a um cliente, que ele nunca veria — o RLS de `tarefas` recusa-lhe
    tudo — e que ficaria à espera de alguém que nunca soube dela.
  */
  perform testes.deve_falhar(
    'mas NÃO a um cliente, que nunca a veria',
    format(
      $sql$insert into public.tarefa_responsaveis (tarefa_id, user_id)
           values (%L, 'c0000000-0000-4000-8000-000000000004')$sql$,
      current_setting('testes.tarefa')
    )
  );

  perform testes.deve_falhar(
    'nem a uma conta desativada',
    format(
      $sql$insert into public.tarefa_responsaveis (tarefa_id, user_id)
           values (%L, 'c0000000-0000-4000-8000-000000000005')$sql$,
      current_setting('testes.tarefa')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7b. A equipa vê-se toda, partilhe ou não um quadro
-- ---------------------------------------------------------------------------

/*
  A regressão que isto guarda apanhou-se a correr os testes, e não a ler o
  código: `profiles` tem RLS (`partilha_quadro`), e duas gestoras que não
  partilhem nenhum quadro não se veem uma à outra. Com a condição escrita
  dentro da política, atribuir uma tarefa a uma colega era recusado; com um
  `select` a `profiles` do lado da aplicação, o menu de responsáveis aparecia
  quase vazio. Nenhuma das duas dizia porquê.

  O Tomás e a Inês não partilham quadro nenhum — é essa a razão de estarem
  aqui.
*/
do $$
begin
  perform testes.verificar(
    'as duas gestoras não partilham quadro nenhum',
    not public.partilha_quadro('c0000000-0000-4000-8000-000000000003')
  );
  perform testes.verificar(
    'e mesmo assim veem-se uma à outra na equipa',
    (select count(*) from public.equipa_da_casa()
      where id = 'c0000000-0000-4000-8000-000000000003') = 1
  );
  perform testes.verificar(
    'a conta desativada não entra na equipa',
    (select count(*) from public.equipa_da_casa()
      where id = 'c0000000-0000-4000-8000-000000000005') = 0
  );
  perform testes.verificar(
    'nem o cliente',
    (select count(*) from public.equipa_da_casa()
      where id = 'c0000000-0000-4000-8000-000000000004') = 0
  );
end;
$$;

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000004"}';

do $$
begin
  perform testes.verificar(
    'e um cliente nem fica a saber quem trabalha na casa',
    (select count(*) from public.equipa_da_casa()) = 0
  );
end;
$$;

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000002"}';

-- ---------------------------------------------------------------------------
-- 7c. Documentos
-- ---------------------------------------------------------------------------

\echo '\n== Documentos =='

do $$
declare
  v_caminho text;
begin
  v_caminho := format('tarefas/%s/%s/abc-proposta.pdf',
                      current_setting('testes.outro_espaco'),
                      current_setting('testes.tarefa'));

  perform testes.verificar(
    'anexar um documento à tarefa',
    testes.linhas_afetadas(format(
      $sql$insert into public.tarefa_anexos
             (tarefa_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'proposta.pdf', %L, 12345, 'application/pdf',
                   'c0000000-0000-4000-8000-000000000002')$sql$,
      current_setting('testes.tarefa'), v_caminho)) = 1
  );

  /*
    O fecho que faz a rota de envio ser a única fonte possível de chaves.

    Sem o trigger, uma linha podia dizer «sou da tarefa A» e apontar para o
    ficheiro da tarefa B. A rota de leitura assina o que a linha disser, e a
    linha é visível — o RLS não tem como saber que o caminho não é dela.
  */
  perform testes.deve_falhar(
    'um caminho que não cai debaixo da tarefa é recusado',
    format(
      $sql$insert into public.tarefa_anexos
             (tarefa_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'roubado.pdf', 'tarefas/outro-espaco/outra-tarefa/x-roubado.pdf',
                   10, 'application/pdf', 'c0000000-0000-4000-8000-000000000002')$sql$,
      current_setting('testes.tarefa'))
  );

  perform testes.deve_falhar(
    'nem um caminho de um anexo de quadro',
    format(
      $sql$insert into public.tarefa_anexos
             (tarefa_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'do-cliente.pdf', 'boards/qualquer/cards/qualquer/x.pdf',
                   10, 'application/pdf', 'c0000000-0000-4000-8000-000000000002')$sql$,
      current_setting('testes.tarefa'))
  );

  perform testes.deve_falhar(
    'e um ficheiro acima de 200 MB não entra',
    format(
      $sql$insert into public.tarefa_anexos
             (tarefa_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'enorme.zip', %L, 209715201, 'application/zip',
                   'c0000000-0000-4000-8000-000000000002')$sql$,
      current_setting('testes.tarefa'),
      format('tarefas/%s/%s/zzz-enorme.zip',
             current_setting('testes.outro_espaco'), current_setting('testes.tarefa')))
  );
end;
$$;

-- O cliente não vê nem toca nos documentos da casa.
set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000004"}';

do $$
begin
  perform testes.verificar(
    'um externo não vê documento nenhum',
    (select count(*) from public.tarefa_anexos) = 0
  );
  perform testes.verificar(
    'e um DELETE às cegas não acerta em nada',
    testes.linhas_afetadas($sql$delete from public.tarefa_anexos$sql$) = 0
  );
end;
$$;

set request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-000000000002"}';

-- ---------------------------------------------------------------------------
-- 8. Apagar leva o que está por baixo
-- ---------------------------------------------------------------------------

\echo '\n== Cascatas =='

do $$
begin
  perform testes.verificar(
    'apagar a mãe leva a subtarefa',
    testes.linhas_afetadas(
      format($sql$delete from public.tarefas where id = %L$sql$,
             current_setting('testes.tarefa'))
    ) = 1
  );
  perform testes.verificar(
    'a subtarefa foi-se com ela',
    (select count(*) from public.tarefas
      where id = current_setting('testes.sub')::uuid) = 0
  );
  perform testes.verificar(
    'e o responsável que lá estava também',
    (select count(*) from public.tarefa_responsaveis
      where tarefa_id = current_setting('testes.tarefa')::uuid) = 0
  );
  /*
    O documento vai com a tarefa. A linha desaparece por cascata; o ficheiro no
    R2 é apagado pela rota, que é onde vivem as credenciais — a base de dados
    não tem como lá chegar, e é por isso que apagar uma tarefa com documentos
    pela interface passa por lá.
  */
  perform testes.verificar(
    'e os documentos que lá estavam',
    (select count(*) from public.tarefa_anexos
      where tarefa_id = current_setting('testes.tarefa')::uuid) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. O separador não toca nos quadros dos clientes
-- ---------------------------------------------------------------------------

\echo '\n== Separado dos quadros =='

do $$
declare
  v_ligacoes integer;
begin
  /*
    A característica principal do desenho, e não uma omissão: nenhuma das
    quatro tabelas tem chave estrangeira para `boards` ou para `cards`. Se
    alguém um dia acrescentar uma, este teste é que dá por isso — e a essa
    altura já será tarde para discutir se um quadro é um cliente.
  */
  select count(*) into v_ligacoes
  from pg_constraint c
  join pg_class origem  on origem.oid  = c.conrelid
  join pg_class destino on destino.oid = c.confrelid
  where c.contype = 'f'
    and origem.relname in ('tarefas', 'tarefa_listas', 'tarefa_espacos', 'tarefa_responsaveis')
    and destino.relname in ('boards', 'cards', 'lists', 'board_members');

  perform testes.verificar(
    'as tarefas não têm ligação nenhuma aos quadros nem aos cartões',
    v_ligacoes = 0
  );
end;
$$;

reset role;
reset request.jwt.claims;

\echo '\n== Tarefas: passou =='
