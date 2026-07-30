-- As políticas das tarefas, uma por comando em vez de uma `for all`.
--
-- PORQUE É QUE ISTO É UMA MIGRAÇÃO E NÃO UMA CORREÇÃO NA ANTERIOR: a
-- 20260730090000 já está aplicada. Reescrever uma migração aplicada é mentir
-- ao histórico — quem aplicar as duas por ordem tem de chegar ao mesmo sítio
-- onde já estamos.
--
-- PORQUÊ: consistência com o resto do esquema, e nada mais do que isso.
--
-- As quatro tabelas nasceram com uma política `for all`, escrita assim de
-- propósito: a condição de leitura e a de escrita eram a mesma expressão, e
-- separá-las parecia criar a oportunidade de uma divergir da outra. `cards`,
-- `lists`, `comments` e todas as outras têm uma política por comando desde a
-- primeira migração; esta era a única `for all` da base de dados, e uma
-- exceção que obriga quem lê a perguntar «porquê aqui não» custa mais do que a
-- repetição que evitava.
--
-- HONESTIDADE SOBRE A ORIGEM DESTA MIGRAÇÃO. Ela foi escrita a perseguir um
-- `Error 401: Unauthorized` que o Realtime devolvia, com o registo vazio, em
-- todos os eventos das tarefas. A hipótese era que o Realtime não encontrasse
-- a política de SELECT numa `for all`.
--
-- A hipótese ESTAVA ERRADA, e mediu-se: o mesmo 401 acontecia em `cards`, que
-- sempre teve políticas por comando. A causa era do lado do cliente — o canal
-- subscrevia antes de o token da sessão chegar ao socket, e o Realtime
-- avaliava as políticas como se fosse um visitante anónimo. Está corrigida em
-- `src/lib/supabase/tempo-real.ts`, não aqui.
--
-- Fica registado porque um comentário que atribui a correção ao sítio errado é
-- pior do que comentário nenhum: manda a próxima pessoa procurar onde não está.
--
-- A SEGURANÇA NÃO MUDA. A expressão é a mesma em todas as políticas novas, e é
-- a mesma que lá estava: `pode_gerir_tarefas()`. O `with check` de
-- `tarefa_responsaveis` mantém o `e_da_equipa()` que impedia atribuir uma
-- tarefa a quem nunca a poderia ver.

-- ---------------------------------------------------------------------------
-- Fora as antigas
-- ---------------------------------------------------------------------------

drop policy if exists "gestores gerem os espacos"      on public.tarefa_espacos;
drop policy if exists "gestores gerem as listas"       on public.tarefa_listas;
drop policy if exists "gestores gerem as tarefas"      on public.tarefas;
drop policy if exists "gestores gerem os responsaveis" on public.tarefa_responsaveis;

-- ---------------------------------------------------------------------------
-- tarefa_espacos
-- ---------------------------------------------------------------------------

create policy "gestores veem os espacos"
  on public.tarefa_espacos for select to authenticated
  using (public.pode_gerir_tarefas());

create policy "gestores criam espacos"
  on public.tarefa_espacos for insert to authenticated
  with check (public.pode_gerir_tarefas());

create policy "gestores alteram os espacos"
  on public.tarefa_espacos for update to authenticated
  using (public.pode_gerir_tarefas())
  with check (public.pode_gerir_tarefas());

create policy "gestores apagam os espacos"
  on public.tarefa_espacos for delete to authenticated
  using (public.pode_gerir_tarefas());

-- ---------------------------------------------------------------------------
-- tarefa_listas
-- ---------------------------------------------------------------------------

create policy "gestores veem as listas"
  on public.tarefa_listas for select to authenticated
  using (public.pode_gerir_tarefas());

create policy "gestores criam listas"
  on public.tarefa_listas for insert to authenticated
  with check (public.pode_gerir_tarefas());

create policy "gestores alteram as listas"
  on public.tarefa_listas for update to authenticated
  using (public.pode_gerir_tarefas())
  with check (public.pode_gerir_tarefas());

create policy "gestores apagam as listas"
  on public.tarefa_listas for delete to authenticated
  using (public.pode_gerir_tarefas());

-- ---------------------------------------------------------------------------
-- tarefas
-- ---------------------------------------------------------------------------

create policy "gestores veem as tarefas"
  on public.tarefas for select to authenticated
  using (public.pode_gerir_tarefas());

create policy "gestores criam tarefas"
  on public.tarefas for insert to authenticated
  with check (public.pode_gerir_tarefas());

create policy "gestores alteram as tarefas"
  on public.tarefas for update to authenticated
  using (public.pode_gerir_tarefas())
  with check (public.pode_gerir_tarefas());

create policy "gestores apagam as tarefas"
  on public.tarefas for delete to authenticated
  using (public.pode_gerir_tarefas());

-- ---------------------------------------------------------------------------
-- tarefa_responsaveis
-- ---------------------------------------------------------------------------

create policy "gestores veem os responsaveis"
  on public.tarefa_responsaveis for select to authenticated
  using (public.pode_gerir_tarefas());

/*
  A condição a mais, e a razão dela: sem `e_da_equipa`, um admin podia pôr um
  cliente como responsável de uma tarefa interna — e o cliente nunca a veria,
  porque o RLS de `tarefas` lhe recusa tudo. Ficava uma tarefa à espera de
  alguém que nunca soube que ela existia.
*/
create policy "gestores atribuem tarefas"
  on public.tarefa_responsaveis for insert to authenticated
  with check (
    public.pode_gerir_tarefas()
    and public.e_da_equipa(tarefa_responsaveis.user_id)
  );

-- Sem política de UPDATE: um responsável põe-se e tira-se, não se altera. O
-- GRANT também não o permite — as duas coisas dizem o mesmo, de propósito.
create policy "gestores tiram responsaveis"
  on public.tarefa_responsaveis for delete to authenticated
  using (public.pode_gerir_tarefas());
