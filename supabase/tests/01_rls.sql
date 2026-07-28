-- Testes das políticas RLS.
--
-- "Nenhuma tabela vai para produção sem políticas RLS testadas. Testa sempre
-- com duas contas em quadros diferentes." É exatamente isto que este ficheiro
-- faz — e o critério de aceitação da Fase 1 é o teste 3.
--
-- Correr com: ./scripts/testar-rls.sh

\set ON_ERROR_STOP on

create schema if not exists testes;
grant usage on schema testes to anon, authenticated, service_role;

create or replace function testes.verificar(p_descricao text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if p_condicao is not true then
    raise exception 'FALHOU: %', p_descricao;
  end if;
  raise notice '  ok  %', p_descricao;
end;
$$;

grant execute on function testes.verificar(text, boolean) to anon, authenticated, service_role;

-- Corre um bloco e exige que ele rebente. Usado para as negativas: "o bruno
-- NÃO consegue escrever aqui". Um teste que só verifica zero linhas não
-- distingue "sem permissão" de "sem dados".
create or replace function testes.deve_falhar(p_descricao text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      raise notice '  ok  % (%).', p_descricao, sqlerrm;
      return;
  end;
  raise exception 'FALHOU: % — o comando devia ter sido recusado', p_descricao;
end;
$$;

grant execute on function testes.deve_falhar(text, text) to anon, authenticated, service_role;

-- Quantas linhas é que o comando mexeu. Sob RLS, um UPDATE ou DELETE sem
-- permissão não rebenta: simplesmente não encontra linha nenhuma. É a
-- diferença entre "recusado" e "invisível", e ambos os casos interessam.
create or replace function testes.linhas_afetadas(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_linhas integer;
begin
  execute p_sql;
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

grant execute on function testes.linhas_afetadas(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------

\echo '\n== Preparação: duas contas =='

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'ana@empresa.pt',   '{"nome": "Ana Ferreira"}'),
  ('22222222-2222-4222-8222-222222222222', 'bruno@empresa.pt', '{"nome": "Bruno Dias"}'),
  ('33333333-3333-4333-8333-333333333333', 'carla@empresa.pt', '{"nome": "Carla Nunes"}');

do $$
begin
  perform testes.verificar(
    'o trigger em auth.users criou os três perfis',
    (select count(*) from public.profiles) = 3
  );
  perform testes.verificar(
    'o nome veio de raw_user_meta_data',
    (select nome from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Ana Ferreira'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Domínios permitidos
-- ---------------------------------------------------------------------------

\echo '\n== Domínios de email =='

insert into public.dominios_permitidos (dominio) values ('empresa.pt');

do $$
begin
  perform testes.deve_falhar(
    'email de fora do domínio é recusado no registo',
    $sql$insert into auth.users (id, email) values (gen_random_uuid(), 'intruso@gmail.com')$sql$
  );
  perform testes.verificar(
    'e não ficou nenhum perfil órfão',
    (select count(*) from public.profiles) = 3
  );
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-8444-444444444444', 'diogo@empresa.pt', '{"nome": "Diogo Sá"}');

do $$
begin
  perform testes.verificar(
    'email do domínio da empresa entra',
    (select count(*) from public.profiles) = 4
  );
end;
$$;

delete from public.dominios_permitidos;

-- Criar quadros passou a ser do eixo A (ver 20260728120000_niveis_de_acesso):
-- um `externo` não tem poderes próprios. Estas quatro contas são a equipa da
-- casa, e é como equipa da casa que os testes a seguir as usam.
update public.profiles set papel_global = 'admin';

-- ---------------------------------------------------------------------------
-- Cada um no seu quadro
-- ---------------------------------------------------------------------------

\echo '\n== Fase 1: dois utilizadores não veem os quadros um do outro =='

set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

select id as quadro_ana from public.criar_quadro('Quadro da Ana', 'Só dela') \gset
select set_config('testes.quadro_ana', :'quadro_ana', false);

do $$
begin
  perform testes.verificar(
    'quem cria o quadro fica admin dele',
    public.e_admin_quadro((select id from public.boards limit 1))
  );
  perform testes.verificar(
    'a ana vê o quadro que criou',
    (select count(*) from public.boards) = 1
  );
  perform testes.verificar(
    'o quadro nasce com as seis etiquetas iniciais',
    (select count(*) from public.labels) = 6
  );
end;
$$;

insert into public.lists (board_id, nome, posicao)
values (:'quadro_ana', 'Para fazer', 1) returning id \gset lista_ana_
select set_config('testes.lista_ana', :'lista_ana_id', false);

insert into public.cards (list_id, titulo, posicao, criado_por)
values (:'lista_ana_id', 'Cartão privado da Ana', 1, '11111111-1111-4111-8111-111111111111')
returning id \gset cartao_ana_
select set_config('testes.cartao_ana', :'cartao_ana_id', false);

reset role;
set request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222"}';
set role authenticated;

select id as quadro_bruno from public.criar_quadro('Quadro do Bruno') \gset

do $$
begin
  -- O critério de aceitação da Fase 1, em duas linhas.
  perform testes.verificar(
    'o bruno só vê o quadro dele',
    (select count(*) from public.boards) = 1
      and (select nome from public.boards) = 'Quadro do Bruno'
  );
  perform testes.verificar(
    'o bruno não vê as listas da ana',
    (select count(*) from public.lists) = 0
  );
  perform testes.verificar(
    'o bruno não vê os cartões da ana',
    (select count(*) from public.cards) = 0
  );
  perform testes.verificar(
    'o bruno não vê as etiquetas do quadro da ana',
    (select count(*) from public.labels where board_id <> (select id from public.boards)) = 0
  );
  perform testes.verificar(
    'o bruno não vê o perfil da ana (não partilham quadro)',
    (select count(*) from public.profiles) = 1
  );
end;
$$;

do $$
declare
  v_quadro_ana uuid;
  v_lista_ana uuid;
begin
  -- Ids obtidos fora de RLS, para tentar o acesso direto por id conhecido.
  select id into v_quadro_ana from public.boards where nome = 'Quadro da Ana';
  perform testes.verificar(
    'nem sequer com o id à frente: o quadro da ana é invisível',
    v_quadro_ana is null
  );
end;
$$;

-- Saber o id de um quadro alheio não dá acesso nenhum.
do $$
begin
  perform testes.deve_falhar(
    'o bruno não consegue criar uma lista no quadro da ana',
    format(
      $sql$insert into public.lists (board_id, nome, posicao) values (%L, 'Intrusa', 1)$sql$,
      current_setting('testes.quadro_ana')
    )
  );
  perform testes.deve_falhar(
    'o bruno não consegue criar um cartão na lista da ana',
    format(
      $sql$insert into public.cards (list_id, titulo, posicao) values (%L, 'Intruso', 1)$sql$,
      current_setting('testes.lista_ana')
    )
  );
  perform testes.verificar(
    'um UPDATE no quadro da ana não toca em nenhuma linha',
    testes.linhas_afetadas(format(
      $sql$update public.boards set nome = 'Roubado' where id = %L$sql$,
      current_setting('testes.quadro_ana')
    )) = 0
  );
  perform testes.verificar(
    'um DELETE no cartão da ana não toca em nenhuma linha',
    testes.linhas_afetadas(format(
      $sql$delete from public.cards where id = %L$sql$,
      current_setting('testes.cartao_ana')
    )) = 0
  );
end;
$$;

reset role;

do $$
begin
  perform testes.verificar(
    'o cartão da ana continua lá, intacto',
    (select titulo from public.cards where id = current_setting('testes.cartao_ana')::uuid)
      = 'Cartão privado da Ana'
  );
  perform testes.verificar(
    'e o quadro dela também',
    (select nome from public.boards where id = current_setting('testes.quadro_ana')::uuid)
      = 'Quadro da Ana'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Papéis
-- ---------------------------------------------------------------------------

\echo '\n== Papéis: leitor, editor, admin =='

insert into public.board_members (board_id, user_id, papel) values
  (current_setting('testes.quadro_ana')::uuid, '22222222-2222-4222-8222-222222222222', 'leitor'),
  (current_setting('testes.quadro_ana')::uuid, '33333333-3333-4333-8333-333333333333', 'editor');

set request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'como leitor, o bruno passa a ver o quadro da ana',
    (select count(*) from public.boards) = 2
  );
  perform testes.verificar(
    'e passa a ver o cartão dela',
    (select count(*) from public.cards where id = current_setting('testes.cartao_ana')::uuid) = 1
  );
  perform testes.verificar(
    'e o perfil dela, agora que partilham quadro',
    (select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 1
  );
  perform testes.deve_falhar(
    'mas um leitor não cria cartões',
    format(
      $sql$insert into public.cards (list_id, titulo, posicao) values (%L, 'Do leitor', 5)$sql$,
      current_setting('testes.lista_ana')
    )
  );
  perform testes.deve_falhar(
    'nem comenta',
    format(
      $sql$insert into public.comments (card_id, autor_id, corpo)
           values (%L, '22222222-2222-4222-8222-222222222222', 'olá')$sql$,
      current_setting('testes.cartao_ana')
    )
  );
  perform testes.verificar(
    'nem arquiva o cartão de ninguém',
    testes.linhas_afetadas(format(
      $sql$update public.cards set arquivado = true where id = %L$sql$,
      current_setting('testes.cartao_ana')
    )) = 0
  );
  perform testes.deve_falhar(
    'e não gere membros',
    format(
      $sql$insert into public.board_members (board_id, user_id, papel)
           values (%L, '44444444-4444-4444-8444-444444444444', 'gestor')$sql$,
      current_setting('testes.quadro_ana')
    )
  );
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "33333333-3333-4333-8333-333333333333"}';
set role authenticated;

do $$
declare
  v_cartao uuid;
begin
  insert into public.cards (list_id, titulo, posicao, criado_por)
  values (current_setting('testes.lista_ana')::uuid, 'Cartão da Carla', 2,
          '33333333-3333-4333-8333-333333333333')
  returning id into v_cartao;

  perform testes.verificar('um editor cria cartões', v_cartao is not null);

  perform testes.verificar(
    'mas não apaga o quadro',
    testes.linhas_afetadas(format(
      $sql$delete from public.boards where id = %L$sql$,
      current_setting('testes.quadro_ana')
    )) = 0
  );
  perform testes.verificar(
    'o quadro continua de pé',
    (select count(*) from public.boards
      where id = current_setting('testes.quadro_ana')::uuid) = 1
  );
  perform testes.verificar(
    'e não promove ninguém a admin',
    testes.linhas_afetadas(format(
      $sql$update public.board_members set papel = 'gestor'
           where board_id = %L and user_id = '33333333-3333-4333-8333-333333333333'$sql$,
      current_setting('testes.quadro_ana')
    )) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------------

\echo '\n== Comentários: só os próprios =='

do $$
declare
  v_comentario uuid;
begin
  insert into public.comments (card_id, autor_id, corpo)
  values (current_setting('testes.cartao_ana')::uuid,
          '33333333-3333-4333-8333-333333333333', 'Comentário da Carla')
  returning id into v_comentario;

  perform set_config('testes.comentario_carla', v_comentario::text, false);

  perform testes.deve_falhar(
    'não se comenta em nome de outra pessoa',
    format(
      $sql$insert into public.comments (card_id, autor_id, corpo)
           values (%L, '11111111-1111-4111-8111-111111111111', 'assinado pela Ana')$sql$,
      current_setting('testes.cartao_ana')
    )
  );
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'a ana lê o comentário da carla',
    (select corpo from public.comments
      where id = current_setting('testes.comentario_carla')::uuid) = 'Comentário da Carla'
  );
  perform testes.verificar(
    'mas não o consegue editar',
    testes.linhas_afetadas(format(
      $sql$update public.comments set corpo = 'editado à socapa' where id = %L$sql$,
      current_setting('testes.comentario_carla')
    )) = 0
  );
  perform testes.verificar(
    'nem apagar — mesmo sendo admin do quadro',
    testes.linhas_afetadas(format(
      $sql$delete from public.comments where id = %L$sql$,
      current_setting('testes.comentario_carla')
    )) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Membros do cartão
-- ---------------------------------------------------------------------------

\echo '\n== Membros do cartão =='

do $$
begin
  insert into public.card_members (card_id, user_id)
  values (current_setting('testes.cartao_ana')::uuid, '33333333-3333-4333-8333-333333333333');

  perform testes.verificar(
    'atribuir um cartão a um membro do quadro funciona',
    (select count(*) from public.card_members) = 1
  );

  perform testes.deve_falhar(
    'atribuir a quem não pertence ao quadro é recusado',
    format(
      $sql$insert into public.card_members (card_id, user_id)
           values (%L, '44444444-4444-4444-8444-444444444444')$sql$,
      current_setting('testes.cartao_ana')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Anexos
-- ---------------------------------------------------------------------------

\echo '\n== Anexos: a tabela é que manda =='

-- Os ficheiros passaram para o Cloudflare R2, que não tem RLS. Quem impõe a
-- permissão é o servidor: a rota lê a linha de `attachments` com a sessão do
-- utilizador e só assina o URL se essa leitura devolver alguma coisa. Ou seja,
-- estas políticas *são* o controlo de acesso aos ficheiros.

do $$
begin
  insert into public.attachments
    (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
  values (
    current_setting('testes.cartao_ana')::uuid,
    'plano.pdf',
    'boards/' || current_setting('testes.quadro_ana')
      || '/cards/' || current_setting('testes.cartao_ana') || '/aaaa-plano.pdf',
    1024, 'application/pdf', '11111111-1111-4111-8111-111111111111'
  );

  perform testes.verificar(
    'a ana anexa no quadro dela',
    (select count(*) from public.attachments) = 1
  );
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "44444444-4444-4444-8444-444444444444"}';
set role authenticated;

do $$
begin
  -- Sem ver a linha não há URL assinado: é assim que o ficheiro fica fora de
  -- alcance de quem não é do quadro, mesmo estando num bucket sem permissões.
  perform testes.verificar(
    'quem não é do quadro não vê o anexo — logo nunca lhe assinam o ficheiro',
    (select count(*) from public.attachments) = 0
  );
  perform testes.deve_falhar(
    'nem consegue registar um anexo lá',
    format(
      $sql$insert into public.attachments
            (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'intruso.pdf', 'boards/x/cards/y/z.pdf', 10, 'application/pdf',
                   '44444444-4444-4444-8444-444444444444')$sql$,
      current_setting('testes.cartao_ana')
    )
  );
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'o leitor do quadro vê o anexo',
    (select count(*) from public.attachments) = 1
  );
  perform testes.deve_falhar(
    'mas não anexa',
    format(
      $sql$insert into public.attachments
            (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'do-leitor.pdf', 'boards/x/cards/y/l.pdf', 10, 'application/pdf',
                   '22222222-2222-4222-8222-222222222222')$sql$,
      current_setting('testes.cartao_ana')
    )
  );
  perform testes.verificar(
    'nem remove o de ninguém',
    testes.linhas_afetadas(
      $sql$delete from public.attachments where nome_ficheiro = 'plano.pdf'$sql$
    ) = 0
  );
end;
$$;

\echo '\n== Convites =='

do $$
begin
  perform testes.deve_falhar(
    'quem não é admin de nada não convida ninguém',
    format(
      $sql$insert into public.convites (email, board_id, papel, token, criado_por)
           values ('novo@empresa.pt', %L, 'editor', 'tok-do-bruno',
                   '22222222-2222-4222-8222-222222222222')$sql$,
      current_setting('testes.quadro_ana')
    )
  );
end;
$$;

reset role;
set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

do $$
begin
  insert into public.convites (email, board_id, papel, token, criado_por)
  values ('novo@empresa.pt', current_setting('testes.quadro_ana')::uuid, 'editor',
          'tok-valido', '11111111-1111-4111-8111-111111111111');

  perform testes.verificar(
    'o admin do quadro cria o convite',
    (select count(*) from public.convites) = 1
  );

  perform testes.deve_falhar(
    'dois convites pendentes para o mesmo email não podem coexistir',
    $sql$insert into public.convites (email, papel, token, criado_por)
         values ('NOVO@empresa.pt', 'editor', 'tok-duplicado',
                 '11111111-1111-4111-8111-111111111111')$sql$
  );

  perform testes.deve_falhar(
    'e o resgate não está ao alcance de quem tem sessão',
    $sql$select public.resgatar_convite('tok-valido', '44444444-4444-4444-8444-444444444444')$sql$
  );
end;
$$;

reset role;

do $$
declare
  v_convite public.convites;
begin
  -- O servidor (service_role) é que resgata, porque quem resgata ainda não tem sessão.
  select * into v_convite
  from public.resgatar_convite('tok-valido', '44444444-4444-4444-8444-444444444444');

  perform testes.verificar('o convite ficou marcado como usado', v_convite.usado_em is not null);
  perform testes.verificar(
    'e o convidado entrou no quadro com o papel do convite',
    (select papel from public.board_members
      where board_id = current_setting('testes.quadro_ana')::uuid
        and user_id = '44444444-4444-4444-8444-444444444444') = 'editor'
  );

  perform testes.deve_falhar(
    'o mesmo token não serve duas vezes',
    $sql$select public.resgatar_convite('tok-valido', '44444444-4444-4444-8444-444444444444')$sql$
  );
end;
$$;

insert into public.convites (email, papel, token, criado_por, expira_em)
values ('tarde@empresa.pt', 'editor', 'tok-expirado',
        '11111111-1111-4111-8111-111111111111', now() - interval '1 day');

do $$
begin
  perform testes.deve_falhar(
    'um convite expirado é recusado',
    $sql$select public.resgatar_convite('tok-expirado', '33333333-3333-4333-8333-333333333333')$sql$
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Último admin
-- ---------------------------------------------------------------------------

\echo '\n== O quadro nunca fica sem admin =='

set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

do $$
begin
  perform testes.deve_falhar(
    'o único admin não se pode despromover',
    format(
      $sql$update public.board_members set papel = 'editor'
           where board_id = %L and user_id = '11111111-1111-4111-8111-111111111111'$sql$,
      current_setting('testes.quadro_ana')
    )
  );
  perform testes.deve_falhar(
    'nem sair do quadro',
    format(
      $sql$delete from public.board_members
           where board_id = %L and user_id = '11111111-1111-4111-8111-111111111111'$sql$,
      current_setting('testes.quadro_ana')
    )
  );

  update public.board_members set papel = 'gestor'
  where board_id = current_setting('testes.quadro_ana')::uuid
    and user_id = '33333333-3333-4333-8333-333333333333';

  perform testes.verificar(
    'com outro admin no lugar, já pode sair',
    testes.linhas_afetadas(format(
      $sql$delete from public.board_members
           where board_id = %L and user_id = '11111111-1111-4111-8111-111111111111'$sql$,
      current_setting('testes.quadro_ana')
    )) = 1
  );

  -- Sair de um quadro tira-o da vista no mesmo instante.
  perform testes.verificar(
    'e a partir daí o quadro desaparece-lhe da lista',
    (select count(*) from public.boards
      where id = current_setting('testes.quadro_ana')::uuid) = 0
  );
end;
$$;

reset role;

do $$
begin
  perform testes.verificar(
    'ficaram os outros três membros',
    (select count(*) from public.board_members
      where board_id = current_setting('testes.quadro_ana')::uuid) = 3
  );
  perform testes.verificar(
    'e apagar o quadro leva tudo à frente, sem tropeçar na regra do último admin',
    testes.linhas_afetadas(format(
      $sql$delete from public.boards where id = %L$sql$,
      current_setting('testes.quadro_ana')
    )) = 1
  );
  perform testes.verificar(
    'as listas foram em cascata',
    (select count(*) from public.lists) = 0
  );
  perform testes.verificar(
    'os cartões também',
    (select count(*) from public.cards) = 0
  );
  perform testes.verificar(
    'e os comentários com eles',
    (select count(*) from public.comments) = 0
  );
end;
$$;

\echo '\n== Todos os testes de RLS passaram =='
