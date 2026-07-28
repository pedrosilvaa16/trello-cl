-- Tempo real.
--
-- O Realtime do Supabase reavalia as políticas RLS por subscritor, por isso
-- pôr uma tabela na publicação não vaza nada: cada utilizador só recebe as
-- alterações das linhas que já podia ler.
--
-- `replica identity full` faz o WAL carregar a linha inteira. Sem isto, um
-- DELETE chega só com a chave primária — e sem as colunas não há como decidir
-- a que quadro pertencia a linha apagada, nem para RLS nem para o cliente.

alter table public.lists        replica identity full;
alter table public.cards        replica identity full;
alter table public.labels       replica identity full;
alter table public.card_labels  replica identity full;
alter table public.card_members replica identity full;
alter table public.comments     replica identity full;
alter table public.attachments  replica identity full;

do $$
declare
  v_tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_tabela in array array[
    'lists', 'cards', 'labels', 'card_labels', 'card_members', 'comments', 'attachments'
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
