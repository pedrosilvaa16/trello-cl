-- Imagem de destaque de um cartão.
--
-- O quadro já tem a sua (migração 20260728100000) e serve para o encontrar de
-- relance numa lista de 19 clientes. No cartão o efeito é o mesmo, uma escala
-- abaixo: numa lista de trinta cartões de texto, o que tem imagem é o que se
-- encontra sem ler.
--
-- QUEM LHE MEXE. Ao contrário do título e da descrição — que são de quem pode
-- editar o cartão — a capa é dos gestores do quadro e do super_admin. É uma
-- decisão de identidade visual do quadro, não de conteúdo do cartão.
--
-- E "é dos gestores" tem de ser verdade na base de dados, não só no ecrã. A
-- política de UPDATE de `cards` deixa passar qualquer editor; se a coluna
-- ficasse ao alcance dela, bastava uma chamada do browser para lá escrever. O
-- RLS não distingue colunas — os GRANT distinguem, e é a mesma técnica que
-- `profiles.papel_global` já usa para fechar a escalada de privilégios.

alter table public.cards
  add column imagem_destaque text;

comment on column public.cards.imagem_destaque is
  'Chave no bucket R2 da imagem de destaque. Só muda por definir_imagem_cartao().';

/*
  FECHO DA COLUNA.

  Tirar o UPDATE da tabela e devolvê-lo coluna a coluna deixa `imagem_destaque`
  de fora: a política continua a passar, o privilégio é que já não existe.

  As colunas devolvidas são exatamente as que a aplicação altera hoje —
  `Update` em src/lib/supabase/tipos.ts é a mesma lista. `mover_cartao` e
  `reequilibrar_lista` correm com a sessão de quem chama e só tocam em
  `list_id` e `posicao`, ambas cá dentro. `atualizado_em` e `board_id` são
  postas por triggers, e o Postgres não pede privilégio de coluna para o que um
  trigger escreve em NEW.
*/
revoke update on public.cards from authenticated;
grant update (list_id, titulo, descricao, posicao, data_limite, concluido, arquivado)
  on public.cards to authenticated;

/*
  O único caminho para a coluna.

  Devolve a chave anterior além da nova: quem chama precisa dela para apagar o
  objeto antigo do R2. Trocar a capa sem isso ia deixando ficheiros órfãos no
  bucket a cada substituição, sem nada que os apanhasse.

  `p_chave` a nulo é "remover a capa" — é a mesma operação, e um segundo ponto
  de entrada só para isso seria a mesma regra escrita duas vezes.
*/
create or replace function public.definir_imagem_cartao(
  p_cartao uuid,
  p_chave text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid := public.quadro_do_cartao(p_cartao);
  v_anterior text;
begin
  if v_quadro is null then
    raise exception 'Cartão inexistente.' using errcode = 'no_data_found';
  end if;

  if not public.pode_gerir_quadro(v_quadro) then
    raise exception 'Só quem gere o quadro pode mexer na imagem de destaque.'
      using errcode = 'insufficient_privilege';
  end if;

  select imagem_destaque into v_anterior
  from public.cards where id = p_cartao;

  update public.cards
  set imagem_destaque = nullif(trim(coalesce(p_chave, '')), '')
  where id = p_cartao;

  return json_build_object('anterior', v_anterior, 'chave', p_chave);
end;
$$;

comment on function public.definir_imagem_cartao(uuid, text) is
  'Põe, troca ou tira a imagem de destaque de um cartão. Exclusivo de quem gere o quadro.';

revoke execute on function public.definir_imagem_cartao(uuid, text) from public, anon;
grant execute on function public.definir_imagem_cartao(uuid, text) to authenticated;
