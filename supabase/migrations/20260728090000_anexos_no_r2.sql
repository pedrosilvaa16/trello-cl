-- Os anexos passam para o Cloudflare R2.
--
-- O Supabase Storage deixa de ser usado para ficheiros: 831 MB enchiam o 1 GB
-- do plano, e os vídeos ficavam de fora por causa do limite de 25 MB. No R2 o
-- espaço deixa de ser o problema e a saída de dados não se paga.
--
-- O que muda no modelo é pouco: `caminho_storage` continua a ser a chave do
-- objeto, com o mesmo formato de caminho. Muda o sítio onde essa chave é
-- resolvida — e isso vive no servidor (src/lib/r2.ts), não aqui.

-- ---------------------------------------------------------------------------
-- Tamanho
-- ---------------------------------------------------------------------------

-- A especificação fixou 25 MB (secção 3.4) por causa do armazenamento de então.
-- Com o R2 esse motivo desapareceu, e sem subir o limite os 17 vídeos da Trello
-- não teriam como entrar. 200 MB continua a ser um travão contra despejos, mas
-- deixa passar vídeo a sério.
do $$
declare
  v_restricao record;
begin
  for v_restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.attachments'::regclass
      and contype = 'c'
      and conname = 'attachments_tamanho'
  loop
    execute format('alter table public.attachments drop constraint %I', v_restricao.conname);
  end loop;
end;
$$;

alter table public.attachments
  add constraint attachments_tamanho
  check (tamanho_bytes is null or (tamanho_bytes > 0 and tamanho_bytes <= 209715200));

comment on column public.attachments.caminho_storage is
  'Chave do objeto no bucket R2. Nulo quando o anexo é apenas uma ligação.';

-- ---------------------------------------------------------------------------
-- Sair do Supabase Storage
-- ---------------------------------------------------------------------------

-- As políticas do bucket liam o board_id do caminho para impor as permissões
-- do quadro. No R2 não há RLS: quem impõe a permissão é o servidor, que só
-- assina um URL depois de a confirmar — e é por isso que as credenciais do R2
-- nunca saem de lá.
drop policy if exists "membros leem anexos do seu quadro" on storage.objects;
drop policy if exists "editores carregam anexos no seu quadro" on storage.objects;
drop policy if exists "editores removem anexos do seu quadro" on storage.objects;

drop function if exists public.quadro_do_caminho(text);

-- O bucket fica sem objetos e sem uso. Não é apagado aqui de propósito: apagar
-- um bucket leva os ficheiros à frente, e isso é uma decisão para depois de a
-- cópia para o R2 estar confirmada — ver scripts/anexos-para-r2.mjs.
