-- Políticas RLS. Nenhuma tabela vai para produção sem estas.
--
-- Regra base: vês um quadro se existir uma linha em board_members que te ligue
-- a ele. Listas, cartões, etiquetas, comentários e anexos herdam a permissão
-- através do board_id do respetivo quadro.
--
-- Escrita: `editor` e `admin` criam e alteram; `leitor` só lê.
-- Apagar quadros e gerir membros é exclusivo de `admin`.

alter table public.profiles            enable row level security;
alter table public.boards              enable row level security;
alter table public.board_members       enable row level security;
alter table public.lists               enable row level security;
alter table public.cards               enable row level security;
alter table public.labels              enable row level security;
alter table public.card_labels         enable row level security;
alter table public.card_members        enable row level security;
alter table public.comments            enable row level security;
alter table public.attachments         enable row level security;
alter table public.convites            enable row level security;
alter table public.dominios_permitidos enable row level security;

-- Esta ferramenta não tem nenhuma superfície pública: o papel anónimo não lê nada.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "perfis visiveis a quem partilha quadro"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.partilha_quadro(id));

create policy "cada um edita o seu perfil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Sem política de INSERT: os perfis nascem do trigger em auth.users.

-- ---------------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------------

create policy "membros veem o quadro"
  on public.boards for select to authenticated
  using (public.pode_aceder_quadro(id));

create policy "qualquer colaborador cria quadros"
  on public.boards for insert to authenticated
  with check (criado_por = (select auth.uid()));

create policy "editores alteram o quadro"
  on public.boards for update to authenticated
  using (public.pode_editar_quadro(id))
  with check (public.pode_editar_quadro(id));

create policy "apagar quadro e so de admin"
  on public.boards for delete to authenticated
  using (public.e_admin_quadro(id));

-- ---------------------------------------------------------------------------
-- board_members
-- ---------------------------------------------------------------------------

create policy "membros veem quem esta no quadro"
  on public.board_members for select to authenticated
  using (public.pode_aceder_quadro(board_id));

create policy "admin adiciona membros"
  on public.board_members for insert to authenticated
  with check (public.e_admin_quadro(board_id));

create policy "admin muda papeis"
  on public.board_members for update to authenticated
  using (public.e_admin_quadro(board_id))
  with check (public.e_admin_quadro(board_id));

-- Um admin remove quem quiser; qualquer membro pode sair por sua iniciativa.
create policy "admin remove membros ou o proprio sai"
  on public.board_members for delete to authenticated
  using (public.e_admin_quadro(board_id) or user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- lists
-- ---------------------------------------------------------------------------

create policy "membros veem as listas"
  on public.lists for select to authenticated
  using (public.pode_aceder_quadro(board_id));

create policy "editores criam listas"
  on public.lists for insert to authenticated
  with check (public.pode_editar_quadro(board_id));

create policy "editores alteram listas"
  on public.lists for update to authenticated
  using (public.pode_editar_quadro(board_id))
  with check (public.pode_editar_quadro(board_id));

create policy "editores apagam listas"
  on public.lists for delete to authenticated
  using (public.pode_editar_quadro(board_id));

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------

create policy "membros veem os cartoes"
  on public.cards for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_da_lista(list_id)));

create policy "editores criam cartoes"
  on public.cards for insert to authenticated
  with check (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

-- USING olha para a lista de origem, WITH CHECK para a lista de destino:
-- arrastar um cartão para um quadro onde não podes escrever é rejeitado.
create policy "editores alteram cartoes"
  on public.cards for update to authenticated
  using (public.pode_editar_quadro(public.quadro_da_lista(list_id)))
  with check (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

create policy "editores apagam cartoes"
  on public.cards for delete to authenticated
  using (public.pode_editar_quadro(public.quadro_da_lista(list_id)));

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------

create policy "membros veem etiquetas"
  on public.labels for select to authenticated
  using (public.pode_aceder_quadro(board_id));

create policy "editores criam etiquetas"
  on public.labels for insert to authenticated
  with check (public.pode_editar_quadro(board_id));

create policy "editores alteram etiquetas"
  on public.labels for update to authenticated
  using (public.pode_editar_quadro(board_id))
  with check (public.pode_editar_quadro(board_id));

create policy "editores apagam etiquetas"
  on public.labels for delete to authenticated
  using (public.pode_editar_quadro(board_id));

-- ---------------------------------------------------------------------------
-- card_labels
-- ---------------------------------------------------------------------------

create policy "membros veem etiquetas do cartao"
  on public.card_labels for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_do_cartao(card_id)));

create policy "editores aplicam etiquetas"
  on public.card_labels for insert to authenticated
  with check (public.pode_editar_quadro(public.quadro_do_cartao(card_id)));

create policy "editores retiram etiquetas"
  on public.card_labels for delete to authenticated
  using (public.pode_editar_quadro(public.quadro_do_cartao(card_id)));

-- ---------------------------------------------------------------------------
-- card_members
-- ---------------------------------------------------------------------------

create policy "membros veem quem esta no cartao"
  on public.card_members for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_do_cartao(card_id)));

-- Só se atribui a um cartão gente que já pertence ao quadro.
create policy "editores atribuem cartoes"
  on public.card_members for insert to authenticated
  with check (
    public.pode_editar_quadro(public.quadro_do_cartao(card_id))
    and public.e_membro_do_quadro(public.quadro_do_cartao(card_id), user_id)
  );

create policy "editores desatribuem cartoes"
  on public.card_members for delete to authenticated
  using (public.pode_editar_quadro(public.quadro_do_cartao(card_id)));

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

create policy "membros leem comentarios"
  on public.comments for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_do_cartao(card_id)));

create policy "editores comentam em nome proprio"
  on public.comments for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and public.pode_editar_quadro(public.quadro_do_cartao(card_id))
  );

-- Editar e apagar: só os próprios comentários.
create policy "cada um edita os seus comentarios"
  on public.comments for update to authenticated
  using (autor_id = (select auth.uid()))
  with check (autor_id = (select auth.uid()));

create policy "cada um apaga os seus comentarios"
  on public.comments for delete to authenticated
  using (autor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------

create policy "membros veem anexos"
  on public.attachments for select to authenticated
  using (public.pode_aceder_quadro(public.quadro_do_cartao(card_id)));

create policy "editores carregam anexos"
  on public.attachments for insert to authenticated
  with check (
    carregado_por = (select auth.uid())
    and public.pode_editar_quadro(public.quadro_do_cartao(card_id))
  );

create policy "editores removem anexos"
  on public.attachments for delete to authenticated
  using (public.pode_editar_quadro(public.quadro_do_cartao(card_id)));

-- Sem UPDATE: um anexo é imutável. Substituir = remover e voltar a carregar.

-- ---------------------------------------------------------------------------
-- convites
-- ---------------------------------------------------------------------------

-- A troca do token pela conta acontece no servidor com service_role, porque
-- quem resgata um convite ainda não tem sessão. Daqui só passam os admins.

create policy "admins veem convites"
  on public.convites for select to authenticated
  using (public.e_admin_algures());

create policy "admins criam convites"
  on public.convites for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and public.e_admin_algures()
    and (board_id is null or public.e_admin_quadro(board_id))
  );

create policy "admins revogam convites"
  on public.convites for delete to authenticated
  using (
    public.e_admin_algures()
    and (board_id is null or public.e_admin_quadro(board_id))
  );

-- ---------------------------------------------------------------------------
-- dominios_permitidos
-- ---------------------------------------------------------------------------

-- Leitura para mostrar na interface qual o domínio esperado num convite.
-- Escrita só por SQL/service_role: é a barreira entre a ferramenta e a internet.
create policy "colaboradores veem os dominios"
  on public.dominios_permitidos for select to authenticated
  using (true);
