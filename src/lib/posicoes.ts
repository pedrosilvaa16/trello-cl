/**
 * Posições fracionárias, do lado do cliente.
 *
 * A aritmética é a mesma que a de supabase/migrations/20260727090300_posicoes.sql
 * e a mesma que supabase/tests/02_posicoes.sql verifica. Existe em duplicado de
 * propósito: o cliente precisa dela para pintar o cartão no sítio certo antes de
 * a rede responder, e o servidor precisa dela para ser a última palavra.
 */

/** Abaixo disto, o servidor reequilibra a lista. */
export const LIMIAR_FOLGA = 0.0001;

/**
 * Posição entre dois vizinhos.
 * Sem vizinho de cima, `seguinte - 1`; sem o de baixo, `anterior + 1`.
 */
export function posicaoEntre(
  anterior: number | null | undefined,
  seguinte: number | null | undefined,
): number {
  if (anterior == null && seguinte == null) return 1;
  if (anterior == null) return seguinte! - 1;
  if (seguinte == null) return anterior + 1;
  return (anterior + seguinte) / 2;
}

/**
 * Posição para largar um item no índice `destino`.
 *
 * `posicoes` são as posições dos itens que ficam na lista, já ordenadas e já
 * sem o item que está a ser movido — é assim que o dnd-kit vê o mundo durante
 * o arrasto.
 */
export function posicaoNoIndice(posicoes: number[], destino: number): number {
  const indice = Math.max(0, Math.min(destino, posicoes.length));
  return posicaoEntre(
    indice > 0 ? posicoes[indice - 1] : null,
    indice < posicoes.length ? posicoes[indice] : null,
  );
}

/** Ordena por posição, com o id a desempatar para o resultado ser estável. */
export function porPosicao<T extends { posicao: number; id: string }>(
  a: T,
  b: T,
): number {
  return a.posicao - b.posicao || a.id.localeCompare(b.id);
}
