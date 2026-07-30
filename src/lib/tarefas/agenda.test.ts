import { describe, expect, it } from "vitest";

import { agruparPorAgenda, baldeDaData, compararTarefas } from "./agenda";
import type { TarefaCompleta } from "./tipos";

/*
  As datas dos testes são todas explícitas e com hora local — nunca `new Date()`
  sem argumentos. Um teste de baldes de calendário que dependa do relógio da
  máquina passa em julho e falha em dezembro, e passa a semana toda menos ao
  domingo, que é justamente o caso que aqui se testa.

  Referência: quarta-feira, 29 de julho de 2026, 15:00.
*/
const QUARTA = new Date(2026, 6, 29, 15, 0);

function em(ano: number, mes: number, dia: number, hora = 12, minuto = 0) {
  return new Date(ano, mes - 1, dia, hora, minuto).toISOString();
}

function tarefa(campos: Partial<TarefaCompleta> = {}): TarefaCompleta {
  return {
    id: crypto.randomUUID(),
    lista_id: "lista",
    espaco_id: "espaco",
    mae_id: null,
    titulo: "Uma tarefa",
    descricao: null,
    estado: "por_fazer",
    prioridade: null,
    data_inicio: null,
    data_limite: null,
    posicao: 1,
    arquivada: false,
    criado_por: null,
    criado_em: em(2026, 7, 1),
    atualizado_em: em(2026, 7, 1),
    responsaveis: [],
    nSubtarefas: 0,
    nSubtarefasFeitas: 0,
    ...campos,
  };
}

describe("baldeDaData", () => {
  it("sem data-limite cai em sem_data", () => {
    expect(baldeDaData(null, QUARTA)).toBe("sem_data");
  });

  it("uma data que não se lê não inventa um balde", () => {
    expect(baldeDaData("nem por sombras", QUARTA)).toBe("sem_data");
  });

  it("ontem é atraso", () => {
    expect(baldeDaData(em(2026, 7, 28), QUARTA)).toBe("atrasado");
  });

  it("hoje é hoje, mesmo já com a hora passada", () => {
    // 09:00 numa quarta-feira vista às 15:00: passou da hora, mas é hoje. Quem
    // diz que passou é o emblema; o grupo responde a que dia é.
    expect(baldeDaData(em(2026, 7, 29, 9), QUARTA)).toBe("hoje");
  });

  it("hoje mais tarde continua a ser hoje", () => {
    expect(baldeDaData(em(2026, 7, 29, 23, 30), QUARTA)).toBe("hoje");
  });

  it("amanhã é esta semana", () => {
    expect(baldeDaData(em(2026, 7, 30), QUARTA)).toBe("esta_semana");
  });

  it("o domingo seguinte ainda é esta semana", () => {
    // 2 de agosto de 2026 é domingo — fim da semana que começou a 27 de julho.
    expect(baldeDaData(em(2026, 8, 2), QUARTA)).toBe("esta_semana");
  });

  it("a semana ganha ao mês quando as duas apanham a mesma data", () => {
    // 2 de agosto já é do mês seguinte, e mesmo assim é "esta semana": dizer
    // "futuros" a uma tarefa de daqui a quatro dias estaria certo pelo
    // calendário e errado por tudo o resto.
    expect(baldeDaData(em(2026, 8, 2), QUARTA)).not.toBe("futuros");
  });

  it("a segunda a seguir já é do mês seguinte, logo futuros", () => {
    expect(baldeDaData(em(2026, 8, 3), QUARTA)).toBe("futuros");
  });

  it("o fim deste mês é este mês", () => {
    // Visto de uma quarta-feira, 1 de julho: dia 31 é depois desta semana e
    // ainda dentro de julho.
    const primeiroDeJulho = new Date(2026, 6, 1, 10, 0);
    expect(baldeDaData(em(2026, 7, 31), primeiroDeJulho)).toBe("este_mes");
  });

  it("o mês a seguir é futuros", () => {
    const primeiroDeJulho = new Date(2026, 6, 1, 10, 0);
    expect(baldeDaData(em(2026, 8, 15), primeiroDeJulho)).toBe("futuros");
  });
});

describe("baldeDaData ao domingo", () => {
  /*
    O caso que obrigou a `fimDaSemanaUtil`. Ao domingo o fim da semana de
    calendário é hoje, e sem cuidado a tarefa de amanhã caía em «Este mês» —
    inútil precisamente no dia em que se planeia a semana que vem.
  */
  const DOMINGO = new Date(2026, 6, 26, 11, 0); // domingo, 26 de julho de 2026

  it("amanhã não cai em este_mes", () => {
    expect(baldeDaData(em(2026, 7, 27), DOMINGO)).toBe("esta_semana");
  });

  it("a semana que vem inteira é esta semana", () => {
    expect(baldeDaData(em(2026, 7, 31), DOMINGO)).toBe("esta_semana");
    expect(baldeDaData(em(2026, 8, 2), DOMINGO)).toBe("esta_semana");
  });

  it("para lá dela volta a ordem normal", () => {
    expect(baldeDaData(em(2026, 8, 3), DOMINGO)).toBe("futuros");
  });

  it("o domingo continua a saber o que é hoje e o que é atraso", () => {
    expect(baldeDaData(em(2026, 7, 26, 8), DOMINGO)).toBe("hoje");
    expect(baldeDaData(em(2026, 7, 25), DOMINGO)).toBe("atrasado");
  });
});

describe("compararTarefas", () => {
  it("a data manda", () => {
    const cedo = tarefa({ data_limite: em(2026, 7, 30, 9) });
    const tarde = tarefa({ data_limite: em(2026, 7, 30, 18) });
    expect(compararTarefas(cedo, tarde)).toBeLessThan(0);
  });

  it("na mesma data, a prioridade desempata", () => {
    const urgente = tarefa({
      data_limite: em(2026, 7, 30, 9),
      prioridade: "urgente",
    });
    const baixa = tarefa({
      data_limite: em(2026, 7, 30, 9),
      prioridade: "baixa",
    });
    expect(compararTarefas(urgente, baixa)).toBeLessThan(0);
  });

  it("sem prioridade vai para trás de quem tem — não é 'baixa', é ninguém decidiu", () => {
    const baixa = tarefa({ prioridade: "baixa" });
    const nenhuma = tarefa({ prioridade: null });
    expect(compararTarefas(baixa, nenhuma)).toBeLessThan(0);
  });

  it("empatado tudo, decide a posição", () => {
    const primeira = tarefa({ posicao: 1 });
    const segunda = tarefa({ posicao: 2 });
    expect(compararTarefas(primeira, segunda)).toBeLessThan(0);
  });
});

describe("agruparPorAgenda", () => {
  it("devolve sempre os seis grupos, mesmo vazios", () => {
    const grupos = agruparPorAgenda([], QUARTA);
    expect(grupos.map((g) => g.balde)).toEqual([
      "atrasado",
      "hoje",
      "esta_semana",
      "este_mes",
      "futuros",
      "sem_data",
    ]);
    expect(grupos.every((g) => g.tarefas.length === 0)).toBe(true);
  });

  it("põe cada tarefa no seu grupo e ordena lá dentro", () => {
    const atrasada = tarefa({ titulo: "Atrasada", data_limite: em(2026, 7, 20) });
    const hojeTarde = tarefa({
      titulo: "Hoje às 18",
      data_limite: em(2026, 7, 29, 18),
    });
    const hojeCedo = tarefa({
      titulo: "Hoje às 9",
      data_limite: em(2026, 7, 29, 9),
    });
    const semData = tarefa({ titulo: "Um dia destes" });

    const grupos = agruparPorAgenda(
      [semData, hojeTarde, atrasada, hojeCedo],
      QUARTA,
    );
    const porBalde = Object.fromEntries(
      grupos.map((g) => [g.balde, g.tarefas.map((t) => t.titulo)]),
    );

    expect(porBalde.atrasado).toEqual(["Atrasada"]);
    expect(porBalde.hoje).toEqual(["Hoje às 9", "Hoje às 18"]);
    expect(porBalde.sem_data).toEqual(["Um dia destes"]);
    expect(porBalde.esta_semana).toEqual([]);
  });

  it("não perde nem duplica tarefas", () => {
    const tarefas = [
      tarefa({ data_limite: em(2026, 7, 20) }),
      tarefa({ data_limite: em(2026, 7, 29) }),
      tarefa({ data_limite: em(2026, 7, 31) }),
      tarefa({ data_limite: em(2026, 9, 1) }),
      tarefa({ data_limite: null }),
    ];

    const grupos = agruparPorAgenda(tarefas, QUARTA);
    const total = grupos.reduce((soma, g) => soma + g.tarefas.length, 0);
    const ids = new Set(grupos.flatMap((g) => g.tarefas.map((t) => t.id)));

    expect(total).toBe(tarefas.length);
    expect(ids.size).toBe(tarefas.length);
  });
});
