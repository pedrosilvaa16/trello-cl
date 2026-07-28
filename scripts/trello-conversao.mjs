/**
 * Conversão Trello → modelo da casa.
 *
 * Vive à parte do importador para poder ser corrida a seco sobre os dados
 * extraídos, sem tocar na base de dados: é o que `trello-validar.mjs` faz.
 * Uma migração de 1195 cartões não deve descobrir um limite de coluna a meio.
 */

/** 25 MB, como manda a especificação (secção 3.4). */
export const LIMITE_FICHEIRO = 26214400;

/** Limites das colunas, tal como estão na base de dados. */
export const LIMITES = {
  quadroNome: 120,
  quadroDescricao: 2000,
  listaNome: 120,
  cartaoTitulo: 1000,
  cartaoDescricao: 20000,
  etiquetaNome: 60,
  comentarioCorpo: 20000,
  anexoNome: 255,
  autorExterno: 120,
};

/**
 * Os ids da Trello começam pelo instante de criação em hexadecimal. É a única
 * forma de recuperar a data de criação de um cartão — a API não a devolve — e
 * é o que evita que 1195 cartões fiquem todos criados hoje.
 */
export function criadoEm(idTrello) {
  const segundos = parseInt(String(idTrello).slice(0, 8), 16);
  return Number.isFinite(segundos)
    ? new Date(segundos * 1000).toISOString()
    : new Date().toISOString();
}

/*
  A Trello tem 10 cores base com variantes _light/_dark; a casa tem 8. As
  variantes caem para a cor base, e sky/lime encostam a azul/verde. Verificado
  nos dados reais: nenhum quadro fica com duas etiquetas iguais por causa disto.
*/
const CORES = {
  green: "verde",
  lime: "verde",
  yellow: "amarelo",
  orange: "laranja",
  red: "vermelho",
  purple: "roxo",
  blue: "azul",
  sky: "azul",
  pink: "rosa",
  black: "cinza",
};

export const corEtiqueta = (cor) =>
  CORES[String(cor ?? "").replace(/_(light|dark)$/, "")] ?? "cinza";

/*
  Os quadros da Trello usam quase todos imagem de fundo, que aqui não existe.
  A cor sai do id, para ser estável entre corridas em vez de mudar a cada
  importação.
*/
const CORES_QUADRO = ["ardosia", "pinho", "ameixa", "ocre", "tijolo", "oceano"];

export function corQuadro(idTrello) {
  let soma = 0;
  for (const c of String(idTrello)) soma = (soma + c.charCodeAt(0)) % 9973;
  return CORES_QUADRO[soma % CORES_QUADRO.length];
}

// O papel de quadro da Trello para o daqui. `admin` lá é `gestor` cá.
export const PAPEIS = { admin: "gestor", normal: "editor", observer: "leitor" };

/**
 * As checklists entram na descrição como lista de tarefas markdown.
 *
 * A especificação põe checklists fora de âmbito (secção 5) e são 6 em 1195
 * cartões — criar tabelas e interface para isto seria construir uma
 * funcionalidade inteira para seis casos. Em markdown o conteúdo fica todo lá,
 * visível e editável, e o `remark-gfm` já as desenha com caixas.
 */
export function descricaoCompleta(cartao) {
  let texto = (cartao.desc ?? "").trim();

  for (const lista of cartao.checklists ?? []) {
    const itens = [...(lista.checkItems ?? [])].sort((a, b) => a.pos - b.pos);
    if (!itens.length) continue;
    texto += `\n\n## ${lista.name}\n`;
    for (const item of itens) {
      texto += `- [${item.state === "complete" ? "x" : " "}] ${item.name}\n`;
    }
  }

  return texto.trim().slice(0, LIMITES.cartaoDescricao) || null;
}

/** Um anexo vai para o bucket, ou fica como ligação. */
export function vaiParaBucket(anexo) {
  const bytes = anexo.bytes ?? 0;
  return (
    !!anexo.isUpload &&
    bytes > 0 &&
    bytes <= LIMITE_FICHEIRO &&
    (/^image\/(jpeg|png|gif|webp|avif)$/.test(anexo.mimeType ?? "") ||
      anexo.mimeType === "application/pdf")
  );
}

export const nomeSeguro = (nome) =>
  String(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);

/** Corta um texto ao limite da coluna, devolvendo null quando fica vazio. */
export const cortar = (texto, limite) =>
  (String(texto ?? "").trim().slice(0, limite) || null);
