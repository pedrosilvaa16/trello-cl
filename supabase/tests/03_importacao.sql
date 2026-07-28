-- Testes dos ajustes feitos para a migração da Trello.
--
-- Os limites e a regra "ficheiro ou ligação" vieram de dados reais. Ficam aqui
-- fixados para que ninguém os aperte outra vez sem reparar.

\set ON_ERROR_STOP on

\echo '\n== Importação: limites de texto =='

set request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111"}';
set role authenticated;

do $$
declare
  v_quadro uuid;
  v_lista uuid;
  v_cartao uuid;
begin
  v_quadro := (public.criar_quadro('Quadro de importação')).id;

  insert into public.lists (board_id, nome, posicao)
  values (v_quadro, 'Importados', 1) returning id into v_lista;

  -- O título mais longo que veio da Trello tinha 714 caracteres.
  insert into public.cards (list_id, titulo, posicao, criado_por)
  values (v_lista, repeat('t', 714), 1, (select auth.uid()))
  returning id into v_cartao;

  perform testes.verificar(
    'um título de 714 caracteres entra',
    (select char_length(titulo) from public.cards where id = v_cartao) = 714
  );

  perform testes.deve_falhar(
    'mas acima de 1000 continua a ser recusado',
    format(
      $sql$insert into public.cards (list_id, titulo, posicao) values (%L, %L, 2)$sql$,
      v_lista, repeat('t', 1001)
    )
  );

  -- O comentário mais longo tinha 6259 caracteres.
  insert into public.comments (card_id, autor_id, corpo)
  values (v_cartao, (select auth.uid()), repeat('c', 6259));

  perform testes.verificar(
    'um comentário de 6259 caracteres entra',
    (select char_length(corpo) from public.comments where card_id = v_cartao) = 6259
  );

  perform set_config('testes.cartao_importado', v_cartao::text, false);
  perform set_config('testes.quadro_importado', v_quadro::text, false);
end;
$$;

\echo '\n== Importação: anexo é ficheiro OU ligação =='

do $$
declare
  v_cartao uuid := current_setting('testes.cartao_importado')::uuid;
  v_quadro text := current_setting('testes.quadro_importado');
begin
  insert into public.attachments
    (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
  values
    (v_cartao, 'plano.pdf',
     'boards/' || v_quadro || '/cards/' || v_cartao || '/aaaa-plano.pdf',
     1024, 'application/pdf', (select auth.uid()));

  perform testes.verificar(
    'um anexo com ficheiro entra',
    (select count(*) from public.attachments where card_id = v_cartao) = 1
  );

  insert into public.attachments
    (card_id, nome_ficheiro, url, tipo_mime, carregado_por, carregado_por_externo)
  values
    (v_cartao, 'Design no Canva', 'https://www.canva.com/design/XPTO/edit',
     'text/html', (select auth.uid()), 'Ana Ribeiro');

  perform testes.verificar(
    'um anexo que é só ligação também entra',
    (select count(*) from public.attachments
      where card_id = v_cartao and url is not null) = 1
  );

  perform testes.verificar(
    'e guarda o nome de quem o pôs lá, mesmo sem conta na plataforma',
    (select carregado_por_externo from public.attachments
      where card_id = v_cartao and url is not null) = 'Ana Ribeiro'
  );

  -- As duas metades ao mesmo tempo seriam duas verdades sobre o mesmo anexo.
  perform testes.deve_falhar(
    'ficheiro e ligação ao mesmo tempo é recusado',
    format(
      $sql$insert into public.attachments
            (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, url, tipo_mime, carregado_por)
           values (%L, 'confuso.pdf', 'boards/x/cards/y/z.pdf', 10,
                   'https://exemplo.pt', 'application/pdf', %L)$sql$,
      v_cartao, (select auth.uid())
    )
  );

  perform testes.deve_falhar(
    'nem ficheiro nem ligação também é recusado',
    format(
      $sql$insert into public.attachments (card_id, nome_ficheiro, tipo_mime, carregado_por)
           values (%L, 'vazio.pdf', 'application/pdf', %L)$sql$,
      v_cartao, (select auth.uid())
    )
  );

  -- O limite era 25 MB por causa do Supabase Storage. Com os anexos no R2
  -- passou a 200 MB, e é o que deixa entrar os vídeos que vieram da Trello.
  insert into public.attachments
    (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
  values (v_cartao, 'video.mp4', 'boards/a/cards/b/video.mp4', 29884416, 'video/mp4',
          (select auth.uid()));

  perform testes.verificar(
    'um vídeo de 28,5 MB entra (antes não entrava)',
    (select tamanho_bytes from public.attachments
      where nome_ficheiro = 'video.mp4') = 29884416
  );

  perform testes.deve_falhar(
    'mas acima de 200 MB continua fora',
    format(
      $sql$insert into public.attachments
            (card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por)
           values (%L, 'enorme.mov', 'boards/a/cards/b/enorme.mov', 209715201, 'video/quicktime', %L)$sql$,
      v_cartao, (select auth.uid())
    )
  );
end;
$$;

\echo '\n== Importação: autoria de fora da plataforma =='

do $$
declare
  v_cartao uuid := current_setting('testes.cartao_importado')::uuid;
begin
  -- Quem escreveu na Trello e não tem conta aqui: o nome sobrevive em texto.
  insert into public.comments (card_id, autor_id, corpo, autor_externo)
  values (v_cartao, (select auth.uid()), 'Comentário migrado', 'Catarina Barros');

  perform testes.verificar(
    'um comentário guarda o nome do autor original',
    (select autor_externo from public.comments
      where corpo = 'Comentário migrado') = 'Catarina Barros'
  );
end;
$$;

reset role;

\echo '\n== Importação: o rasto não é do produto =='

do $$
begin
  insert into public.importacoes_trello (tipo, id_trello, id_local)
  values ('cartao', '5f2b1c', current_setting('testes.cartao_importado')::uuid);

  perform testes.verificar(
    'o service_role escreve no rasto da importação',
    (select id_local from public.importacoes_trello where id_trello = '5f2b1c')
      = current_setting('testes.cartao_importado')::uuid
  );

  perform testes.deve_falhar(
    'o mesmo id da Trello não entra duas vezes',
    format(
      $sql$insert into public.importacoes_trello (tipo, id_trello, id_local)
           values ('cartao', '5f2b1c', %L)$sql$,
      current_setting('testes.cartao_importado')
    )
  );
end;
$$;

set role authenticated;

do $$
begin
  perform testes.deve_falhar(
    'e um utilizador normal não lhe chega',
    $sql$select count(*) from public.importacoes_trello$sql$
  );
end;
$$;

reset role;

\echo '\n== Todos os testes de importação passaram =='
