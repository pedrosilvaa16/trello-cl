-- Anexos: bucket privado + políticas coladas às do quadro.
--
-- Caminho: boards/{board_id}/cards/{card_id}/{uuid}-{nome_ficheiro}
-- O board_id vive no caminho precisamente para as políticas o poderem ler sem
-- consultar mais nenhuma tabela.
--
-- Nada é servido diretamente: o acesso é sempre por URL assinado de validade
-- curta, gerado no servidor depois de verificar a permissão. Estas políticas
-- são a rede de segurança por baixo disso.

insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- Extrai o board_id do caminho. Devolve null se o caminho não tiver a forma
-- esperada — e pode_aceder_quadro(null) é falso, por isso o caso degenerado
-- nega o acesso em vez de rebentar a política.
create or replace function public.quadro_do_caminho(caminho text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(caminho))[1] = 'boards'
     and (storage.foldername(caminho))[2] ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(caminho))[2])::uuid
  end;
$$;

grant execute on function public.quadro_do_caminho(text) to authenticated, service_role;

create policy "membros leem anexos do seu quadro"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and public.pode_aceder_quadro(public.quadro_do_caminho(name))
  );

create policy "editores carregam anexos no seu quadro"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.pode_editar_quadro(public.quadro_do_caminho(name))
  );

create policy "editores removem anexos do seu quadro"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'anexos'
    and public.pode_editar_quadro(public.quadro_do_caminho(name))
  );
