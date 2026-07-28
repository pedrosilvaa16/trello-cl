-- Capa do cartão, como na Trello: uma cor ou uma imagem, em faixa ou inteira.
--
-- Substitui `cards.imagem_destaque`, da migração 20260728180000, que só sabia
-- fazer imagem e mais nada. Nenhum cartão a usava ainda, por isso a coluna sai
-- inteira em vez de ficar por compatibilidade.
--
-- O QUE MUDA NO DESENHO, e é a parte que interessa:
--
-- A imagem da capa deixa de ser um ficheiro à parte e passa a ser **um anexo
-- do próprio cartão**, apontado por `capa_anexo_id`. É o que a Trello faz — a
-- capa aparece na lista de anexos marcada como "Capa" — e resolve de graça o
-- problema que a versão anterior tinha de resolver à mão: apagar o anexo
-- limpava a capa? Agora limpa, porque é o `on delete set null` a fazê-lo. Não
-- há objetos órfãos no R2 nem capas a apontar para ficheiros que já não
-- existem, e o URL assinado é servido pela rota dos anexos, que já existe.
--
-- QUEM LHE MEXE continua a ser quem gere o quadro, pela mesma razão da
-- migração anterior: a capa é identidade visual do quadro, não conteúdo do
-- cartão. E continua a ser verdade na base de dados — as colunas novas nascem
-- fora do GRANT de UPDATE de `cards`, que foi reescrito coluna a coluna em
-- 20260728180000 e não as inclui.

-- ---------------------------------------------------------------------------
-- Fora o que era
-- ---------------------------------------------------------------------------

drop function if exists public.definir_imagem_cartao(uuid, text);

alter table public.cards drop column if exists imagem_destaque;

-- ---------------------------------------------------------------------------
-- As colunas da capa
-- ---------------------------------------------------------------------------

alter table public.cards
  -- Nome de cor da paleta, nunca hexadecimal — a mesma regra das etiquetas e
  -- dos quadros. Mudar a paleta da empresa não obriga a tocar em dados.
  add column capa_cor text
    check (capa_cor in ('verde', 'amarelo', 'laranja', 'vermelho',
                        'roxo', 'azul', 'rosa', 'cinza')),

  add column capa_anexo_id uuid references public.attachments (id) on delete set null,

  -- 'faixa': uma tira no topo, com o título por baixo — é o que deixa o cartão
  -- legível. 'completa': a capa ocupa o cartão todo e o título vai por cima.
  add column capa_tamanho text not null default 'faixa'
    check (capa_tamanho in ('faixa', 'completa')),

  -- Só conta na capa completa, onde há texto por cima da imagem. Fica sempre
  -- gravado para trocar de tamanho não perder a escolha.
  add column capa_texto text not null default 'claro'
    check (capa_texto in ('claro', 'escuro')),

  -- Uma capa é uma cor ou uma imagem. As duas ao mesmo tempo não querem dizer
  -- nada, e a interface teria de escolher uma — mais vale não ser possível.
  add constraint cards_capa_uma_origem check (num_nonnulls(capa_cor, capa_anexo_id) <= 1);

comment on column public.cards.capa_cor is
  'Nome da cor da capa, da paleta das etiquetas. Nulo quando a capa é imagem ou não existe.';
comment on column public.cards.capa_anexo_id is
  'O anexo do cartão que serve de capa. A nulo automaticamente se o anexo for apagado.';
comment on column public.cards.capa_tamanho is
  'faixa = tira no topo com o título por baixo; completa = capa no cartão todo com o título por cima.';
comment on column public.cards.capa_texto is
  'Cor do título por cima de uma capa completa. Só conta nesse caso.';

-- A capa some quando o anexo é apagado, e isso é uma consulta por anexo.
create index cards_capa_anexo_idx on public.cards (capa_anexo_id)
  where capa_anexo_id is not null;

-- ---------------------------------------------------------------------------
-- O único caminho para as colunas
-- ---------------------------------------------------------------------------

/*
  Recebe o estado completo da capa, e não uma alteração de cada vez: quem
  chama manda o que quer que a capa passe a ser, e o que não mandar fica ao
  que a coluna tem por omissão. Trocar a cor por uma imagem é assim uma
  operação só, em vez de duas escritas com um estado inválido pelo meio.

  Tudo a nulo é "tirar a capa".
*/
create or replace function public.definir_capa_cartao(
  p_cartao uuid,
  p_cor text default null,
  p_anexo uuid default null,
  p_tamanho text default 'faixa',
  p_texto text default 'claro'
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quadro uuid := public.quadro_do_cartao(p_cartao);
  v_cor text := nullif(trim(coalesce(p_cor, '')), '');
begin
  if v_quadro is null then
    raise exception 'Cartão inexistente.' using errcode = 'no_data_found';
  end if;

  if not public.pode_gerir_quadro(v_quadro) then
    raise exception 'Só quem gere o quadro pode mexer na capa.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_cor is not null and p_anexo is not null then
    raise exception 'Uma capa é uma cor ou uma imagem, não as duas.'
      using errcode = 'check_violation';
  end if;

  /*
    O anexo TEM de ser deste cartão.

    Sem esta guarda, quem gere um quadro punha como capa o anexo de um cartão
    de outro cliente — e a rota que serve os anexos assina o URL a quem
    conseguir ler a linha do anexo, o que passaria a incluir toda a gente que
    vê este cartão. Era uma fuga de ficheiros entre quadros, por uma coluna.
  */
  if p_anexo is not null then
    if not exists (
      select 1 from public.attachments a
      where a.id = p_anexo
        and a.card_id = p_cartao
        and a.caminho_storage is not null
        and a.tipo_mime like 'image/%'
    ) then
      raise exception 'A capa tem de ser um anexo de imagem deste cartão.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.cards
  set capa_cor = v_cor,
      capa_anexo_id = p_anexo,
      capa_tamanho = coalesce(p_tamanho, 'faixa'),
      capa_texto = coalesce(p_texto, 'claro')
  where id = p_cartao;

  return json_build_object(
    'capa_cor', v_cor,
    'capa_anexo_id', p_anexo,
    'capa_tamanho', coalesce(p_tamanho, 'faixa'),
    'capa_texto', coalesce(p_texto, 'claro')
  );
end;
$$;

comment on function public.definir_capa_cartao(uuid, text, uuid, text, text) is
  'Põe, troca ou tira a capa de um cartão. Exclusivo de quem gere o quadro.';

revoke execute on function public.definir_capa_cartao(uuid, text, uuid, text, text)
  from public, anon;
grant execute on function public.definir_capa_cartao(uuid, text, uuid, text, text)
  to authenticated;
