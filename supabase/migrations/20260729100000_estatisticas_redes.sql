-- Estatísticas das redes sociais do cliente.
--
-- Cada quadro é um cliente. Até aqui o quadro mostrava o que está planeado;
-- isto mostra o que esse plano deu. Ver a secção 11 da ESPECIFICACAO.md para o
-- porquê — incluindo o porquê de isto revogar, só neste caso, a exclusão de
-- "integrações externas" da secção 5.
--
-- Três regras mandam em tudo o que está aqui:
--
--   1. VER é `pode_aceder_quadro`; LIGAR é `pode_gerir_quadro`. Sem eixo novo,
--      sem papel novo, sem exceção. É a secção 10 aplicada tal e qual.
--   2. Os segredos vivem numa tabela sem política nenhuma, e entram cifrados
--      pela aplicação. A base de dados guarda-os sem os saber ler.
--   3. Ninguém escreve métricas a partir do browser. Só o sincronizador, com a
--      service_role. Mesmo tratamento de `acessos_log`.
--
-- A reversão desta migração vive em supabase/reverter/, fora do diretório que
-- o `supabase db push` aplica.

-- ---------------------------------------------------------------------------
-- A rede
-- ---------------------------------------------------------------------------

/*
  Enum e não text+check, ao contrário de `boards.cor`: isto atravessa quatro
  tabelas, e um enum dá a garantia de coerência entre elas de graça. O preço é
  acrescentar uma rede obrigar a um `alter type ... add value` numa migração
  só dele — o que é justo para um evento que acontece uma vez por ano.

  As quatro estão declaradas desde já, mesmo com o LinkedIn e o TikTok à espera
  de aprovação: o dia em que a aprovação chegar não deve precisar de migração.
*/
create type public.rede_social as enum (
  'instagram',
  'facebook',
  'linkedin',
  'tiktok'
);

comment on type public.rede_social is
  'As redes que o painel de estatísticas sabe ler.';

-- ---------------------------------------------------------------------------
-- ligacoes_redes — que conta está ligada a que quadro
-- ---------------------------------------------------------------------------

create table public.ligacoes_redes (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references public.boards (id) on delete cascade,
  rede              public.rede_social not null,

  -- O identificador da conta do lado de lá: o ig-user-id, o id da Página, o
  -- URN da organização no LinkedIn, o open_id do TikTok.
  conta_externa_id  text not null,
  nome_conta        text not null check (char_length(nome_conta) between 1 and 200),
  avatar_url        text,

  /*
    'activa'   — a sincronizar todos os dias.
    'expirada' — o token caducou; o painel diz-lo e o gestor volta a ligar.
    'erro'     — a última sincronização falhou por outra razão.
    'revogada' — a pessoa retirou a autorização do lado da rede.

    Text com check e não enum: ao contrário da rede, isto é estado interno e
    muda com mais frequência do que a lista de redes suportadas.
  */
  estado            text not null default 'activa'
                      check (estado in ('activa', 'expirada', 'erro', 'revogada')),
  -- A última falha, em português e pronta a mostrar a quem gere o quadro.
  erro              text,

  -- Quando o token caduca. A Meta dá sessenta dias aos long-lived.
  expira_em         timestamptz,
  -- Última sincronização com sucesso. Nulo = ainda não correu nenhuma.
  sincronizada_em   timestamptz,
  /*
    O primeiro dia com métricas gravadas. É isto que sustenta o aviso "os dados
    começam em X" — a Meta só devolve ~30 dias para trás, e o que não for
    gravado nesse dia perde-se para sempre.
  */
  primeiro_dia      date,

  ligado_por        uuid references public.profiles (id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  -- Uma conta por rede por quadro. Ligar outra substitui a que lá estava, que
  -- é o que "trocar a conta de Instagram do cliente" quer dizer.
  unique (board_id, rede)
);

comment on table public.ligacoes_redes is
  'Que conta de rede social está ligada a que quadro. Ligar e desligar é de quem gere o quadro.';
comment on column public.ligacoes_redes.primeiro_dia is
  'Primeiro dia com métricas. O histórico começa quando a conta é ligada, não antes.';

create index ligacoes_redes_quadro_idx on public.ligacoes_redes (board_id, rede);
-- O cron pergunta sempre a mesma coisa: quem é que está activo e há mais tempo
-- por sincronizar. Este índice é a consulta inteira.
create index ligacoes_redes_a_sincronizar_idx
  on public.ligacoes_redes (sincronizada_em nulls first)
  where estado = 'activa';

-- ---------------------------------------------------------------------------
-- ligacoes_segredos — os tokens, e mais nada
-- ---------------------------------------------------------------------------

/*
  Tabela à parte, e não colunas em `ligacoes_redes`, por uma razão só: assim a
  linha que o painel lê e a linha que guarda o segredo são objetos diferentes,
  e o segredo pode ter RLS sem política nenhuma enquanto o resto continua
  visível a quem tem acesso ao quadro.

  Os valores entram cifrados com AES-256-GCM a partir de src/lib/redes/cifra.ts.
  Isto é deliberadamente mais apertado do que `convites.token`, que está em
  texto simples: um token de convite vive sete dias e dá acesso a este produto;
  um token da Meta vive sessenta dias e dá acesso à conta do cliente.
*/
create table public.ligacoes_segredos (
  ligacao_id      uuid primary key
                    references public.ligacoes_redes (id) on delete cascade,
  token_cifrado   text not null,
  refresh_cifrado text,
  -- Os scopes que a rede acabou por conceder. Servem para explicar porque é que
  -- uma métrica não aparece, em vez de a deixar em branco sem razão.
  ambito          text,
  atualizado_em   timestamptz not null default now()
);

comment on table public.ligacoes_segredos is
  'Tokens OAuth, cifrados pela aplicação. Sem política de RLS: nem o dono do quadro lê esta tabela.';

-- ---------------------------------------------------------------------------
-- metricas_redes — um retrato por dia, por métrica
-- ---------------------------------------------------------------------------

/*
  O vocabulário de `metrica` é o da secção 11 da especificação: `seguidores`,
  `a_seguir`, `publicacoes`, `alcance`, `visualizacoes`, `interacoes`,
  `gostos`, `comentarios`, `partilhas`, `guardados`, `visitas_perfil`,
  `cliques_site`. Cada rede fala a sua língua e o fornecedor traduz; o painel
  nunca sabe de que rede veio o número.

  Sem check à lista: uma métrica nova não vale uma migração, e uma métrica
  desconhecida no painel é ignorada, não é um erro.
*/
create table public.metricas_redes (
  id          bigserial primary key,
  ligacao_id  uuid not null references public.ligacoes_redes (id) on delete cascade,
  -- Desnormalizados por trigger, como `cards.board_id` e pela mesma razão: o
  -- RLS não subir a `ligacoes_redes` uma vez por linha.
  board_id    uuid not null references public.boards (id) on delete cascade,
  rede        public.rede_social not null,
  dia         date not null,
  metrica     text not null check (char_length(metrica) between 1 and 60),
  valor       numeric not null,

  -- A chave do `on conflict do update` que torna a sincronização repetível.
  -- Correr o cron duas vezes no mesmo dia dá o mesmo resultado que correr uma.
  unique (ligacao_id, dia, metrica)
);

comment on table public.metricas_redes is
  'Um retrato diário por métrica. É esta tabela a fonte de verdade do painel, não a API.';

create index metricas_redes_quadro_idx on public.metricas_redes (board_id, dia);
create index metricas_redes_serie_idx  on public.metricas_redes (ligacao_id, metrica, dia);

-- ---------------------------------------------------------------------------
-- demografia_redes — quem é o público
-- ---------------------------------------------------------------------------

/*
  Não cabia em `metricas_redes`: uma métrica é um número por dia, isto é uma
  distribuição por dia. Enfiar `demografia:pais:PT` no campo `metrica` daria
  uma tabela que só se lê com `like` — e a primeira consulta a sério pagava-o.

  A Meta devolve isto como total acumulado, não como série. Guarda-se com o dia
  do retrato à mesma, para se poder ver o público mudar ao longo dos meses.
*/
create table public.demografia_redes (
  id          bigserial primary key,
  ligacao_id  uuid not null references public.ligacoes_redes (id) on delete cascade,
  board_id    uuid not null references public.boards (id) on delete cascade,
  rede        public.rede_social not null,
  dia         date not null,
  -- 'genero' | 'idade' | 'pais' | 'cidade'
  dimensao    text not null check (dimensao in ('genero', 'idade', 'pais', 'cidade')),
  -- 'F' | '25-34' | 'PT' | 'Marco de Canaveses, Porto District'
  grupo       text not null check (char_length(grupo) between 1 and 120),
  valor       numeric not null,

  unique (ligacao_id, dia, dimensao, grupo)
);

comment on table public.demografia_redes is
  'Distribuição do público por género, idade, país e cidade. A Meta só a dá acima de 100 seguidores.';

create index demografia_redes_quadro_idx
  on public.demografia_redes (board_id, dimensao, dia desc);

-- ---------------------------------------------------------------------------
-- publicacoes_redes — o conteúdo, com os números de cada peça
-- ---------------------------------------------------------------------------

create table public.publicacoes_redes (
  id             uuid primary key default gen_random_uuid(),
  ligacao_id     uuid not null references public.ligacoes_redes (id) on delete cascade,
  board_id       uuid not null references public.boards (id) on delete cascade,
  rede           public.rede_social not null,
  id_externo     text not null,
  publicado_em   timestamptz not null,
  -- 'imagem' | 'video' | 'carrossel' | 'reel' | 'texto'. Text livre: cada rede
  -- inventa formatos ao seu ritmo e um check aqui seria uma migração por moda.
  tipo           text,
  url            text,
  /*
    A Meta assina os URLs das miniaturas e eles caducam. Guarda-se o que ela
    der e volta-se a pedir a cada sincronização; uma miniatura que não carrega
    degrada para o cartão sem imagem, não parte a grelha.
  */
  miniatura_url  text,
  legenda        text,
  -- As métricas da peça, no mesmo vocabulário de `metricas_redes`. Jsonb porque
  -- o conjunto varia com o formato: um reel tem `visualizacoes`, uma imagem não.
  metricas       jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),

  unique (ligacao_id, id_externo)
);

comment on table public.publicacoes_redes is
  'As publicações do período, com as métricas de cada uma. É o que liga os números a conteúdo concreto.';

create index publicacoes_redes_quadro_idx
  on public.publicacoes_redes (board_id, publicado_em desc);

-- ---------------------------------------------------------------------------
-- sincronizacoes — o que o cron fez, e o que correu mal
-- ---------------------------------------------------------------------------

/*
  Mesmo papel que `importacoes_trello` tem na importação: sem um sítio onde a
  falha fica escrita, uma sincronização que rebenta às três da manhã é um
  painel desatualizado sem explicação nenhuma.
*/
create table public.sincronizacoes (
  id            bigserial primary key,
  ligacao_id    uuid not null references public.ligacoes_redes (id) on delete cascade,
  iniciada_em   timestamptz not null default now(),
  terminada_em  timestamptz,
  estado        text not null default 'a_correr'
                  check (estado in ('a_correr', 'concluida', 'falhou')),
  erro          text,
  linhas        integer not null default 0
);

comment on table public.sincronizacoes is
  'Uma linha por tentativa de sincronização. Visível a quem gere o quadro, para poder ver o que falhou.';

create index sincronizacoes_ligacao_idx
  on public.sincronizacoes (ligacao_id, iniciada_em desc);

-- ---------------------------------------------------------------------------
-- O board_id e a rede vêm da ligação, sempre
-- ---------------------------------------------------------------------------

/*
  Desnormalização mantida por trigger, exatamente como `cards.board_id`. Quem
  escreve nem precisa de os mandar: preenchê-los aqui é o que garante que nunca
  divergem da ligação, e é a diferença entre uma desnormalização e um bug à
  espera.
*/
create or replace function public.preencher_quadro_da_ligacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid;
  v_rede public.rede_social;
begin
  select l.board_id, l.rede into v_quadro, v_rede
  from public.ligacoes_redes l
  where l.id = new.ligacao_id;

  if v_quadro is null then
    raise exception 'Ligação inexistente.' using errcode = 'foreign_key_violation';
  end if;

  new.board_id := v_quadro;
  new.rede := v_rede;
  return new;
end;
$$;

create trigger metricas_redes_quadro
  before insert or update on public.metricas_redes
  for each row execute function public.preencher_quadro_da_ligacao();

create trigger demografia_redes_quadro
  before insert or update on public.demografia_redes
  for each row execute function public.preencher_quadro_da_ligacao();

create trigger publicacoes_redes_quadro
  before insert or update on public.publicacoes_redes
  for each row execute function public.preencher_quadro_da_ligacao();

-- `atualizado_em` de `ligacoes_redes`, para se saber quando é que o estado mudou.
create or replace function public.tocar_ligacao_rede()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger ligacoes_redes_tocar
  before update on public.ligacoes_redes
  for each row execute function public.tocar_ligacao_rede();

-- ===========================================================================
-- FUNÇÕES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- O quadro de uma ligação
-- ---------------------------------------------------------------------------

-- Cópia direta de `quadro_do_cartao`, e pela mesma razão: `sincronizacoes` não
-- tem `board_id` próprio e precisa de o ir buscar para a política.
create or replace function public.quadro_da_ligacao(ligacao uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.board_id
  from public.ligacoes_redes l
  where l.id = quadro_da_ligacao.ligacao;
$$;

comment on function public.quadro_da_ligacao(uuid) is
  'O quadro a que uma ligação de rede social pertence.';

revoke execute on function public.quadro_da_ligacao(uuid) from public, anon;
grant execute on function public.quadro_da_ligacao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ligar uma conta
-- ---------------------------------------------------------------------------

/*
  Ligar não pode ser um INSERT do browser, por duas razões independentes:
  `registar_no_log` está revogada de `authenticated`, e a substituição de uma
  conta pela outra tem de ser uma operação só.

  O segredo NÃO passa por aqui. Esta função trata da linha visível; o token é
  escrito a seguir, pela rota de callback, com a service_role. Assim o token
  nunca atravessa uma função que `authenticated` possa chamar.
*/
create or replace function public.definir_ligacao_rede(
  p_quadro uuid,
  p_rede public.rede_social,
  p_conta text,
  p_nome text,
  p_avatar text default null,
  p_expira_em timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_conta text := nullif(trim(coalesce(p_conta, '')), '');
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_anterior text;
begin
  if not public.pode_gerir_quadro(p_quadro) then
    raise exception 'Só quem gere o quadro pode ligar contas de redes sociais.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_conta is null or v_nome is null then
    raise exception 'A ligação precisa da conta e do nome dela.'
      using errcode = 'check_violation';
  end if;

  select r.conta_externa_id into v_anterior
  from public.ligacoes_redes r
  where r.board_id = p_quadro and r.rede = p_rede;

  insert into public.ligacoes_redes
    (board_id, rede, conta_externa_id, nome_conta, avatar_url, expira_em, ligado_por)
  values
    (p_quadro, p_rede, v_conta, v_nome, nullif(trim(coalesce(p_avatar, '')), ''),
     p_expira_em, (select auth.uid()))
  on conflict (board_id, rede) do update
    set conta_externa_id = excluded.conta_externa_id,
        nome_conta       = excluded.nome_conta,
        avatar_url       = excluded.avatar_url,
        expira_em        = excluded.expira_em,
        ligado_por       = excluded.ligado_por,
        estado           = 'activa',
        erro             = null,
        /*
          Trocar de conta deita fora o histórico da anterior — os números de
          duas contas diferentes não são a mesma série e somá-los seria mentir.
          Voltar a ligar a MESMA conta (renovar um token expirado) preserva
          tudo, que é o caso comum.
        */
        primeiro_dia     = case
                             when public.ligacoes_redes.conta_externa_id = excluded.conta_externa_id
                             then public.ligacoes_redes.primeiro_dia
                             else null
                           end,
        sincronizada_em  = case
                             when public.ligacoes_redes.conta_externa_id = excluded.conta_externa_id
                             then public.ligacoes_redes.sincronizada_em
                             else null
                           end
  returning id into v_id;

  -- Trocar de conta apaga o que era da anterior. O `on delete cascade` não
  -- serve aqui: a linha da ligação fica, é o conteúdo dela que muda de dono.
  if v_anterior is not null and v_anterior is distinct from v_conta then
    delete from public.metricas_redes    where ligacao_id = v_id;
    delete from public.demografia_redes  where ligacao_id = v_id;
    delete from public.publicacoes_redes where ligacao_id = v_id;
  end if;

  /*
    `substituiu` só é preenchido quando a conta muda mesmo. Voltar a ligar a
    mesma conta é renovar um token, não substituir nada — e um registo que
    chamasse substituição às duas coisas não servia para responder à única
    pergunta que se lhe faz: quando é que este quadro mudou de conta.
  */
  perform public.registar_no_log(
    'rede:ligar',
    (select auth.uid()),
    jsonb_build_object(
      'quadro', p_quadro,
      'rede', p_rede,
      'conta', v_conta,
      'nome', v_nome,
      'renovacao', v_anterior is not distinct from v_conta,
      'substituiu', case when v_anterior is distinct from v_conta then v_anterior end
    )
  );

  return v_id;
end;
$$;

comment on function public.definir_ligacao_rede(uuid, public.rede_social, text, text, text, timestamptz) is
  'Liga (ou volta a ligar) uma conta de rede social a um quadro. Exclusivo de quem gere o quadro.';

revoke execute on function public.definir_ligacao_rede(uuid, public.rede_social, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.definir_ligacao_rede(uuid, public.rede_social, text, text, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Desligar
-- ---------------------------------------------------------------------------

create or replace function public.remover_ligacao_rede(p_ligacao uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid;
  v_rede public.rede_social;
  v_nome text;
  v_apagadas integer;
begin
  select r.board_id, r.rede, r.nome_conta into v_quadro, v_rede, v_nome
  from public.ligacoes_redes r
  where r.id = p_ligacao;

  -- Uma ligação que já não existe é um pedido repetido, não um erro. Devolve
  -- falso e não escreve no registo — mesmo padrão de `remover_membro_quadro`.
  if v_quadro is null then
    return false;
  end if;

  if not public.pode_gerir_quadro(v_quadro) then
    raise exception 'Só quem gere o quadro pode desligar contas de redes sociais.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.ligacoes_redes where id = p_ligacao;
  get diagnostics v_apagadas = row_count;

  if v_apagadas = 0 then
    return false;
  end if;

  perform public.registar_no_log(
    'rede:desligar',
    (select auth.uid()),
    jsonb_build_object('quadro', v_quadro, 'rede', v_rede, 'nome', v_nome)
  );

  return true;
end;
$$;

comment on function public.remover_ligacao_rede(uuid) is
  'Desliga uma conta e apaga o histórico dela. Exclusivo de quem gere o quadro.';

revoke execute on function public.remover_ligacao_rede(uuid) from public, anon;
grant execute on function public.remover_ligacao_rede(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar o estado, a partir do sincronizador
-- ---------------------------------------------------------------------------

/*
  O cron corre com a service_role e podia fazer o UPDATE direto. Passa por aqui
  para o registo continuar a ter um dono único: uma ligação que expira é uma
  alteração de acesso como outra qualquer, e `acessos_log` é onde essas vivem.

  `ator_id` fica a nulo de propósito — não foi ninguém, foi o sistema.
*/
create or replace function public.marcar_estado_ligacao(
  p_ligacao uuid,
  p_estado text,
  p_erro text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes text;
begin
  if p_estado not in ('activa', 'expirada', 'erro', 'revogada') then
    raise exception 'Estado de ligação desconhecido: %', p_estado
      using errcode = 'check_violation';
  end if;

  select r.estado into v_antes from public.ligacoes_redes r where r.id = p_ligacao;
  if v_antes is null then
    return;
  end if;

  update public.ligacoes_redes
  set estado = p_estado,
      erro = nullif(trim(coalesce(p_erro, '')), '')
  where id = p_ligacao;

  -- Só se escreve no registo quando o estado muda mesmo. Uma ligação partida
  -- há uma semana não vale sete linhas iguais.
  if v_antes is distinct from p_estado then
    perform public.registar_no_log(
      'rede:' || case p_estado when 'activa' then 'renovar' else p_estado end,
      null,
      jsonb_build_object('ligacao', p_ligacao, 'antes', v_antes, 'erro', p_erro)
    );
  end if;
end;
$$;

comment on function public.marcar_estado_ligacao(uuid, text, text) is
  'Muda o estado de uma ligação e regista-o. Chamada pelo sincronizador, nunca pelo browser.';

revoke execute on function public.marcar_estado_ligacao(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.marcar_estado_ligacao(uuid, text, text) to service_role;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.ligacoes_redes     enable row level security;
alter table public.ligacoes_segredos  enable row level security;
alter table public.metricas_redes     enable row level security;
alter table public.demografia_redes   enable row level security;
alter table public.publicacoes_redes  enable row level security;
alter table public.sincronizacoes     enable row level security;

revoke all on
  public.ligacoes_redes,
  public.ligacoes_segredos,
  public.metricas_redes,
  public.demografia_redes,
  public.publicacoes_redes,
  public.sincronizacoes
from anon;

-- ---------------------------------------------------------------------------
-- ligacoes_redes
-- ---------------------------------------------------------------------------

/*
  Ver quais são as redes ligadas é acesso de quadro: o cliente tem de saber que
  o Instagram dele está ligado, e o aviso de "a ligação expirou" tem de chegar a
  quem olha para o painel, não só a quem o gere.

  O que o cliente não vê é o token — e esse está noutra tabela.
*/
create policy "quem tem acesso ve as redes ligadas"
  on public.ligacoes_redes for select to authenticated
  using (public.pode_aceder_quadro(board_id));

-- Escrever é só por `definir_ligacao_rede` e `remover_ligacao_rede`. Sem
-- políticas de escrita e sem GRANT, as duas funções são o único caminho — a
-- mesma técnica que fecha `profiles.papel_global` e `boards.imagem_*`.
revoke insert, update, delete on public.ligacoes_redes from authenticated;

-- ---------------------------------------------------------------------------
-- ligacoes_segredos — RLS ativa, política nenhuma
-- ---------------------------------------------------------------------------

/*
  Sem política, o RLS recusa tudo a `authenticated`, incluindo ao gestor do
  quadro e ao super_admin. É de propósito: um token da conta do cliente não
  tem razão nenhuma para ser legível a partir de um browser.

  Só a service_role lê esta tabela, e só de dentro do sincronizador.
*/
revoke all on public.ligacoes_segredos from authenticated, anon;

-- ---------------------------------------------------------------------------
-- métricas, demografia e publicações
-- ---------------------------------------------------------------------------

create policy "quem tem acesso ve as metricas"
  on public.metricas_redes for select to authenticated
  using (public.pode_aceder_quadro(board_id));

create policy "quem tem acesso ve a demografia"
  on public.demografia_redes for select to authenticated
  using (public.pode_aceder_quadro(board_id));

create policy "quem tem acesso ve as publicacoes"
  on public.publicacoes_redes for select to authenticated
  using (public.pode_aceder_quadro(board_id));

/*
  Só o sincronizador escreve, com a service_role. Um número que o browser
  pudesse escrever não seria uma estatística, seria um campo de texto — e este
  painel existe precisamente para o cliente poder confiar no que lá está.
*/
revoke insert, update, delete on
  public.metricas_redes,
  public.demografia_redes,
  public.publicacoes_redes,
  public.sincronizacoes
from authenticated, anon;

revoke usage, select on sequence public.metricas_redes_id_seq   from authenticated, anon;
revoke usage, select on sequence public.demografia_redes_id_seq from authenticated, anon;
revoke usage, select on sequence public.sincronizacoes_id_seq   from authenticated, anon;

-- ---------------------------------------------------------------------------
-- sincronizacoes
-- ---------------------------------------------------------------------------

-- Diagnóstico é de quem gere: o cliente vê o painel, não a máquina por baixo.
create policy "gestores veem as sincronizacoes"
  on public.sincronizacoes for select to authenticated
  using (public.pode_gerir_quadro(public.quadro_da_ligacao(ligacao_id)));

-- ===========================================================================
-- Tempo real
-- ===========================================================================

/*
  Fora da publicação de propósito. Dados diários não mudam enquanto se olha
  para eles, e um canal a mais é uma subscrição a mais por separador aberto.
  Quem quiser o número da hora recarrega a página.
*/
