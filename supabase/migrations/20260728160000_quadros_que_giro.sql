-- Os quadros que quem está autenticado pode dar a outra pessoa.
--
-- Duas páginas precisavam da mesma lista e nenhuma a tinha bem:
--
-- 1. O diálogo de convite montava-a no cliente com
--    `boards ... board_members!inner(papel = 'gestor')`. Isso é a regra de
--    `pode_gerir_quadro` copiada para outro sítio — e copiada com um erro: um
--    super_admin gere todos os quadros sem ter linha em `board_members`, por
--    isso via a lista vazia e não conseguia convidar ninguém para lado nenhum.
--
-- 2. O detalhe de uma pessoa não a tinha de todo. Só mostrava os quadros onde
--    a pessoa já estava, o que dava para tirar e não dava para pôr.
--
-- Passa a haver um único sítio onde a pergunta se faz, e é `pode_gerir_quadro`
-- quem responde — como manda a secção 10 da especificação.
--
-- Os arquivados ficam de fora: pôr alguém a trabalhar num quadro arquivado é
-- dar-lhe acesso a nada. Tirá-lo de um continua a ser possível, porque essa
-- lista vem de `detalhe_pessoa` e não daqui.

create or replace function public.quadros_que_giro()
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.nome
  from public.boards b
  where not b.arquivado
    and public.pode_gerir_quadro(b.id)
  order by b.nome;
$$;

comment on function public.quadros_que_giro() is
  'Os quadros ativos que quem pede pode gerir. A lista de onde saem os acessos que se concedem.';

revoke execute on function public.quadros_que_giro() from public, anon;
grant execute on function public.quadros_que_giro() to authenticated;
