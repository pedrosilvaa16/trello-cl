/**
 * Registo de cores.
 *
 * A base de dados guarda o nome da cor ('verde', 'ocre'), nunca o hexadecimal.
 * O valor vive no CSS (globals.css) e é aqui que os dois se encontram — mudar a
 * paleta da empresa não obriga a tocar em dados nenhuns.
 */

export const CORES_ETIQUETA = [
  { nome: "verde", rotulo: "Verde" },
  { nome: "amarelo", rotulo: "Amarelo" },
  { nome: "laranja", rotulo: "Laranja" },
  { nome: "vermelho", rotulo: "Vermelho" },
  { nome: "roxo", rotulo: "Roxo" },
  { nome: "azul", rotulo: "Azul" },
  { nome: "rosa", rotulo: "Rosa" },
  { nome: "cinza", rotulo: "Cinzento" },
] as const;

export type CorEtiqueta = (typeof CORES_ETIQUETA)[number]["nome"];

export function corEtiqueta(cor: string) {
  const conhecida = CORES_ETIQUETA.some((c) => c.nome === cor);
  return `var(--etiqueta-${conhecida ? cor : "cinza"})`;
}

export const CORES_QUADRO = [
  { nome: "ardosia", rotulo: "Ardósia" },
  { nome: "pinho", rotulo: "Pinho" },
  { nome: "ameixa", rotulo: "Ameixa" },
  { nome: "ocre", rotulo: "Ocre" },
  { nome: "tijolo", rotulo: "Tijolo" },
  { nome: "oceano", rotulo: "Oceano" },
] as const;

export type CorQuadro = (typeof CORES_QUADRO)[number]["nome"];

export function corQuadro(cor: string) {
  const conhecida = CORES_QUADRO.some((c) => c.nome === cor);
  return `var(--quadro-${conhecida ? cor : "ardosia"})`;
}
