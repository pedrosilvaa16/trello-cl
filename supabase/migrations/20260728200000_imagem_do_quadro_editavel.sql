-- A imagem do quadro deixa de ser posta por script.
--
-- A migração 20260728100000 criou as colunas e o `npm run fundos:r2` encheu-as
-- a partir da exportação da Trello. Faltava o resto: pôr, trocar e tirar sem
-- abrir um terminal, que é o que se faz sempre que entra um cliente novo.
--
-- Mesma regra da capa do cartão, e pela mesma razão: a imagem é identidade
-- visual do quadro, e quem manda nela é quem gere o quadro. E como sempre,
-- isso tem de ser verdade na base de dados. A política de UPDATE de `boards`
-- deixa passar qualquer gestor — o que aqui até coincide — mas o `cor` e o
-- `nome` são de quem edita, e as colunas da imagem não podiam ficar à mercê da
-- mesma política. Fecham-se por GRANT de coluna, como `cards.capa_*` e
-- `profiles.papel_global`.

/*
  As colunas devolvidas são exatamente as que a aplicação altera hoje —
  `Update` em src/lib/supabase/tipos.ts tem a mesma lista. `imagem_fundo`,
  `imagem_miniatura` e `brilho_fundo` ficam de fora e só mudam por
  `definir_imagem_quadro`.
*/
revoke update on public.boards from authenticated;
grant update (nome, descricao, cor, arquivado) on public.boards to authenticated;

/*
  Recebe o estado completo, e devolve as chaves que lá estavam para quem chama
  poder limpar o R2. Sem isso, cada troca de imagem deixava dois ficheiros
  órfãos no bucket — e ao contrário da capa do cartão, aqui não há um anexo com
  `on delete cascade` a tratar disso.

  Tudo a nulo é "tirar a imagem".
*/
create or replace function public.definir_imagem_quadro(
  p_quadro uuid,
  p_fundo text default null,
  p_miniatura text default null,
  p_brilho text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.boards;
  v_fundo text := nullif(trim(coalesce(p_fundo, '')), '');
  v_miniatura text := nullif(trim(coalesce(p_miniatura, '')), '');
  v_brilho text := nullif(trim(coalesce(p_brilho, '')), '');
begin
  if not public.pode_gerir_quadro(p_quadro) then
    raise exception 'Só quem gere o quadro pode mexer na imagem dele.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_antes from public.boards where id = p_quadro;
  if v_antes.id is null then
    raise exception 'Quadro inexistente.' using errcode = 'no_data_found';
  end if;

  if v_brilho is not null and v_brilho not in ('claro', 'escuro') then
    raise exception 'O brilho é «claro» ou «escuro».' using errcode = 'check_violation';
  end if;

  update public.boards
  set imagem_fundo = v_fundo,
      imagem_miniatura = v_miniatura,
      -- Sem imagem não há véu a escolher, e um brilho pendurado sozinho só
      -- daria para confundir quem leia a linha a seguir.
      brilho_fundo = case when v_fundo is null then null else v_brilho end
  where id = p_quadro;

  return json_build_object(
    'fundo_anterior', v_antes.imagem_fundo,
    'miniatura_anterior', v_antes.imagem_miniatura,
    'imagem_fundo', v_fundo,
    'imagem_miniatura', v_miniatura,
    'brilho_fundo', case when v_fundo is null then null else v_brilho end
  );
end;
$$;

comment on function public.definir_imagem_quadro(uuid, text, text, text) is
  'Põe, troca ou tira a imagem de um quadro. Exclusivo de quem gere o quadro.';

revoke execute on function public.definir_imagem_quadro(uuid, text, text, text)
  from public, anon;
grant execute on function public.definir_imagem_quadro(uuid, text, text, text)
  to authenticated;
