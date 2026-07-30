-- Documentos nas tarefas.
--
-- MESMO BUCKET DO R2, prefixo diferente. Não há um bucket novo e não faz falta
-- uma chave nova, e a razão é que um segundo bucket não acrescentaria
-- segurança nenhuma: o R2 não tem RLS, o bucket já é privado e nada nele é
-- servido diretamente — quem impõe a permissão é o servidor, que só assina um
-- URL de validade curta depois de a confirmar. Dois buckets seriam duas
-- credenciais, duas configurações de CORS e dois sítios para enganar, para a
-- mesma garantia. As chaves das tarefas vivem em `tarefas/{espaco}/{tarefa}/…`
-- e as dos quadros em `boards/…`, que é quanto basta para não se pisarem.
--
-- TABELA PRÓPRIA, e não uma coluna a mais em `attachments`. Essa tem
-- `card_id not null` a apontar para `cards`, e pô-la a servir dois donos
-- obrigava a torná-la anulável e a acrescentar um CHECK «ou um ou outro» —
-- exatamente o tipo de exceção que a secção 13 evitou ao manter as tarefas
-- separadas dos quadros. O preço é uma tabela e quatro políticas; o que se
-- evita é uma tabela onde metade das linhas tem sempre metade das colunas a
-- nulo.

create table public.tarefa_anexos (
  id               uuid primary key default gen_random_uuid(),
  tarefa_id        uuid not null references public.tarefas (id) on delete cascade,
  nome_ficheiro    text not null check (char_length(nome_ficheiro) between 1 and 255),
  /* Chave do objeto no R2. Única, para duas linhas nunca apontarem ao mesmo
     ficheiro — apagar uma levaria o ficheiro da outra à frente. */
  caminho_storage  text not null unique,
  tamanho_bytes    bigint not null
                     check (tamanho_bytes > 0 and tamanho_bytes <= 209715200),
  tipo_mime        text not null check (char_length(tipo_mime) between 1 and 160),
  carregado_por    uuid references public.profiles (id) on delete set null,
  criado_em        timestamptz not null default now()
);

comment on table public.tarefa_anexos is
  'Ficheiros de uma tarefa interna. Mesmo bucket R2 dos quadros, prefixo tarefas/.';
comment on column public.tarefa_anexos.caminho_storage is
  'Chave do objeto no bucket R2. Decidida sempre pelo servidor, nunca pelo cliente.';

create index tarefa_anexos_tarefa_idx
  on public.tarefa_anexos (tarefa_id, criado_em);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tarefa_anexos enable row level security;
revoke all on public.tarefa_anexos from anon;

/*
  A mesma regra do resto do separador, e uma política por comando — como todas
  as outras tabelas desta base de dados. Não há UPDATE: um anexo carrega-se e
  remove-se; mudar-lhe o nome ou o caminho por baixo do ficheiro que já lá está
  não é uma operação que faça sentido oferecer.
*/
create policy "gestores veem os anexos das tarefas"
  on public.tarefa_anexos for select to authenticated
  using (public.pode_gerir_tarefas());

create policy "gestores anexam nas tarefas"
  on public.tarefa_anexos for insert to authenticated
  with check (public.pode_gerir_tarefas());

create policy "gestores removem anexos das tarefas"
  on public.tarefa_anexos for delete to authenticated
  using (public.pode_gerir_tarefas());

-- ---------------------------------------------------------------------------
-- GRANTs
-- ---------------------------------------------------------------------------

-- `revoke all` primeiro: os privilégios por omissão do Supabase dão tudo sobre
-- cada tabela nova, e um `grant` por cima soma-se em vez de substituir.
revoke all on public.tarefa_anexos from authenticated;
grant select, delete on public.tarefa_anexos to authenticated;

/*
  `caminho_storage` está no INSERT porque é o cliente que insere a linha depois
  de o ficheiro subir — mas o valor não é dele: vem da rota que autorizou o
  envio, que é quem decide a chave. Se a chave viesse do browser, alguém
  escrevia uma linha a apontar para o anexo de outra pessoa e lia-o pela rota
  de leitura, que só confirma que a LINHA é visível.

  Está fechado do outro lado: `tarefa_anexos_caminho_no_sitio` mais abaixo
  recusa qualquer chave que não caia debaixo da tarefa a que a linha diz
  pertencer.
*/
grant insert (
  tarefa_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, carregado_por
) on public.tarefa_anexos to authenticated;

-- ---------------------------------------------------------------------------
-- A chave tem de cair debaixo da tarefa
-- ---------------------------------------------------------------------------

/*
  O fecho que faz a rota de envio ser a única fonte possível de chaves.

  Sem isto, a política de INSERT deixava escrever uma linha com
  `tarefa_id` = uma tarefa qualquer e `caminho_storage` = a chave de um anexo
  de outra tarefa. A rota de leitura assina o que a linha disser, e a linha
  seria visível — o RLS não tem como saber que o caminho não é dela.

  O trigger compara o prefixo com aquilo que `chaveDoAnexoDeTarefa` produz do
  lado do servidor. As duas metades da regra têm de dizer o mesmo, e é por isso
  que o formato está escrito aqui em vez de só em TypeScript.
*/
create or replace function public.tarefa_anexo_caminho_no_sitio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_espaco uuid;
begin
  select t.espaco_id into v_espaco
  from public.tarefas t
  where t.id = new.tarefa_id;

  if v_espaco is null then
    raise exception 'A tarefa % não existe.', new.tarefa_id;
  end if;

  if new.caminho_storage not like
     format('tarefas/%s/%s/%%', v_espaco, new.tarefa_id) then
    raise exception
      'O caminho do anexo não pertence a esta tarefa.';
  end if;

  return new;
end;
$$;

create trigger tarefa_anexos_caminho_no_sitio
  before insert on public.tarefa_anexos
  for each row
  execute function public.tarefa_anexo_caminho_no_sitio();

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

alter table public.tarefa_anexos replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tarefa_anexos'
  ) then
    alter publication supabase_realtime add table public.tarefa_anexos;
  end if;
end;
$$;
