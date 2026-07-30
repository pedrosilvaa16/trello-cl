-- Reversão de 20260730090000_tarefas.sql.
--
-- Vive fora de supabase/migrations/ de propósito: o `supabase db push` aplica
-- tudo o que estiver lá dentro, por ordem, e uma reversão aplicada por engano
-- levava o separador «Tarefas» inteiro sem ninguém pedir.
--
-- Correr à mão, e só com uma boa razão:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/reverter/20260730090000_tarefas.sql
--
-- O QUE SE PERDE. Tudo o que estiver no separador: espaços, listas, tarefas,
-- subtarefas e quem era responsável por elas. Não há de onde reconstruir — não
-- existe cópia disto em mais lado nenhum, e nada nos quadros dos clientes
-- aponta para cá. Se houver trabalho lá dentro, copia as quatro tabelas para
-- um lado antes de correr isto.
--
-- O QUE NÃO SE PERDE: nada dos quadros. É a outra cara da decisão de manter
-- isto separado — esta reversão não toca em `boards`, `cards`, `lists`,
-- `profiles` nem em nenhuma política delas.

begin;

-- A ordem não é arbitrária: larga-se de cima para baixo — publicação, tabelas
-- (que levam consigo políticas, índices e triggers), depois as funções, depois
-- os enums. Ao contrário, o Postgres recusa-se a deixar cair o que ainda tem
-- quem dependa dele.

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'tarefas', 'tarefa_listas', 'tarefa_espacos', 'tarefa_responsaveis'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_tabela);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- `cascade` leva as políticas, os índices e os triggers de cada uma. A ordem
-- respeita as chaves estrangeiras entre elas, mesmo com o cascade a tratar do
-- assunto — é mais fácil de ler assim do que de confirmar que não é preciso.
drop table if exists public.tarefa_responsaveis cascade;
drop table if exists public.tarefas             cascade;
drop table if exists public.tarefa_listas       cascade;
drop table if exists public.tarefa_espacos      cascade;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

drop function if exists public.tarefa_herdar_espaco();
drop function if exists public.tarefa_lista_propagar_espaco();
drop function if exists public.tarefas_validar_mae();

drop function if exists public.posicao_fim_lista_tarefas(uuid);
drop function if exists public.posicao_fim_listas(uuid);
drop function if exists public.posicao_fim_espacos();

drop function if exists public.equipa_da_casa();
drop function if exists public.e_da_equipa(uuid);
drop function if exists public.pode_gerir_tarefas();

/*
  `tocar_atualizado_em()` NÃO se larga aqui: nasceu em 20260727090000 e é o
  gatilho de `cards.atualizado_em`. Largá-la partia os cartões a pretexto de
  desfazer as tarefas — o trigger que esta migração criou já se foi com a
  tabela.
*/

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

drop type if exists public.prioridade_tarefa;
drop type if exists public.estado_tarefa;

commit;
