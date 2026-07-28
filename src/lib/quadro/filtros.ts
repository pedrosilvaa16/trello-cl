import { estadoData } from "../datas";
import type { CartaoCompleto } from "./tipos";

export type FiltroData = "qualquer" | "atrasado" | "hoje" | "semana" | "sem-data";

export type Filtros = {
  texto: string;
  etiquetas: string[];
  membros: string[];
  data: FiltroData;
  /** Por omissão os concluídos ficam à vista; escondê-los é uma escolha. */
  esconderConcluidos: boolean;
};

export const FILTROS_VAZIOS: Filtros = {
  texto: "",
  etiquetas: [],
  membros: [],
  data: "qualquer",
  esconderConcluidos: false,
};

export function contarFiltros(filtros: Filtros) {
  return (
    (filtros.texto.trim() ? 1 : 0) +
    filtros.etiquetas.length +
    filtros.membros.length +
    (filtros.data !== "qualquer" ? 1 : 0) +
    (filtros.esconderConcluidos ? 1 : 0)
  );
}

export function haFiltros(filtros: Filtros) {
  return contarFiltros(filtros) > 0;
}

/** Sem acentos e em minúsculas: procurar "duvida" tem de encontrar "dúvida". */
function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Um cartão passa o filtro?
 *
 * Entre dimensões o critério é E: filtrar por etiqueta *e* por membro devolve
 * os cartões que têm as duas coisas. Dentro da mesma dimensão é OU: escolher
 * duas etiquetas mostra os cartões com qualquer uma delas — é o que se espera
 * de quem carrega numa segunda etiqueta para "ver também aqueles".
 */
export function cartaoPassa(cartao: CartaoCompleto, filtros: Filtros): boolean {
  if (filtros.esconderConcluidos && cartao.concluido) return false;

  if (filtros.texto.trim()) {
    const procura = normalizar(filtros.texto.trim());
    const alvo = normalizar(`${cartao.titulo}\n${cartao.descricao ?? ""}`);
    if (!alvo.includes(procura)) return false;
  }

  if (
    filtros.etiquetas.length &&
    !filtros.etiquetas.some((id) => cartao.etiquetas.includes(id))
  ) {
    return false;
  }

  if (
    filtros.membros.length &&
    !filtros.membros.some((id) => cartao.membros.includes(id))
  ) {
    return false;
  }

  if (filtros.data !== "qualquer") {
    const estado = estadoData(cartao.data_limite, cartao.concluido);

    if (filtros.data === "sem-data" && cartao.data_limite) return false;
    if (filtros.data === "atrasado" && estado !== "atrasado") return false;
    if (filtros.data === "hoje" && estado !== "hoje" && estado !== "atrasado") {
      return false;
    }
    if (filtros.data === "semana") {
      if (!cartao.data_limite || cartao.concluido) return false;
      const limite = new Date(cartao.data_limite).getTime();
      const daquiA7Dias = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (limite > daquiA7Dias) return false;
    }
  }

  return true;
}

export function aplicarFiltros(
  cartoes: CartaoCompleto[],
  filtros: Filtros,
): CartaoCompleto[] {
  if (!haFiltros(filtros)) return cartoes;
  return cartoes.filter((cartao) => cartaoPassa(cartao, filtros));
}

export const ROTULOS_DATA: Record<FiltroData, string> = {
  qualquer: "Qualquer data",
  atrasado: "Atrasados",
  hoje: "Para hoje",
  semana: "Próximos 7 dias",
  "sem-data": "Sem data",
};
