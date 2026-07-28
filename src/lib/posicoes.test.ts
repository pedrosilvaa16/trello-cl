import { describe, expect, it } from "vitest";

import {
  LIMIAR_FOLGA,
  porPosicao,
  posicaoEntre,
  posicaoNoIndice,
} from "./posicoes";

describe("posicaoEntre", () => {
  it("põe o primeiro item em 1", () => {
    expect(posicaoEntre(null, null)).toBe(1);
  });

  it("no topo, fica uma unidade acima do que era primeiro", () => {
    expect(posicaoEntre(null, 5)).toBe(4);
  });

  it("no fundo, fica uma unidade abaixo do que era último", () => {
    expect(posicaoEntre(5, null)).toBe(6);
  });

  it("entre dois, fica na média", () => {
    expect(posicaoEntre(2, 3)).toBe(2.5);
    expect(posicaoEntre(1, 2)).toBe(1.5);
  });

  it("lida com posições negativas — arrastar para o topo muitas vezes", () => {
    expect(posicaoEntre(null, -3)).toBe(-4);
    expect(posicaoEntre(-4, -3)).toBe(-3.5);
  });
});

describe("posicaoNoIndice", () => {
  const posicoes = [1, 2, 3];

  it("no início", () => {
    expect(posicaoNoIndice(posicoes, 0)).toBe(0);
  });

  it("no meio", () => {
    expect(posicaoNoIndice(posicoes, 1)).toBe(1.5);
    expect(posicaoNoIndice(posicoes, 2)).toBe(2.5);
  });

  it("no fim", () => {
    expect(posicaoNoIndice(posicoes, 3)).toBe(4);
  });

  it("numa lista vazia", () => {
    expect(posicaoNoIndice([], 0)).toBe(1);
  });

  it("aguenta um índice fora dos limites sem devolver NaN", () => {
    expect(posicaoNoIndice(posicoes, 99)).toBe(4);
    expect(posicaoNoIndice(posicoes, -5)).toBe(0);
  });
});

describe("a folga fecha-se por metades", () => {
  it("chega abaixo do limiar ao fim de 14 inserções no mesmo intervalo", () => {
    // O mesmo pior caso que supabase/tests/02_posicoes.sql exercita no servidor:
    // largar sempre entre os dois primeiros parte a folga ao meio de cada vez.
    const anterior = 1;
    let seguinte = 2;
    let voltas = 0;

    while (seguinte - anterior >= LIMIAR_FOLGA) {
      seguinte = posicaoEntre(anterior, seguinte);
      voltas += 1;
      expect(voltas).toBeLessThan(100); // rede de segurança contra ciclo infinito
    }

    expect(voltas).toBe(14);
    // Até aqui, o `numeric` do Postgres e o `number` do JS ainda representam
    // todas as posições sem perder nada.
    expect(seguinte).toBeGreaterThan(anterior);
  });
});

describe("porPosicao", () => {
  it("ordena por posição", () => {
    const itens = [
      { id: "b", posicao: 2 },
      { id: "a", posicao: 1 },
      { id: "c", posicao: 1.5 },
    ];
    expect(itens.slice().sort(porPosicao).map((i) => i.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("desempata pelo id, para a ordem ser estável entre clientes", () => {
    const itens = [
      { id: "zzz", posicao: 1 },
      { id: "aaa", posicao: 1 },
    ];
    expect(itens.slice().sort(porPosicao).map((i) => i.id)).toEqual([
      "aaa",
      "zzz",
    ]);
  });
});
