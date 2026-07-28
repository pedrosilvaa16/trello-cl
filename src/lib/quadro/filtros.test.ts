import { describe, expect, it } from "vitest";

import type { CartaoCompleto } from "./tipos";
import {
  aplicarFiltros,
  cartaoPassa,
  contarFiltros,
  FILTROS_VAZIOS,
  type Filtros,
} from "./filtros";

function cartao(dados: Partial<CartaoCompleto> & { id: string }): CartaoCompleto {
  return {
    list_id: "lista-1",
    board_id: "quadro-1",
    titulo: "Sem título",
    descricao: null,
    posicao: 1,
    data_limite: null,
    concluido: false,
    arquivado: false,
    imagem_destaque: null,
    criado_por: null,
    criado_em: "2026-07-01T10:00:00.000Z",
    atualizado_em: "2026-07-01T10:00:00.000Z",
    etiquetas: [],
    membros: [],
    nComentarios: 0,
    nAnexos: 0,
    ...dados,
  };
}

const com = (parcial: Partial<Filtros>): Filtros => ({
  ...FILTROS_VAZIOS,
  ...parcial,
});

describe("sem filtros", () => {
  it("passa tudo, sem sequer percorrer a lista", () => {
    const cartoes = [cartao({ id: "1" }), cartao({ id: "2" })];
    expect(aplicarFiltros(cartoes, FILTROS_VAZIOS)).toBe(cartoes);
  });
});

describe("texto", () => {
  const cartoes = [
    cartao({ id: "1", titulo: "Rever a proposta" }),
    cartao({ id: "2", titulo: "Dúvida sobre o preço" }),
    cartao({ id: "3", titulo: "Outra coisa", descricao: "falta a proposta" }),
  ];

  it("procura no título", () => {
    expect(
      aplicarFiltros(cartoes, com({ texto: "rever" })).map((c) => c.id),
    ).toEqual(["1"]);
  });

  it("procura também na descrição", () => {
    expect(
      aplicarFiltros(cartoes, com({ texto: "proposta" })).map((c) => c.id),
    ).toEqual(["1", "3"]);
  });

  it("ignora acentos nos dois sentidos", () => {
    expect(
      aplicarFiltros(cartoes, com({ texto: "duvida" })).map((c) => c.id),
    ).toEqual(["2"]);
    expect(
      aplicarFiltros(cartoes, com({ texto: "dúvida" })).map((c) => c.id),
    ).toEqual(["2"]);
  });

  it("ignora espaços à volta", () => {
    expect(aplicarFiltros(cartoes, com({ texto: "   " }))).toHaveLength(3);
  });
});

describe("etiquetas e membros", () => {
  const design = "etiqueta-design";
  const bug = "etiqueta-bug";
  const ana = "utilizador-ana";
  const bruno = "utilizador-bruno";

  const cartoes = [
    cartao({ id: "so-design", etiquetas: [design] }),
    cartao({ id: "so-ana", membros: [ana] }),
    cartao({ id: "design-e-ana", etiquetas: [design], membros: [ana] }),
    cartao({ id: "bug-e-bruno", etiquetas: [bug], membros: [bruno] }),
    cartao({ id: "nada" }),
  ];

  it("dentro da mesma dimensão o critério é OU", () => {
    expect(
      aplicarFiltros(cartoes, com({ etiquetas: [design, bug] })).map((c) => c.id),
    ).toEqual(["so-design", "design-e-ana", "bug-e-bruno"]);
  });

  /*
    Critério de aceitação da Fase 3: "filtrar por etiqueta e por membro devolve
    o resultado certo em conjunto". Entre dimensões, o critério é E — só passa
    quem tem as duas coisas.
  */
  it("entre dimensões o critério é E", () => {
    expect(
      aplicarFiltros(cartoes, com({ etiquetas: [design], membros: [ana] })).map(
        (c) => c.id,
      ),
    ).toEqual(["design-e-ana"]);
  });

  it("uma combinação sem interseção não devolve nada", () => {
    expect(
      aplicarFiltros(cartoes, com({ etiquetas: [design], membros: [bruno] })),
    ).toEqual([]);
  });

  it("e continua a ser E com o texto pelo meio", () => {
    const comTitulo = [
      cartao({ id: "certo", titulo: "urgente", etiquetas: [design], membros: [ana] }),
      cartao({ id: "errado", titulo: "calmo", etiquetas: [design], membros: [ana] }),
    ];
    expect(
      aplicarFiltros(
        comTitulo,
        com({ texto: "urgente", etiquetas: [design], membros: [ana] }),
      ).map((c) => c.id),
    ).toEqual(["certo"]);
  });
});

describe("datas", () => {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const daquiATresDias = new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const daquiAUmMes = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const atrasado = cartao({ id: "atrasado", data_limite: ontem });
  const proximo = cartao({ id: "proximo", data_limite: daquiATresDias });
  const distante = cartao({ id: "distante", data_limite: daquiAUmMes });
  const semData = cartao({ id: "sem-data" });
  const feito = cartao({
    id: "feito",
    data_limite: ontem,
    concluido: true,
  });

  const todos = [atrasado, proximo, distante, semData, feito];

  it("atrasados exclui o que já está concluído", () => {
    expect(
      aplicarFiltros(todos, com({ data: "atrasado" })).map((c) => c.id),
    ).toEqual(["atrasado"]);
  });

  it("próximos 7 dias inclui o que já passou do prazo", () => {
    expect(
      aplicarFiltros(todos, com({ data: "semana" })).map((c) => c.id),
    ).toEqual(["atrasado", "proximo"]);
  });

  it("sem data devolve só os que não têm prazo", () => {
    expect(
      aplicarFiltros(todos, com({ data: "sem-data" })).map((c) => c.id),
    ).toEqual(["sem-data"]);
  });

  it("esconder concluídos tira-os de qualquer combinação", () => {
    expect(
      aplicarFiltros(todos, com({ esconderConcluidos: true })).map((c) => c.id),
    ).toEqual(["atrasado", "proximo", "distante", "sem-data"]);
  });
});

describe("contarFiltros", () => {
  it("não conta nada quando está tudo limpo", () => {
    expect(contarFiltros(FILTROS_VAZIOS)).toBe(0);
  });

  it("conta cada etiqueta e cada membro à parte", () => {
    expect(
      contarFiltros(com({ etiquetas: ["a", "b"], membros: ["c"] })),
    ).toBe(3);
  });

  it("conta o texto, a data e os concluídos", () => {
    expect(
      contarFiltros(
        com({ texto: "x", data: "atrasado", esconderConcluidos: true }),
      ),
    ).toBe(3);
  });

  it("um texto só de espaços não conta como filtro", () => {
    expect(contarFiltros(com({ texto: "   " }))).toBe(0);
  });
});

describe("cartaoPassa", () => {
  it("é a mesma regra que aplicarFiltros usa", () => {
    const alvo = cartao({ id: "1", titulo: "Rever", etiquetas: ["e1"] });
    const filtros = com({ texto: "rever", etiquetas: ["e1"] });
    expect(cartaoPassa(alvo, filtros)).toBe(true);
    expect(aplicarFiltros([alvo], filtros)).toEqual([alvo]);
  });
});
