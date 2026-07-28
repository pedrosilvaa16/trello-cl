-- Testes de aceitação dos níveis de acesso.
--
-- Os dez que a especificação exige, por esta ordem. Correm com sessões reais
-- (`set role authenticated` + o claim `sub` do JWT), nunca com a service_role:
-- um teste que corra por cima do RLS não testa o RLS.
--
-- Os testes 1 e 2 são os que interessam. Se algum falhar, nada disto vai para
-- produção — um cliente a ver o quadro de outro é, muito provavelmente, um
-- cliente a ver o quadro de um concorrente direto.
--
-- Correr com: ./scripts/testar-rls.sh

\set ON_ERROR_STOP on

\echo '\n== Níveis de acesso: o elenco =='

-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------

-- sofia       super_admin
-- marta       admin global, gestora do quadro do Cliente A
-- rui         admin global, gestor do quadro do Cliente B
-- cliente_a   externo + comentador no quadro A       ("cliente")
-- cliente_b   externo + comentador no quadro B       ("cliente")
-- nuno        externo + editor no cartão X do quadro A ("freelancer")
-- velho       externo, membro do quadro A, desativado

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'sofia@empresa.pt',   '{"nome": "Sofia Lima"}'),
  ('a0000000-0000-4000-8000-000000000002', 'marta@empresa.pt',   '{"nome": "Marta Reis"}'),
  ('a0000000-0000-4000-8000-000000000003', 'rui@empresa.pt',     '{"nome": "Rui Matos"}'),
  ('a0000000-0000-4000-8000-000000000004', 'cliente.a@fora.pt',  '{"nome": "Cliente A"}'),
  ('a0000000-0000-4000-8000-000000000005', 'cliente.b@fora.pt',  '{"nome": "Cliente B"}'),
  ('a0000000-0000-4000-8000-000000000006', 'nuno@fora.pt',       '{"nome": "Nuno Freelancer"}'),
  ('a0000000-0000-4000-8000-000000000007', 'velho@empresa.pt',   '{"nome": "Conta Antiga"}');

update public.profiles set papel_global = 'super_admin'
  where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set papel_global = 'admin'
  where id in ('a0000000-0000-4000-8000-000000000002',
               'a0000000-0000-4000-8000-000000000003');

do $$
begin
  perform testes.verificar(
    'as contas novas nascem em externo',
    (select papel_global from public.profiles
      where id = 'a0000000-0000-4000-8000-000000000004') = 'externo'
  );
  perform testes.verificar(
    'e nascem ativas',
    (select ativo from public.profiles
      where id = 'a0000000-0000-4000-8000-000000000004')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Quadro do Cliente A, pela Marta
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

select id as quadro_a from public.criar_quadro('Cliente A', 'Redes sociais') \gset
select set_config('testes.quadro_a', :'quadro_a', false);

insert into public.lists (board_id, nome, posicao)
values (:'quadro_a', 'Em curso', 1) returning id \gset lista_a_
select set_config('testes.lista_a', :'lista_a_id', false);

insert into public.lists (board_id, nome, posicao)
values (:'quadro_a', 'Concluído', 2) returning id \gset lista_a2_
select set_config('testes.lista_a2', :'lista_a2_id', false);

insert into public.cards (list_id, titulo, posicao, criado_por)
values (:'lista_a_id', 'Cartão X — para o freelancer', 1,
        'a0000000-0000-4000-8000-000000000002')
returning id \gset cartao_x_
select set_config('testes.cartao_x', :'cartao_x_id', false);

insert into public.cards (list_id, titulo, posicao, criado_por)
values (:'lista_a_id', 'Cartão Y — não é para ele', 2,
        'a0000000-0000-4000-8000-000000000002')
returning id \gset cartao_y_
select set_config('testes.cartao_y', :'cartao_y_id', false);

insert into public.comments (card_id, autor_id, corpo)
values (:'cartao_x_id', 'a0000000-0000-4000-8000-000000000002', 'Nota interna da Marta');

insert into public.attachments
  (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
values (
  :'cartao_x_id', 'briefing-a.pdf',
  'boards/' || :'quadro_a' || '/cards/' || :'cartao_x_id' || '/aaa-briefing-a.pdf',
  1024, 'application/pdf', 'a0000000-0000-4000-8000-000000000002'
) returning id \gset anexo_a_
select set_config('testes.anexo_a', :'anexo_a_id', false);

do $$
begin
  perform testes.verificar(
    'quem cria o quadro fica gestor dele',
    public.papel_no_quadro(current_setting('testes.quadro_a')::uuid) = 'gestor'
  );
  perform testes.verificar(
    'o cartão herdou o board_id por trigger',
    (select board_id from public.cards where id = current_setting('testes.cartao_x')::uuid)
      = current_setting('testes.quadro_a')::uuid
  );
end;
$$;

-- O cliente entra como comentador; o freelancer só recebe o cartão X.
insert into public.board_members (board_id, user_id, papel)
values (:'quadro_a', 'a0000000-0000-4000-8000-000000000004', 'comentador');

insert into public.board_members (board_id, user_id, papel)
values (:'quadro_a', 'a0000000-0000-4000-8000-000000000007', 'editor');

select * from public.conceder_acesso_cartao(
  :'cartao_x_id', 'a0000000-0000-4000-8000-000000000006', 'editor', null
) \gset acesso_x_

reset role;

-- ---------------------------------------------------------------------------
-- Quadro do Cliente B, pelo Rui
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000003"}';
set role authenticated;

select id as quadro_b from public.criar_quadro('Cliente B', 'Concorrente do A') \gset
select set_config('testes.quadro_b', :'quadro_b', false);

insert into public.lists (board_id, nome, posicao)
values (:'quadro_b', 'Em curso', 1) returning id \gset lista_b_
select set_config('testes.lista_b', :'lista_b_id', false);

insert into public.cards (list_id, titulo, posicao, criado_por)
values (:'lista_b_id', 'Campanha do Cliente B', 1,
        'a0000000-0000-4000-8000-000000000003')
returning id \gset cartao_z_
select set_config('testes.cartao_z', :'cartao_z_id', false);

insert into public.comments (card_id, autor_id, corpo)
values (:'cartao_z_id', 'a0000000-0000-4000-8000-000000000003', 'Segredo comercial do B');

insert into public.attachments
  (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
values (
  :'cartao_z_id', 'orcamento-b.pdf',
  'boards/' || :'quadro_b' || '/cards/' || :'cartao_z_id' || '/bbb-orcamento-b.pdf',
  2048, 'application/pdf', 'a0000000-0000-4000-8000-000000000003'
) returning id \gset anexo_b_
select set_config('testes.anexo_b', :'anexo_b_id', false);

insert into public.board_members (board_id, user_id, papel)
values (:'quadro_b', 'a0000000-0000-4000-8000-000000000005', 'comentador');

reset role;

-- ===========================================================================
-- 1. Cliente A não lê nada do quadro do Cliente B
-- ===========================================================================

\echo '\n== 1. O cliente A não lê nada do quadro do cliente B =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000004"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'vê o quadro dele, e só esse',
    (select count(*) from public.boards) = 1
      and (select nome from public.boards) = 'Cliente A'
  );
  perform testes.verificar(
    'não vê o quadro do B nem com o id à frente',
    (select count(*) from public.boards
      where id = current_setting('testes.quadro_b')::uuid) = 0
  );
  perform testes.verificar(
    'não vê as listas do B',
    (select count(*) from public.lists
      where board_id = current_setting('testes.quadro_b')::uuid) = 0
  );
  perform testes.verificar(
    'não vê os cartões do B',
    (select count(*) from public.cards
      where id = current_setting('testes.cartao_z')::uuid) = 0
  );
  perform testes.verificar(
    'não vê os comentários do B',
    (select count(*) from public.comments
      where card_id = current_setting('testes.cartao_z')::uuid) = 0
  );
  perform testes.verificar(
    'não vê os anexos do B',
    (select count(*) from public.attachments
      where id = current_setting('testes.anexo_b')::uuid) = 0
  );
  perform testes.verificar(
    'não vê as etiquetas do B',
    (select count(*) from public.labels
      where board_id = current_setting('testes.quadro_b')::uuid) = 0
  );
  perform testes.verificar(
    'não vê os membros do B',
    (select count(*) from public.board_members
      where board_id = current_setting('testes.quadro_b')::uuid) = 0
  );
  perform testes.verificar(
    'nem o perfil do cliente B (não partilham nada)',
    (select count(*) from public.profiles
      where id = 'a0000000-0000-4000-8000-000000000005') = 0
  );
  -- As funções de permissão dizem o mesmo que as políticas. Se divergissem,
  -- a interface mostrava um botão que a base de dados depois recusava.
  perform testes.verificar(
    'e pode_aceder_quadro concorda',
    public.pode_aceder_quadro(current_setting('testes.quadro_b')::uuid) = false
  );
  perform testes.verificar(
    'e pode_aceder_cartao também',
    public.pode_aceder_cartao(current_setting('testes.cartao_z')::uuid) = false
  );
end;
$$;

-- ===========================================================================
-- 2. Cliente A não chega ao anexo do quadro B, mesmo com o id na mão
-- ===========================================================================

\echo '\n== 2. O cliente A não obtém o anexo do quadro B =='

/*
  A rota /api/anexos/[id] lê a linha do anexo com a sessão de quem pede, e é
  essa leitura que decide se assina o URL: sem linha, não há nada para assinar.
  É esse SELECT — o mesmo, com os mesmos filtros — que está aqui.

  A rota em si é testada por HTTP em scripts/testar-api.mjs; isto é a camada
  por baixo dela, e é a que aguenta se alguém um dia trocar o handler.
*/
do $$
begin
  perform testes.verificar(
    'o select da rota devolve zero linhas para o anexo do B',
    (select count(*) from public.attachments
      where id = current_setting('testes.anexo_b')::uuid) = 0
  );
  perform testes.verificar(
    'e o caminho no storage não lhe chega às mãos',
    (select count(*) from public.attachments
      where caminho_storage like 'boards/' || current_setting('testes.quadro_b') || '%') = 0
  );
  perform testes.verificar(
    'nem sequer sabe a que cartão pertence',
    public.quadro_do_cartao(current_setting('testes.cartao_z')::uuid) is not null
      and public.pode_aceder_cartao(current_setting('testes.cartao_z')::uuid) = false
  );
end;
$$;

reset role;

-- ===========================================================================
-- 3. Freelancer lê o cartão X e não lê o cartão Y do mesmo quadro
-- ===========================================================================

\echo '\n== 3. O freelancer vê o cartão dele e não o do lado =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000006"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'lê o cartão X',
    (select count(*) from public.cards
      where id = current_setting('testes.cartao_x')::uuid) = 1
  );
  perform testes.verificar(
    'não lê o cartão Y, que está na mesma lista',
    (select count(*) from public.cards
      where id = current_setting('testes.cartao_y')::uuid) = 0
  );
  perform testes.verificar(
    'não vê o quadro à volta',
    (select count(*) from public.boards) = 0
  );
  perform testes.verificar(
    'nem as listas dele',
    (select count(*) from public.lists) = 0
  );
  perform testes.verificar(
    'vê os comentários do cartão X',
    (select count(*) from public.comments
      where card_id = current_setting('testes.cartao_x')::uuid) = 1
  );
  perform testes.verificar(
    'e o anexo do cartão X',
    (select count(*) from public.attachments
      where id = current_setting('testes.anexo_a')::uuid) = 1
  );
  perform testes.verificar(
    'edita o cartão X, porque lhe deram editor',
    testes.linhas_afetadas(format(
      $sql$update public.cards set descricao = 'feito' where id = %L$sql$,
      current_setting('testes.cartao_x')
    )) = 1
  );
  perform testes.verificar(
    'e não toca no cartão Y',
    testes.linhas_afetadas(format(
      $sql$update public.cards set descricao = 'intruso' where id = %L$sql$,
      current_setting('testes.cartao_y')
    )) = 0
  );
  -- Mudar de lista é trabalho de quadro: quem só tem o cartão não o arrasta
  -- para outro sítio, senão levava-o para um quadro onde não devia entrar.
  perform testes.deve_falhar(
    'não muda o cartão X para uma lista do quadro do concorrente',
    format(
      $sql$update public.cards set list_id = %L where id = %L$sql$,
      current_setting('testes.lista_b'), current_setting('testes.cartao_x')
    )
  );
  perform testes.deve_falhar(
    'nem para a lista do lado, dentro do próprio quadro',
    format(
      $sql$update public.cards set list_id = %L where id = %L$sql$,
      current_setting('testes.lista_a2'), current_setting('testes.cartao_x')
    )
  );
end;
$$;

-- "Os meus trabalhos": o ecrã que existe porque ele não pode abrir o quadro.
do $$
begin
  perform testes.verificar(
    'os meus trabalhos devolve o cartão X, com o nome do cliente',
    (select count(*) from public.os_meus_trabalhos()) = 1
  );
  perform testes.verificar(
    'e diz de que cliente é, sem lhe dar o quadro',
    (select quadro from public.os_meus_trabalhos()) = 'Cliente A'
  );
end;
$$;

reset role;

-- ===========================================================================
-- 4. Acesso expirado deixa de funcionar sozinho
-- ===========================================================================

\echo '\n== 4. Um acesso com expira_em no passado morre sozinho =='

-- Posto pela gestora do quadro, como na aplicação.
set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

update public.card_access
set expira_em = now() - interval '1 day'
where card_id = current_setting('testes.cartao_x')::uuid
  and user_id = 'a0000000-0000-4000-8000-000000000006';

reset role;

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000006"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'o cartão X desapareceu-lhe, sem ninguém ter revogado nada',
    (select count(*) from public.cards
      where id = current_setting('testes.cartao_x')::uuid) = 0
  );
  perform testes.verificar(
    'os comentários foram atrás',
    (select count(*) from public.comments
      where card_id = current_setting('testes.cartao_x')::uuid) = 0
  );
  perform testes.verificar(
    'e o anexo também',
    (select count(*) from public.attachments
      where id = current_setting('testes.anexo_a')::uuid) = 0
  );
  perform testes.verificar(
    'os meus trabalhos ficou vazio',
    (select count(*) from public.os_meus_trabalhos()) = 0
  );
  perform testes.verificar(
    'e já não consegue editar',
    testes.linhas_afetadas(format(
      $sql$update public.cards set descricao = 'tarde demais' where id = %L$sql$,
      current_setting('testes.cartao_x')
    )) = 0
  );
end;
$$;

reset role;

-- Devolver o acesso para os testes seguintes.
set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;
update public.card_access
set expira_em = null
where card_id = current_setting('testes.cartao_x')::uuid
  and user_id = 'a0000000-0000-4000-8000-000000000006';
reset role;

-- ===========================================================================
-- 5. Um admin não altera o papel global de ninguém
-- ===========================================================================

\echo '\n== 5. O admin não mexe no eixo A =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

do $$
begin
  perform testes.deve_falhar(
    'a marta não promove o freelancer a admin',
    $sql$select public.definir_papel_global(
      'a0000000-0000-4000-8000-000000000006', 'admin')$sql$
  );
  perform testes.deve_falhar(
    'nem se promove a si própria a super_admin',
    $sql$select public.definir_papel_global(
      'a0000000-0000-4000-8000-000000000002', 'super_admin')$sql$
  );
  perform testes.deve_falhar(
    'nem desativa contas',
    $sql$select public.definir_estado_conta(
      'a0000000-0000-4000-8000-000000000003', false)$sql$
  );
  -- O caminho direto pela tabela está fechado por GRANT de coluna, não por
  -- política: o RLS não sabe distinguir colunas, os privilégios sabem.
  perform testes.deve_falhar(
    'e o update direto na sua própria linha de profiles é recusado',
    $sql$update public.profiles set papel_global = 'super_admin'
         where id = 'a0000000-0000-4000-8000-000000000002'$sql$
  );
  perform testes.verificar(
    'o papel dela continua a ser admin',
    (select papel_global from public.profiles
      where id = 'a0000000-0000-4000-8000-000000000002') = 'admin'
  );
  -- O que ela pode: mudar o próprio nome.
  perform testes.verificar(
    'mas continua a poder mudar o seu nome',
    testes.linhas_afetadas(
      $sql$update public.profiles set nome = 'Marta Reis'
           where id = 'a0000000-0000-4000-8000-000000000002'$sql$
    ) = 1
  );
end;
$$;

-- ===========================================================================
-- 6. Um admin não acede a um quadro onde não é membro
-- ===========================================================================

\echo '\n== 6. O admin não entra em quadros alheios =='

do $$
begin
  perform testes.verificar(
    'a marta não vê o quadro do rui',
    (select count(*) from public.boards
      where id = current_setting('testes.quadro_b')::uuid) = 0
  );
  perform testes.verificar(
    'nem os cartões dele',
    (select count(*) from public.cards
      where id = current_setting('testes.cartao_z')::uuid) = 0
  );
  perform testes.verificar(
    'nem o anexo dele',
    (select count(*) from public.attachments
      where id = current_setting('testes.anexo_b')::uuid) = 0
  );
  perform testes.verificar(
    'ser admin global não a torna membro',
    public.pode_aceder_quadro(current_setting('testes.quadro_b')::uuid) = false
  );
  perform testes.deve_falhar(
    'e não se acrescenta ao quadro do rui',
    format(
      $sql$select public.definir_membro_quadro(
        %L, 'a0000000-0000-4000-8000-000000000002', 'gestor')$sql$,
      current_setting('testes.quadro_b')
    )
  );
  perform testes.deve_falhar(
    'nem dá acesso a um cartão dele a um freelancer',
    format(
      $sql$select public.conceder_acesso_cartao(
        %L, 'a0000000-0000-4000-8000-000000000006', 'editor', null)$sql$,
      current_setting('testes.cartao_z')
    )
  );
  perform testes.deve_falhar(
    'nem convida ninguém para lá',
    format(
      $sql$select public.criar_convite(
        'intruso@fora.pt', 'tok-intruso', 'externo',
        jsonb_build_array(jsonb_build_object('quadro', %L, 'papel', 'editor')))$sql$,
      current_setting('testes.quadro_b')
    )
  );
end;
$$;

reset role;

-- ===========================================================================
-- 7. O comentador comenta, e não cria nem edita cartões
-- ===========================================================================

\echo '\n== 7. O comentador comenta e mais nada =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000004"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'lê o quadro dele todo',
    (select count(*) from public.cards
      where board_id = current_setting('testes.quadro_a')::uuid) = 2
  );
  perform testes.verificar(
    'passa em pode_aceder_cartao',
    public.pode_aceder_cartao(current_setting('testes.cartao_x')::uuid)
  );
  perform testes.verificar(
    'e falha em pode_editar_cartao',
    public.pode_editar_cartao(current_setting('testes.cartao_x')::uuid) = false
  );
  perform testes.verificar(
    'comenta em nome próprio',
    testes.linhas_afetadas(format(
      $sql$insert into public.comments (card_id, autor_id, corpo)
           values (%L, 'a0000000-0000-4000-8000-000000000004', 'Aprovado do meu lado')$sql$,
      current_setting('testes.cartao_x')
    )) = 1
  );
  perform testes.deve_falhar(
    'não cria cartões',
    format(
      $sql$insert into public.cards (list_id, titulo, posicao)
           select id, 'Cartão do cliente', 9 from public.lists
           where board_id = %L limit 1$sql$,
      current_setting('testes.quadro_a')
    )
  );
  perform testes.verificar(
    'não edita cartões',
    testes.linhas_afetadas(format(
      $sql$update public.cards set titulo = 'Mudei eu' where id = %L$sql$,
      current_setting('testes.cartao_x')
    )) = 0
  );
  perform testes.verificar(
    'não apaga cartões',
    testes.linhas_afetadas(format(
      $sql$delete from public.cards where id = %L$sql$,
      current_setting('testes.cartao_y')
    )) = 0
  );
  perform testes.deve_falhar(
    'não anexa ficheiros',
    format(
      $sql$insert into public.attachments
             (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'x.pdf', 'boards/x/cards/y/z-x.pdf', 10, 'application/pdf',
                   'a0000000-0000-4000-8000-000000000004')$sql$,
      current_setting('testes.cartao_x')
    )
  );
  perform testes.deve_falhar(
    'e não convida ninguém para o quadro',
    format(
      $sql$select public.definir_membro_quadro(
        %L, 'a0000000-0000-4000-8000-000000000006', 'editor')$sql$,
      current_setting('testes.quadro_a')
    )
  );
  -- O comentário que escreveu continua a ser dele.
  perform testes.verificar(
    'mas edita o comentário que escreveu',
    testes.linhas_afetadas(
      $sql$update public.comments set corpo = 'Aprovado, com uma nota'
           where autor_id = 'a0000000-0000-4000-8000-000000000004'$sql$
    ) = 1
  );
end;
$$;

reset role;

-- ===========================================================================
-- 8. O super_admin acede a tudo
-- ===========================================================================

\echo '\n== 8. O super_admin acede a tudo =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'vê os dois quadros sem estar em nenhum',
    (select count(*) from public.boards
      where id in (current_setting('testes.quadro_a')::uuid,
                   current_setting('testes.quadro_b')::uuid)) = 2
  );
  perform testes.verificar(
    'sem uma única linha em board_members',
    (select count(*) from public.board_members
      where user_id = 'a0000000-0000-4000-8000-000000000001') = 0
  );
  perform testes.verificar(
    'vê os cartões dos dois',
    (select count(*) from public.cards
      where id in (current_setting('testes.cartao_x')::uuid,
                   current_setting('testes.cartao_z')::uuid)) = 2
  );
  perform testes.verificar(
    'vê os anexos dos dois',
    (select count(*) from public.attachments
      where id in (current_setting('testes.anexo_a')::uuid,
                   current_setting('testes.anexo_b')::uuid)) = 2
  );
  perform testes.verificar(
    'é gestor de qualquer quadro',
    public.papel_no_quadro(current_setting('testes.quadro_b')::uuid) = 'gestor'
  );
  perform testes.verificar(
    'edita um cartão de um quadro onde não é membro',
    testes.linhas_afetadas(format(
      $sql$update public.cards set descricao = 'revisto pela sofia' where id = %L$sql$,
      current_setting('testes.cartao_z')
    )) = 1
  );
  perform testes.verificar(
    'e vê toda a gente no painel de pessoas',
    (select count(*) from public.listar_pessoas()) >= 7
  );
end;
$$;

-- E é o único que mexe no eixo A.
do $$
begin
  perform testes.verificar(
    'promove o rui a super_admin',
    (public.definir_papel_global(
      'a0000000-0000-4000-8000-000000000003', 'super_admin')).papel_global = 'super_admin'
  );
  perform testes.verificar(
    'e a alteração ficou registada em acessos_log',
    (select count(*) from public.acessos_log
      where accao = 'papel_global'
        and alvo_id = 'a0000000-0000-4000-8000-000000000003') = 1
  );
  perform testes.verificar(
    'volta a pô-lo em admin',
    (public.definir_papel_global(
      'a0000000-0000-4000-8000-000000000003', 'admin')).papel_global = 'admin'
  );
end;
$$;

reset role;

-- ===========================================================================
-- 9. Uma conta desativada não entra e não conta como membro
-- ===========================================================================

\echo '\n== 9. A conta desativada não entra =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'a sofia desativa a conta antiga',
    (public.definir_estado_conta(
      'a0000000-0000-4000-8000-000000000007', false)).ativo = false
  );
  perform testes.verificar(
    'e ficou registado',
    (select count(*) from public.acessos_log
      where accao = 'desativar'
        and alvo_id = 'a0000000-0000-4000-8000-000000000007') = 1
  );
  perform testes.verificar(
    'deixou de contar como membro do quadro A',
    public.e_membro_do_quadro(
      current_setting('testes.quadro_a')::uuid,
      'a0000000-0000-4000-8000-000000000007') = false
  );
end;
$$;

reset role;

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000007"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'o quadro desapareceu-lhe',
    (select count(*) from public.boards) = 0
  );
  perform testes.verificar(
    'e os cartões com ele',
    (select count(*) from public.cards) = 0
  );
  perform testes.verificar(
    'pode_aceder_quadro diz que não',
    public.pode_aceder_quadro(current_setting('testes.quadro_a')::uuid) = false
  );
  perform testes.verificar(
    'papel_global_atual não devolve nada',
    public.papel_global_atual() is null
  );
  perform testes.verificar(
    'não escreve comentários',
    testes.linhas_afetadas(format(
      $sql$insert into public.comments (card_id, autor_id, corpo)
           select %L, 'a0000000-0000-4000-8000-000000000007', 'ainda cá ando'
           where public.pode_comentar_cartao(%L)$sql$,
      current_setting('testes.cartao_x'), current_setting('testes.cartao_x')
    )) = 0
  );
end;
$$;

reset role;

do $$
begin
  -- O nome tem de continuar a aparecer no que escreveu: é por isto que as
  -- contas se desativam em vez de se apagarem.
  perform testes.verificar(
    'a linha em board_members não foi apagada',
    (select count(*) from public.board_members
      where user_id = 'a0000000-0000-4000-8000-000000000007') = 1
  );
  perform testes.verificar(
    'e o perfil continua lá, com o nome',
    (select nome from public.profiles
      where id = 'a0000000-0000-4000-8000-000000000007') = 'Conta Antiga'
  );
end;
$$;

-- ===========================================================================
-- 10. A última conta super_admin não se desativa nem se despromove
-- ===========================================================================

\echo '\n== 10. A última conta super_admin fica de pé =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'há exatamente um super_admin ativo',
    public.super_admins_activos() = 1
  );
  perform testes.deve_falhar(
    'não se desativa a si própria',
    $sql$select public.definir_estado_conta(
      'a0000000-0000-4000-8000-000000000001', false)$sql$
  );
  perform testes.deve_falhar(
    'nem se despromove a admin',
    $sql$select public.definir_papel_global(
      'a0000000-0000-4000-8000-000000000001', 'admin')$sql$
  );

  -- Com uma segunda, já pode sair.
  perform public.definir_papel_global(
    'a0000000-0000-4000-8000-000000000002', 'super_admin');
  perform testes.verificar(
    'com uma segunda conta super_admin, já se despromove',
    (public.definir_papel_global(
      'a0000000-0000-4000-8000-000000000001', 'admin')).papel_global = 'admin'
  );
end;
$$;

reset role;

-- Repor a sofia como super_admin.
update public.profiles set papel_global = 'super_admin'
  where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set papel_global = 'admin'
  where id = 'a0000000-0000-4000-8000-000000000002';

-- ===========================================================================
-- Extras: as arestas que ficam de fora dos dez
-- ===========================================================================

\echo '\n== Extras: convites, revogar tudo e o registo =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

do $$
begin
  perform testes.deve_falhar(
    'um admin não convida ninguém com papel global acima de externo',
    $sql$select public.criar_convite('novo@fora.pt', 'tok-1', 'admin', '[]'::jsonb)$sql$
  );
  perform testes.verificar(
    'mas convida um externo para o quadro que gere',
    (public.criar_convite(
      'novo@fora.pt', 'tok-2', 'externo',
      jsonb_build_array(jsonb_build_object(
        'quadro', current_setting('testes.quadro_a'), 'papel', 'comentador'))
    )).email = 'novo@fora.pt'
  );
  perform testes.verificar(
    'e o convite guardou o acesso a conceder',
    (select count(*) from public.convite_acessos ca
      join public.convites c on c.id = ca.convite_id
      where c.token = 'tok-2') = 1
  );
  perform testes.deve_falhar(
    'não convida um email que já tem conta',
    $sql$select public.criar_convite('rui@empresa.pt', 'tok-3', 'externo', '[]'::jsonb)$sql$
  );
end;
$$;

-- Revogar tudo, no âmbito de quem revoga.
do $$
declare
  v_resultado json;
begin
  v_resultado := public.revogar_todos_os_acessos('a0000000-0000-4000-8000-000000000006');
  perform testes.verificar(
    'a marta revoga o acesso do freelancer ao cartão dela',
    (v_resultado ->> 'cartoes')::integer = 1
  );
  perform testes.deve_falhar(
    'e não revoga os seus próprios acessos',
    $sql$select public.revogar_todos_os_acessos(
      'a0000000-0000-4000-8000-000000000002')$sql$
  );
end;
$$;

reset role;

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000006"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'o freelancer ficou sem nada',
    (select count(*) from public.os_meus_trabalhos()) = 0
  );
  perform testes.deve_falhar(
    'e não chega ao painel de pessoas',
    $sql$select * from public.listar_pessoas()$sql$
  );
  perform testes.deve_falhar(
    'nem cria quadros',
    $sql$select public.criar_quadro('Quadro do freelancer')$sql$
  );
end;
$$;

reset role;

-- O registo não se forja nem se apaga.
set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

do $$
begin
  perform testes.deve_falhar(
    'ninguém escreve à mão no registo de acessos',
    $sql$insert into public.acessos_log (ator_id, accao)
         values ('a0000000-0000-4000-8000-000000000002', 'inventado')$sql$
  );
  perform testes.deve_falhar(
    'nem o apaga',
    $sql$delete from public.acessos_log$sql$
  );
  perform testes.verificar(
    'mas vê o que fez',
    (select count(*) from public.acessos_log
      where ator_id = 'a0000000-0000-4000-8000-000000000002') > 0
  );
end;
$$;

reset role;

\echo '\n== Todos os testes de níveis de acesso passaram =='
