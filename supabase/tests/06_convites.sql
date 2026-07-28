-- Convites: quem vê o quê, e o que acontece ao reenviar.
--
-- O que interessa aqui é o âmbito. Antes desta migração, a política de leitura
-- era `using (public.e_admin_algures())` — qualquer gestor de qualquer quadro
-- via todos os convites da plataforma, e com eles o email de quem foi
-- convidado para o quadro de outro cliente.
--
-- Corre com: ./scripts/testar-rls.sh

\set ON_ERROR_STOP on

\echo '\n== Convites: o elenco =='

-- Reaproveita as contas e os quadros de 05: a sofia é super_admin, a marta e o
-- rui são admins globais e gestores de quadros diferentes, o nuno é externo.
--
-- Os `set_config` de 05 não chegam aqui — cada ficheiro corre na sua própria
-- sessão de psql, e um `set_config(..., false)` morre com ela. Reconstroem-se
-- pelos nomes dos quadros, que é o que sobrevive entre sessões.
select set_config('testes.quadro_a',
  (select id::text from public.boards where nome = 'Cliente A'), false);
select set_config('testes.quadro_b',
  (select id::text from public.boards where nome = 'Cliente B'), false);

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

select id as convite_marta from public.criar_convite(
  'convidada.da.marta@fora.pt', 'tok-marta-1', 'externo',
  jsonb_build_array(jsonb_build_object(
    'quadro', current_setting('testes.quadro_a'), 'papel', 'comentador'))
) \gset
select set_config('testes.convite_marta', :'convite_marta', false);

do $$
begin
  perform testes.verificar(
    'a marta vê o convite que criou',
    (select count(*) from public.convites
      where id = current_setting('testes.convite_marta')::uuid) = 1
  );
  perform testes.verificar(
    'e ele aparece-lhe em listar_convites',
    (select count(*) from public.listar_convites()
      where id = current_setting('testes.convite_marta')::uuid) = 1
  );
  perform testes.verificar(
    'com o estado "por-enviar", porque ainda não saiu email nenhum',
    (select estado from public.listar_convites()
      where id = current_setting('testes.convite_marta')::uuid) = 'por-enviar'
  );
  perform testes.verificar(
    'e a dizer a que quadro dá acesso',
    (select acessos::text from public.listar_convites()
      where id = current_setting('testes.convite_marta')::uuid) like '%Cliente A%'
  );
end;
$$;

reset role;

-- ===========================================================================
-- O convite de um não é visível ao outro
-- ===========================================================================

\echo '\n== Um gestor não vê os convites dos quadros dos outros =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000003"}';
set role authenticated;

select id as convite_rui from public.criar_convite(
  'convidado.do.rui@fora.pt', 'tok-rui-1', 'externo',
  jsonb_build_array(jsonb_build_object(
    'quadro', current_setting('testes.quadro_b'), 'papel', 'editor'))
) \gset
select set_config('testes.convite_rui', :'convite_rui', false);

do $$
begin
  perform testes.verificar(
    'o rui vê o convite que criou',
    (select count(*) from public.convites
      where id = current_setting('testes.convite_rui')::uuid) = 1
  );
  -- O que interessa. Antes desta migração, esta contagem dava 1.
  perform testes.verificar(
    'e NÃO vê o convite da marta',
    (select count(*) from public.convites
      where id = current_setting('testes.convite_marta')::uuid) = 0
  );
  perform testes.verificar(
    'nem sequer o email de quem ela convidou',
    (select count(*) from public.convites
      where email = 'convidada.da.marta@fora.pt') = 0
  );
  perform testes.verificar(
    'listar_convites concorda',
    (select count(*) from public.listar_convites()) = 1
  );
  perform testes.verificar(
    'e pode_ver_convite também',
    public.pode_ver_convite(current_setting('testes.convite_marta')::uuid) = false
  );
  perform testes.deve_falhar(
    'e não consegue revogá-lo',
    format($sql$select public.revogar_convite(%L)$sql$,
           current_setting('testes.convite_marta'))
  );
  perform testes.verificar(
    'nem apagando a linha diretamente',
    testes.linhas_afetadas(format(
      $sql$delete from public.convites where id = %L$sql$,
      current_setting('testes.convite_marta')
    )) = 0
  );
end;
$$;

reset role;

-- ===========================================================================
-- O super_admin vê os dois
-- ===========================================================================

\echo '\n== O super_admin vê todos os convites =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001"}';
set role authenticated;

do $$
begin
  perform testes.verificar(
    'a sofia vê os dois convites',
    (select count(*) from public.listar_convites()
      where id in (current_setting('testes.convite_marta')::uuid,
                   current_setting('testes.convite_rui')::uuid)) = 2
  );
end;
$$;

reset role;

-- ===========================================================================
-- Quem não gere nada não vê nada
-- ===========================================================================

\echo '\n== Um externo sem quadros não vê convites nenhuns =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000006"}';
set role authenticated;

do $$
begin
  -- A função não rebenta: devolve vazio, que é a resposta certa para quem
  -- simplesmente não convidou ninguém.
  perform testes.verificar(
    'o nuno não vê convite nenhum',
    (select count(*) from public.listar_convites()) = 0
  );
  perform testes.deve_falhar(
    'e não reenvia o convite de outra pessoa',
    format($sql$select public.renovar_convite(%L, 'tok-roubado')$sql$,
           current_setting('testes.convite_marta'))
  );
end;
$$;

reset role;

-- ===========================================================================
-- Enviar, reenviar e renovar
-- ===========================================================================

\echo '\n== O rasto do envio =='

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

do $$
declare
  v_token_antes text;
  v_token_depois text;
begin
  perform public.marcar_convite_enviado(current_setting('testes.convite_marta')::uuid);

  perform testes.verificar(
    'marcar o envio muda o estado para "pendente"',
    (select estado from public.listar_convites()
      where id = current_setting('testes.convite_marta')::uuid) = 'pendente'
  );
  perform testes.verificar(
    'o primeiro envio não conta como reenvio',
    (select reenvios from public.convites
      where id = current_setting('testes.convite_marta')::uuid) = 0
  );

  perform public.marcar_convite_enviado(current_setting('testes.convite_marta')::uuid);
  perform testes.verificar(
    'o segundo já conta',
    (select reenvios from public.convites
      where id = current_setting('testes.convite_marta')::uuid) = 1
  );

  -- Reenviar um convite válido mantém o link: quem já o recebeu não fica com
  -- um endereço morto na caixa de correio.
  select token into v_token_antes
  from public.convites where id = current_setting('testes.convite_marta')::uuid;

  perform public.renovar_convite(
    current_setting('testes.convite_marta')::uuid, 'tok-que-nao-sera-usado');

  select token into v_token_depois
  from public.convites where id = current_setting('testes.convite_marta')::uuid;

  perform testes.verificar(
    'reenviar um convite válido não lhe mexe no token',
    v_token_depois = v_token_antes
  );

  perform set_config('testes.token_antigo', v_token_antes, false);
end;
$$;

reset role;

-- Fazer o convite expirar é andar com o relógio para a frente, e isso é
-- montagem do teste, não é uma operação do produto: `convites` não tem
-- política de UPDATE nenhuma, de propósito — o que se muda num convite
-- muda-se pelas funções.
update public.convites
set expira_em = now() - interval '1 day'
where id = current_setting('testes.convite_marta')::uuid;

set request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002"}';
set role authenticated;

do $$
declare
  v_token_antes text := current_setting('testes.token_antigo');
begin
  perform testes.verificar(
    'o estado passa a "expirado"',
    (select estado from public.listar_convites()
      where id = current_setting('testes.convite_marta')::uuid) = 'expirado'
  );

  perform public.renovar_convite(
    current_setting('testes.convite_marta')::uuid, 'tok-marta-renovado');

  perform testes.verificar(
    'renovar um expirado troca o token',
    (select token from public.convites
      where id = current_setting('testes.convite_marta')::uuid) = 'tok-marta-renovado'
  );
  perform testes.verificar(
    'e o link antigo deixa de servir para alguma coisa',
    (select count(*) from public.convites where token = v_token_antes) = 0
  );
  perform testes.verificar(
    'com sete dias novos pela frente',
    (select expira_em from public.convites
      where id = current_setting('testes.convite_marta')::uuid) > now() + interval '6 days'
  );
  perform testes.verificar(
    'e ficou registado que foi renovado',
    (select count(*) from public.acessos_log where accao = 'convite:renovar') = 1
  );
end;
$$;

-- ===========================================================================
-- Revogar
-- ===========================================================================

\echo '\n== Revogar mata o link =='

do $$
begin
  perform public.revogar_convite(current_setting('testes.convite_marta')::uuid);

  perform testes.verificar(
    'o convite desapareceu',
    (select count(*) from public.convites
      where id = current_setting('testes.convite_marta')::uuid) = 0
  );
  perform testes.verificar(
    'e ficou registado quem o revogou',
    (select count(*) from public.acessos_log where accao = 'convite:revogar') = 1
  );
end;
$$;

reset role;

-- O resgate continua a ser do servidor, e continua a aplicar o que o convite
-- transporta — é o que liga isto tudo ao fim.
\echo '\n== O resgate ainda aplica os acessos do convite =='

insert into auth.users (id, email, raw_user_meta_data)
values ('a0000000-0000-4000-8000-000000000009', 'convidado.do.rui@fora.pt',
        '{"nome": "Convidado do Rui"}');

do $$
begin
  perform public.resgatar_convite('tok-rui-1', 'a0000000-0000-4000-8000-000000000009');

  perform testes.verificar(
    'o convidado entrou no quadro do rui, com o papel do convite',
    (select papel from public.board_members
      where board_id = current_setting('testes.quadro_b')::uuid
        and user_id = 'a0000000-0000-4000-8000-000000000009') = 'editor'
  );
  perform testes.verificar(
    'e ficou externo, que era o papel global do convite',
    (select papel_global from public.profiles
      where id = 'a0000000-0000-4000-8000-000000000009') = 'externo'
  );
  perform testes.verificar(
    'o convite ficou marcado como usado',
    (select usado_em from public.convites where token = 'tok-rui-1') is not null
  );
  perform testes.verificar(
    'e não serve segunda vez',
    (select count(*) from public.convites
      where token = 'tok-rui-1' and usado_em is null) = 0
  );
end;
$$;

\echo '\n== Todos os testes de convites passaram =='
