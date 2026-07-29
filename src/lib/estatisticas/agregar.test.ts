import { describe, expect, it } from "vitest";

import {
  abreviar,
  comSinal,
  crescimento,
  diasDaJanela,
  distribuicao,
  janelas,
  periodoPorChave,
  recuar,
  resumir,
  serie,
  totalDoPeriodo,
  variacao,
  type LinhaDeMetrica,
} from "./agregar";

/**
 * A aritmética do painel.
 *
 * O que estes testes protegem não é código bonito: é a diferença entre mostrar
 * a um cliente que ganhou 23 seguidores e mostrar-lhe que tem 15 mil. Somar uma
 * métrica acumulada é o erro clássico destes painéis, e é o primeiro teste aqui.
 */

const linhas = (entradas: [string, string, number][]): LinhaDeMetrica[] =>
  entradas.map(([dia, metrica, valor]) => ({ dia, metrica, valor }));

describe("janelas", () => {
  it("a janela anterior tem o mesmo comprimento que a atual", () => {
    const { atual, anterior } = janelas("2026-07-30", periodoPorChave("30"));

    expect(atual).toEqual({ de: "2026-07-01", ate: "2026-07-30" });
    expect(anterior).toEqual({ de: "2026-06-01", ate: "2026-06-30" });
    expect(diasDaJanela(atual.de, atual.ate)).toHaveLength(30);
    expect(diasDaJanela(anterior.de, anterior.ate)).toHaveLength(30);
  });

  it("as duas janelas não se sobrepõem nem deixam buraco", () => {
    const { atual, anterior } = janelas("2026-07-30", periodoPorChave("7"));
    expect(recuar(atual.de, 1)).toBe(anterior.ate);
  });

  it("atravessa a mudança de mês e de ano", () => {
    expect(recuar("2026-01-01", 1)).toBe("2025-12-31");
    expect(recuar("2026-03-01", 1)).toBe("2026-02-28");
  });

  it("um período desconhecido cai no de 30 dias, não rebenta", () => {
    expect(periodoPorChave("banana").dias).toBe(30);
    expect(periodoPorChave(undefined).dias).toBe(30);
  });
});

describe("série", () => {
  it("uma métrica acumulada arrasta o último valor pelos dias em falta", () => {
    // Falhou a sincronização a 3 e a 4. A conta não ficou sem seguidores.
    const pontos = serie(
      linhas([
        ["2026-07-01", "seguidores", 500],
        ["2026-07-02", "seguidores", 505],
        ["2026-07-05", "seguidores", 523],
      ]),
      "seguidores",
      "2026-07-01",
      "2026-07-05",
    );

    expect(pontos.map((p) => p.valor)).toEqual([500, 505, 505, 505, 523]);
  });

  it("uma métrica diária deixa zero nos dias em falta", () => {
    const pontos = serie(
      linhas([
        ["2026-07-01", "alcance", 100],
        ["2026-07-03", "alcance", 80],
      ]),
      "alcance",
      "2026-07-01",
      "2026-07-03",
    );

    // Arrastar os 100 para o dia 2 inventava alcance que não houve.
    expect(pontos.map((p) => p.valor)).toEqual([100, 0, 80]);
  });

  it("antes do primeiro valor conhecido, a acumulada fica a zero", () => {
    const pontos = serie(
      linhas([["2026-07-03", "seguidores", 523]]),
      "seguidores",
      "2026-07-01",
      "2026-07-03",
    );

    expect(pontos.map((p) => p.valor)).toEqual([0, 0, 523]);
  });

  it("ignora as outras métricas", () => {
    const pontos = serie(
      linhas([
        ["2026-07-01", "seguidores", 500],
        ["2026-07-01", "alcance", 9999],
      ]),
      "seguidores",
      "2026-07-01",
      "2026-07-01",
    );

    expect(pontos).toEqual([{ dia: "2026-07-01", valor: 500 }]);
  });

  it("devolve um ponto por dia, mesmo sem dados nenhuns", () => {
    expect(serie([], "alcance", "2026-07-01", "2026-07-07")).toHaveLength(7);
  });
});

describe("total do período", () => {
  const pontos = [
    { dia: "2026-07-01", valor: 500 },
    { dia: "2026-07-02", valor: 510 },
    { dia: "2026-07-03", valor: 523 },
  ];

  it("acumulada: é o saldo do último dia, não a soma", () => {
    // O erro clássico: somar dava 1533 seguidores a uma conta que tem 523.
    expect(totalDoPeriodo(pontos, "acumulada")).toBe(523);
  });

  it("diária: é a soma, não o último dia", () => {
    expect(totalDoPeriodo(pontos, "diaria")).toBe(1533);
  });

  it("sem pontos, é zero e não rebenta", () => {
    expect(totalDoPeriodo([], "acumulada")).toBe(0);
    expect(totalDoPeriodo([], "diaria")).toBe(0);
  });
});

describe("crescimento", () => {
  it("é o último menos o primeiro, não o último", () => {
    expect(
      crescimento([
        { dia: "a", valor: 500 },
        { dia: "b", valor: 523 },
      ]),
    ).toBe(23);
  });

  it("conta descidas", () => {
    expect(
      crescimento([
        { dia: "a", valor: 523 },
        { dia: "b", valor: 500 },
      ]),
    ).toBe(-23);
  });

  it("com um ponto só não há crescimento a declarar", () => {
    expect(crescimento([{ dia: "a", valor: 523 }])).toBe(0);
  });
});

describe("variação", () => {
  it("compara com o período anterior", () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(80, 100)).toBe(-20);
  });

  it("cala-se quando o período anterior é zero", () => {
    // Crescer de 0 para 40 não é "mais 100%": é uma conta sem história.
    expect(variacao(40, 0)).toBeNull();
  });

  it("lida com um período anterior negativo sem trocar o sinal", () => {
    // Perdeu 10 antes e ganhou 5 agora: melhorou, e a percentagem tem de o dizer.
    expect(variacao(5, -10)).toBe(150);
  });
});

describe("resumir", () => {
  const dados = linhas([
    // Período anterior: 1 a 5 de julho. Ganhou 8 seguidores.
    ["2026-07-01", "seguidores", 492],
    ["2026-07-05", "seguidores", 500],
    // Período atual: 6 a 10 de julho. Ganhou 23.
    ["2026-07-06", "seguidores", 500],
    ["2026-07-10", "seguidores", 523],
    ["2026-07-06", "alcance", 100],
    ["2026-07-07", "alcance", 150],
    ["2026-07-01", "alcance", 50],
    ["2026-07-02", "alcance", 50],
  ]);

  const atual = { de: "2026-07-06", ate: "2026-07-10" };
  const anterior = { de: "2026-07-01", ate: "2026-07-05" };

  it("uma acumulada compara crescimento com crescimento", () => {
    const resumo = resumir(dados, "seguidores", atual, anterior);

    expect(resumo.valor).toBe(523);
    expect(resumo.crescimento).toBe(23);
    /*
      A comparação que interessa é 23 contra 8 — quase o triplo — e não 523
      contra 500, que dariam uns anémicos 4,6% que não contam história nenhuma.
    */
    expect(resumo.variacao).toBeCloseTo(187.5);
  });

  it("uma diária compara total com total", () => {
    const resumo = resumir(dados, "alcance", atual, anterior);

    expect(resumo.valor).toBe(250);
    expect(resumo.crescimento).toBeNull();
    expect(resumo.variacao).toBeCloseTo(150);
  });

  it("uma métrica fora do vocabulário passa, com um nome legível", () => {
    const resumo = resumir(
      linhas([["2026-07-06", "metrica_nova_da_meta", 7]]),
      "metrica_nova_da_meta",
      atual,
      anterior,
    );

    expect(resumo.nome).toBe("Metrica nova da meta");
    expect(resumo.valor).toBe(7);
  });
});

describe("distribuição", () => {
  const demografia = [
    { dia: "2026-07-10", dimensao: "pais", grupo: "PT", valor: 400 },
    { dia: "2026-07-10", dimensao: "pais", grupo: "BR", valor: 80 },
    { dia: "2026-07-10", dimensao: "pais", grupo: "CH", valor: 20 },
    { dia: "2026-07-10", dimensao: "idade", grupo: "25-34", valor: 45 },
    { dia: "2026-07-10", dimensao: "idade", grupo: "18-24", valor: 15 },
  ];

  it("normaliza para frações do total e ordena por tamanho", () => {
    const fatias = distribuicao(demografia, "pais");

    expect(fatias.map((f) => f.grupo)).toEqual(["PT", "BR", "CH"]);
    expect(fatias[0].fracao).toBeCloseTo(0.8);
    expect(fatias.reduce((s, f) => s + f.fracao, 0)).toBeCloseTo(1);
  });

  it("usa só o retrato mais recente", () => {
    // Somar dois retratos contava o mesmo público duas vezes.
    const fatias = distribuicao(
      [
        { dia: "2026-07-01", dimensao: "pais", grupo: "PT", valor: 999 },
        { dia: "2026-07-10", dimensao: "pais", grupo: "PT", valor: 400 },
      ],
      "pais",
    );

    expect(fatias).toHaveLength(1);
    expect(fatias[0].valor).toBe(400);
  });

  it("respeita uma ordem com significado, em vez de ordenar por tamanho", () => {
    const fatias = distribuicao(demografia, "idade", {
      ordem: ["18-24", "25-34", "35-44"],
    });

    // Os escalões lêem-se do mais novo para o mais velho, mesmo que o 25-34
    // seja maior.
    expect(fatias.map((f) => f.grupo)).toEqual(["18-24", "25-34"]);
  });

  it("junta a cauda em «Outros» sem perder o total", () => {
    const fatias = distribuicao(demografia, "pais", { maximo: 1 });

    expect(fatias.map((f) => f.grupo)).toEqual(["PT", "Outros"]);
    expect(fatias[1].valor).toBe(100);
    // Um anel cujas fatias não somam o todo mente por omissão.
    expect(fatias.reduce((s, f) => s + f.fracao, 0)).toBeCloseTo(1);
  });

  it("uma dimensão sem dados devolve vazio, não rebenta", () => {
    expect(distribuicao(demografia, "cidade")).toEqual([]);
    expect(distribuicao([], "pais")).toEqual([]);
  });

  it("um total a zero devolve vazio em vez de dividir por zero", () => {
    expect(
      distribuicao(
        [{ dia: "2026-07-10", dimensao: "pais", grupo: "PT", valor: 0 }],
        "pais",
      ),
    ).toEqual([]);
  });
});

describe("formatação", () => {
  it("abrevia só o que não cabe num cartão de telemóvel", () => {
    expect(abreviar(523)).toBe("523");
    expect(abreviar(9999)).toBe("9999");
    expect(abreviar(15_400)).toBe("15,4 mil");
    expect(abreviar(2_300_000)).toBe("2,3M");
  });

  it("o sinal do crescimento é metade da informação", () => {
    expect(comSinal(23)).toBe("+23");
    expect(comSinal(-23)).toBe("-23");
    expect(comSinal(0)).toBe("0");
  });
});
