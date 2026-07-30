-- Separador «Tarefas»: a organização interna da equipa, fora dos quadros.
--
-- Até aqui tudo na plataforma pendurava num quadro, e um quadro é um cliente.
-- Faltava o outro trabalho: o que a equipa da casa tem para fazer e que não é
-- de cliente nenhum — faturas, propostas, candidaturas, o que for. Meter isso
-- num quadro chamado «Interno» resolvia à primeira vista e partia à segunda: o
-- RLS dos quadros é desenhado para clientes verem o quadro deles, e uma lista
-- de quadros com um intruso lá no meio é uma exceção que se paga em todo o
-- lado a seguir.
--
-- Daí a decisão: tabelas próprias, hierarquia própria, funções de acesso
-- próprias. Isto NÃO se liga a `boards` nem a `cards` em lado nenhum, e é essa
-- a característica principal do desenho — não uma omissão.
--
-- ACESSO: eixo A e só o eixo A. Quem entra é `super_admin` ou `admin`, ou
-- seja, a equipa da casa, e é a mesma pergunta que `e_admin_global()` já
-- responde em toda a aplicação. Um cliente ou um freelancer não vê o separador
-- e não descobre que ele existe — mesma regra da «Estratégia», e pela mesma
-- razão: um separador cinzento com um cadeado conta a história que não se quer
-- contar.
--
-- Entre gestores não há níveis. São duas ou três pessoas a organizar o
-- trabalho da casa, e inventar `gestor`/`editor`/`leitor` aqui dentro era
-- construir uma hierarquia que ninguém pediu para depois ter de a manter. Se
-- um dia fizer falta, entra como um eixo novo e não como uma exceção.

-- ---------------------------------------------------------------------------
-- Estado e prioridade
-- ---------------------------------------------------------------------------

/*
  Estados fixos, e não configuráveis por espaço.

  A ferramenta que serviu de referência deixa cada lista inventar os seus, e é
  precisamente o que faz com que duas listas deixem de ser comparáveis: uma
  vista de agenda que junta tarefas de sítios diferentes não sabe o que é que
  «Em revisão» quer dizer ao lado de «A aguardar». Quatro estados que toda a
  gente lê da mesma maneira valem mais do que vinte que ninguém consegue somar.

  `bloqueada` está cá porque é a única que muda o que se faz a seguir: uma
  tarefa parada à espera de outra pessoa não é «por fazer», e a diferença é o
  que decide se vale a pena insistir.
*/
create type public.estado_tarefa as enum (
  'por_fazer',
  'em_curso',
  'bloqueada',
  'concluida'
);

comment on type public.estado_tarefa is
  'Em que pé está a tarefa. Fixo de propósito: vistas que juntam listas diferentes precisam de estados comparáveis.';

/*
  A prioridade é anulável, e isso é a parte que interessa. Obrigar a escolher
  uma prioridade a cada tarefa faz com que todas acabem em «média», e uma
  coluna onde tudo tem o mesmo valor não ordena nada. Nulo = ninguém decidiu,
  que é a verdade na maioria das tarefas.
*/
create type public.prioridade_tarefa as enum (
  'urgente',
  'alta',
  'media',
  'baixa'
);

comment on type public.prioridade_tarefa is
  'Anulável de propósito: nulo é "ninguém decidiu", e é o caso mais comum.';

-- ---------------------------------------------------------------------------
-- Espaços
-- ---------------------------------------------------------------------------

/*
  O nível de cima: uma área de trabalho da casa («Interno», «Comercial»,
  «Financeiro»). Dá a cor que se vê na barra lateral e é por onde as listas se
  agrupam.

  A cor guarda-se pelo nome e não em hexadecimal, como as etiquetas e os
  quadros — a paleta vive em `globals.css` e muda sem migração nenhuma.
*/
create table public.tarefa_espacos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 1 and 80),
  cor         text not null default 'cinza'
                check (cor in ('verde', 'amarelo', 'laranja', 'vermelho',
                               'roxo', 'azul', 'rosa', 'cinza')),
  posicao     numeric not null,
  arquivado   boolean not null default false,
  criado_por  uuid references public.profiles (id) on delete set null,
  criado_em   timestamptz not null default now()
);

comment on table public.tarefa_espacos is
  'Áreas de trabalho internas da equipa. Não têm nada a ver com boards — um quadro é um cliente, um espaço não.';

create index tarefa_espacos_posicao_idx
  on public.tarefa_espacos (posicao) where not arquivado;

-- ---------------------------------------------------------------------------
-- Listas
-- ---------------------------------------------------------------------------

create table public.tarefa_listas (
  id          uuid primary key default gen_random_uuid(),
  espaco_id   uuid not null references public.tarefa_espacos (id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 80),
  posicao     numeric not null,
  arquivada   boolean not null default false,
  criado_por  uuid references public.profiles (id) on delete set null,
  criado_em   timestamptz not null default now()
);

comment on table public.tarefa_listas is
  'O nível onde as tarefas vivem. Um espaço tem listas; uma lista tem tarefas.';

create index tarefa_listas_espaco_idx
  on public.tarefa_listas (espaco_id, posicao);

-- ---------------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------------

create table public.tarefas (
  id            uuid primary key default gen_random_uuid(),
  lista_id      uuid not null references public.tarefa_listas (id) on delete cascade,
  /* Cópia de tarefa_listas.espaco_id, mantida por trigger — mesma razão que
     `cards.board_id`: filtrar por espaço sem subir a `tarefa_listas` uma vez
     por linha. Fora do GRANT de UPDATE, para não poder divergir. */
  espaco_id     uuid not null references public.tarefa_espacos (id) on delete cascade,

  /* Subtarefas por auto-referência. `on delete cascade`: apagar a mãe leva as
     filhas, que é o que qualquer pessoa espera ao apagar uma tarefa com uma
     lista de passos lá dentro. */
  mae_id        uuid references public.tarefas (id) on delete cascade,

  titulo        text not null check (char_length(titulo) between 1 and 200),
  descricao     text check (char_length(descricao) <= 20000),

  estado        public.estado_tarefa not null default 'por_fazer',
  prioridade    public.prioridade_tarefa,

  /* Duas datas e não uma. A data de início é o que separa «tenho de entregar
     isto na sexta» de «começo isto na quarta» — sem ela, tudo o que tem prazo
     aparece a gritar no mesmo dia. */
  data_inicio   timestamptz,
  data_limite   timestamptz,

  posicao       numeric not null,
  arquivada     boolean not null default false,

  criado_por    uuid references public.profiles (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  /* Uma tarefa não é mãe de si própria. O nível a mais é impedido pelo
     trigger mais abaixo — aqui só se fecha o caso trivial, que é o único que
     um CHECK consegue ver. */
  constraint tarefas_mae_diferente check (mae_id is null or mae_id <> id)
);

comment on table public.tarefas is
  'Trabalho interno da equipa. Sem ligação nenhuma a cards — de propósito.';
comment on column public.tarefas.espaco_id is
  'Cópia de tarefa_listas.espaco_id, mantida por trigger. Nunca se escreve à mão.';
comment on column public.tarefas.mae_id is
  'A tarefa de que esta é subtarefa. Um nível só — ver tarefas_validar_mae().';

create index tarefas_lista_idx     on public.tarefas (lista_id, posicao);
create index tarefas_espaco_idx    on public.tarefas (espaco_id);
create index tarefas_mae_idx       on public.tarefas (mae_id) where mae_id is not null;
/* A vista de agenda ordena por data-limite e ignora o que está arquivado —
   é esta a consulta que corre a cada abertura do separador. */
create index tarefas_agenda_idx
  on public.tarefas (data_limite) where not arquivada;

-- ---------------------------------------------------------------------------
-- Responsáveis
-- ---------------------------------------------------------------------------

/*
  Quem é que pega nisto. Muitos-para-muitos porque uma tarefa partilhada entre
  duas pessoas é comum e resolver isso com uma coluna só obriga a escolher uma
  delas para levar a culpa.

  Só pessoas da casa: o CHECK que o garante não cabe aqui (é uma consulta a
  outra tabela), e vive na política de INSERT mais abaixo.
*/
create table public.tarefa_responsaveis (
  tarefa_id  uuid not null references public.tarefas (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (tarefa_id, user_id)
);

comment on table public.tarefa_responsaveis is
  'Quem é responsável por uma tarefa. Vários por tarefa.';

-- «As minhas tarefas» é a vista mais aberta de todas; este índice é o que a serve.
create index tarefa_responsaveis_pessoa_idx
  on public.tarefa_responsaveis (user_id, tarefa_id);

-- ---------------------------------------------------------------------------
-- Triggers: o que não se escreve à mão
-- ---------------------------------------------------------------------------

/*
  `espaco_id` vem sempre da lista. Mesma técnica de `cartao_herdar_quadro()`:
  a coluna existe para o RLS e os filtros não terem de subir um nível, e a
  única forma de ela não mentir é nunca vir de fora.
*/
create or replace function public.tarefa_herdar_espaco()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select l.espaco_id into new.espaco_id
  from public.tarefa_listas l
  where l.id = new.lista_id;

  if new.espaco_id is null then
    raise exception 'A lista % não existe.', new.lista_id;
  end if;

  return new;
end;
$$;

create trigger tarefas_herdar_espaco
  before insert or update of lista_id on public.tarefas
  for each row
  execute function public.tarefa_herdar_espaco();

/*
  Mover uma lista de espaço arrasta as tarefas atrás dela. Sem isto, as tarefas
  ficavam com o espaço antigo e desapareciam do filtro sem ninguém perceber
  porquê — o pior modo de falha de uma coluna desnormalizada.
*/
create or replace function public.tarefa_lista_propagar_espaco()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.espaco_id is distinct from old.espaco_id then
    update public.tarefas set espaco_id = new.espaco_id where lista_id = new.id;
  end if;
  return new;
end;
$$;

create trigger tarefa_listas_propagar_espaco
  after update of espaco_id on public.tarefa_listas
  for each row
  execute function public.tarefa_lista_propagar_espaco();

/*
  Subtarefas: um nível e não mais.

  Não é preguiça — é o que evita ter de correr atrás de ciclos. Com um nível,
  a regra é uma pergunta só («a minha mãe já tem mãe?») e responde-se com um
  SELECT. Com N níveis, é uma travessia recursiva a cada gravação, e o dia em
  que alguém puser A dentro de B dentro de A a interface entra em ciclo
  infinito a desenhar.

  A subtarefa vive na mesma lista da mãe. Deixar as duas em listas diferentes
  daria uma subtarefa que aparece num sítio e conta noutro.
*/
create or replace function public.tarefas_validar_mae()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mae_de_mae uuid;
  v_lista_mae  uuid;
  v_tem_filhas boolean;
begin
  if new.mae_id is null then
    return new;
  end if;

  select t.mae_id, t.lista_id into v_mae_de_mae, v_lista_mae
  from public.tarefas t
  where t.id = new.mae_id;

  if not found then
    raise exception 'A tarefa mãe não existe.';
  end if;

  if v_mae_de_mae is not null then
    raise exception 'Uma subtarefa não pode ter subtarefas.';
  end if;

  if v_lista_mae is distinct from new.lista_id then
    raise exception 'Uma subtarefa tem de estar na mesma lista da tarefa mãe.';
  end if;

  -- O outro lado da mesma regra: uma tarefa que já é mãe não pode passar a filha.
  select exists (select 1 from public.tarefas f where f.mae_id = new.id)
    into v_tem_filhas;

  if v_tem_filhas then
    raise exception 'Esta tarefa já tem subtarefas e não pode passar a subtarefa.';
  end if;

  return new;
end;
$$;

create trigger tarefas_validar_mae
  before insert or update of mae_id, lista_id on public.tarefas
  for each row
  execute function public.tarefas_validar_mae();

create trigger tarefas_atualizado_em
  before update on public.tarefas
  for each row
  execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Posições fracionárias
-- ---------------------------------------------------------------------------

/*
  Mesma regra da secção 3.1 da especificação: `posicao` é numeric e nunca um
  inteiro sequencial. Estas duas fazem para as tarefas o que
  `posicao_fim_da_lista` e `reequilibrar_lista` fazem para os cartões.
*/
create or replace function public.posicao_fim_lista_tarefas(p_lista uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(t.posicao), 0) + 1
  from public.tarefas t
  where t.lista_id = p_lista;
$$;

create or replace function public.posicao_fim_espacos()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(e.posicao), 0) + 1 from public.tarefa_espacos e;
$$;

create or replace function public.posicao_fim_listas(p_espaco uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(l.posicao), 0) + 1
  from public.tarefa_listas l
  where l.espaco_id = p_espaco;
$$;

/*
  Não há aqui nenhuma `reequilibrar_lista_tarefas`, e a ausência é deliberada.
  O reequilíbrio da secção 3.1 serve para quando se insere ENTRE duas posições
  vezes que cheguem para o intervalo cair abaixo de 0.0001 — e inserir entre
  duas é uma operação que só existe com arrasto. Aqui só se acrescenta ao fim,
  onde o intervalo é sempre 1. A função entra no dia em que o arrasto entrar,
  e não antes: código que nada chama é código que ninguém testa.
*/

revoke execute on function public.posicao_fim_lista_tarefas(uuid) from public, anon;
revoke execute on function public.posicao_fim_espacos()           from public, anon;
revoke execute on function public.posicao_fim_listas(uuid)        from public, anon;
grant  execute on function public.posicao_fim_lista_tarefas(uuid) to authenticated;
grant  execute on function public.posicao_fim_espacos()           to authenticated;
grant  execute on function public.posicao_fim_listas(uuid)        to authenticated;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------

/*
  UMA função, e todas as políticas passam por ela. Duas cópias da mesma regra a
  divergir são uma falha de segurança silenciosa — secção 10 da especificação.

  Repara no que ela NÃO faz: não recebe id nenhum. O separador é da casa
  inteiro ou não é de ninguém, e um parâmetro que não muda a resposta só serve
  para sugerir uma granularidade que não existe.

  `e_admin_global()` já verifica a conta ativa por dentro — `papel_global_atual`
  filtra por `p.ativo`. Esta função existe na mesma, para o nome dizer do que é
  que se está a falar e para o dia em que a regra mudar mudar num sítio só.
*/
create or replace function public.pode_gerir_tarefas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.e_admin_global(), false);
$$;

comment on function public.pode_gerir_tarefas() is
  'Verdadeiro para super_admin e admin com conta ativa. É a única regra do separador «Tarefas».';

revoke execute on function public.pode_gerir_tarefas() from public, anon;
grant  execute on function public.pode_gerir_tarefas() to authenticated;

/*
  «Esta pessoa é da equipa da casa?»

  Tem de ser SECURITY DEFINER, e a razão não é óbvia até se ver falhar: uma
  política que consulte `public.profiles` diretamente é avaliada com a sessão
  de quem escreve, e `profiles` tem o seu próprio RLS — `partilha_quadro`, que
  só deixa ver o perfil de quem partilha um quadro connosco. Duas gestoras que
  não partilhem nenhum quadro não se veem uma à outra, e a subconsulta devolvia
  falso para uma colega perfeitamente válida. Atribuir uma tarefa a alguém da
  casa era recusado, sem nada no ecrã a explicar porquê.

  A alternativa seria alargar `partilha_quadro` para a equipa se ver toda —
  mas isso muda o que a aplicação inteira mostra, por causa de um separador.
  Uma função com uma pergunta só é mais barata e não tem efeitos a jusante.
*/
create or replace function public.e_da_equipa(p_pessoa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.ativo and p.papel_global in ('super_admin', 'admin')
    from public.profiles p
    where p.id = p_pessoa
  ), false);
$$;

comment on function public.e_da_equipa(uuid) is
  'Verdadeiro se a pessoa for super_admin ou admin com conta ativa. Quem pode ser responsável por uma tarefa.';

revoke execute on function public.e_da_equipa(uuid) from public, anon;
grant  execute on function public.e_da_equipa(uuid) to authenticated;

/*
  A equipa da casa, para o seletor de responsáveis.

  Mesmo problema do lado da leitura: um `select` a `profiles` a partir da
  aplicação devolveria só as colegas com quem se partilha um quadro, e o menu
  de atribuir apareceria quase vazio sem nada a dizer que faltava lá gente.

  Devolve a mesma condição que `e_da_equipa` — e é isso que garante que a
  interface nunca oferece um nome que a política depois recusa.
*/
create or replace function public.equipa_da_casa()
returns table (id uuid, nome text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.avatar_url
  from public.profiles p
  where p.ativo
    and p.papel_global in ('super_admin', 'admin')
    -- Quem não entra no separador também não fica a saber quem lá trabalha.
    and coalesce(public.pode_gerir_tarefas(), false)
  order by p.nome;
$$;

comment on function public.equipa_da_casa() is
  'Quem pode ficar responsável por uma tarefa. Vazio para quem não passa em pode_gerir_tarefas().';

revoke execute on function public.equipa_da_casa() from public, anon;
grant  execute on function public.equipa_da_casa() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tarefa_espacos       enable row level security;
alter table public.tarefa_listas        enable row level security;
alter table public.tarefas              enable row level security;
alter table public.tarefa_responsaveis  enable row level security;

-- Nenhuma superfície pública nesta ferramenta, aqui como no resto.
revoke all on public.tarefa_espacos      from anon;
revoke all on public.tarefa_listas       from anon;
revoke all on public.tarefas             from anon;
revoke all on public.tarefa_responsaveis from anon;

/*
  Quatro tabelas, uma regra, e a mesma para ler e para escrever.

  `for all` em vez de quatro políticas por tabela: quando a condição de SELECT
  e a de INSERT/UPDATE/DELETE são literalmente a mesma expressão, separá-las só
  cria a oportunidade de uma ser alterada e a outra não.
*/
create policy "gestores gerem os espacos"
  on public.tarefa_espacos for all to authenticated
  using (public.pode_gerir_tarefas())
  with check (public.pode_gerir_tarefas());

create policy "gestores gerem as listas"
  on public.tarefa_listas for all to authenticated
  using (public.pode_gerir_tarefas())
  with check (public.pode_gerir_tarefas());

create policy "gestores gerem as tarefas"
  on public.tarefas for all to authenticated
  using (public.pode_gerir_tarefas())
  with check (public.pode_gerir_tarefas());

/*
  Os responsáveis levam uma condição a mais: além de quem escreve ser da casa,
  quem é APONTADO tem de ser da casa e estar ativo. Sem isto, um admin podia
  pôr um cliente como responsável de uma tarefa interna — e o cliente não a
  veria (o RLS de `tarefas` recusa-lhe tudo), o que dá o pior resultado
  possível: uma tarefa atribuída a alguém que nunca vai saber que ela existe.
*/
create policy "gestores gerem os responsaveis"
  on public.tarefa_responsaveis for all to authenticated
  using (public.pode_gerir_tarefas())
  with check (
    public.pode_gerir_tarefas()
    and public.e_da_equipa(tarefa_responsaveis.user_id)
  );

-- ---------------------------------------------------------------------------
-- GRANTs de coluna
-- ---------------------------------------------------------------------------

/*
  O RLS não distingue colunas; os GRANTs distinguem — a lição de
  `profiles.papel_global` e de `cards.capa_*`.

  `espaco_id` é mantido por trigger e `atualizado_em` também. Deixá-los no
  UPDATE não dava privilégio nenhum a mais (toda a gente que entra aqui é da
  casa), mas dava a hipótese de os pôr errados a partir do browser e de a
  desnormalização passar a mentir. Fecha-se pela mesma razão que se fecha tudo
  o resto: para a regra viver num sítio só.
*/
/*
  `revoke all` primeiro, e não é por gosto de escrever a mais.

  O Supabase tem privilégios por omissão que dão a `authenticated` tudo sobre
  cada tabela nova do schema `public`. Um `grant update (colunas)` por cima
  disso não restringe nada: o UPDATE da tabela inteira continua lá, e as duas
  autorizações somam-se em vez de a segunda substituir a primeira. Sem este
  revoke, o fecho por coluna era decorativo.
*/
revoke all on public.tarefa_espacos      from authenticated;
revoke all on public.tarefa_listas       from authenticated;
revoke all on public.tarefas             from authenticated;
revoke all on public.tarefa_responsaveis from authenticated;

-- Espaços e listas não têm colunas mantidas por trigger: a tabela inteira.
grant select, insert, update, delete on public.tarefa_espacos to authenticated;
grant select, insert, update, delete on public.tarefa_listas  to authenticated;

-- Um responsável põe-se e tira-se; não há nada nesta linha para alterar.
grant select, insert, delete on public.tarefa_responsaveis to authenticated;

grant select, delete on public.tarefas to authenticated;

/*
  `espaco_id` e `atualizado_em` ficam de fora dos dois lados. `criado_por`
  entra no INSERT porque é a aplicação que lá põe o próprio id — a política já
  garante que quem escreve é da casa — e fica de fora do UPDATE, que quem
  criou uma tarefa não muda depois.
*/
grant insert (
  lista_id, mae_id, titulo, descricao, estado, prioridade,
  data_inicio, data_limite, posicao, arquivada, criado_por
) on public.tarefas to authenticated;

grant update (
  lista_id, mae_id, titulo, descricao, estado, prioridade,
  data_inicio, data_limite, posicao, arquivada
) on public.tarefas to authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

/*
  As tarefas entram na publicação como as listas e os cartões já entram. Duas
  pessoas a organizar a semana ao mesmo tempo é o caso normal deste separador,
  e não é aceitável que uma feche uma tarefa e a outra continue a olhar para
  ela aberta.

  O RLS aplica-se na mesma às mensagens de Realtime — quem não passa em
  `pode_gerir_tarefas()` não recebe linha nenhuma.
*/
-- `replica identity full` para o payload de DELETE trazer a linha inteira, e
-- não só a chave — sem isso o cliente não sabe de que lista tirar a tarefa.
alter table public.tarefas             replica identity full;
alter table public.tarefa_listas       replica identity full;
alter table public.tarefa_espacos      replica identity full;
alter table public.tarefa_responsaveis replica identity full;

-- Idempotente, como em 20260727090600: `add table` duas vezes é um erro, e uma
-- migração que rebenta a meio deixa metade do trabalho feito.
do $$
declare
  v_tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_tabela in array array[
    'tarefas', 'tarefa_listas', 'tarefa_espacos', 'tarefa_responsaveis'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Um sítio para começar
-- ---------------------------------------------------------------------------

/*
  Um espaço e uma lista, criados aqui, para o separador não abrir vazio no
  primeiro dia. Um ecrã vazio é um convite para agir — mas «cria um espaço,
  depois uma lista, depois uma tarefa» são três passos antes de se poder
  escrever a primeira coisa, e isso não é um convite, é um formulário.

  `criado_por` fica a nulo: isto não foi ninguém que criou, foi a migração.
*/
insert into public.tarefa_espacos (nome, cor, posicao)
values ('Interno', 'verde', 1);

insert into public.tarefa_listas (espaco_id, nome, posicao)
select id, 'Tarefas da equipa', 1 from public.tarefa_espacos where nome = 'Interno';
