import { describe, expect, it } from "vitest";

import { estadoInicial, reduzirTarefas } from "./estado";
import type { DadosTarefas, TarefaCompleta } from "./tipos";

function tarefa(campos: Partial<TarefaCompleta> = {}): TarefaCompleta {
  return {
    id: campos.id ?? crypto.randomUUID(),
    lista_id: "lista-1",
    espaco_id: "espaco-1",
    mae_id: null,
    titulo: "Uma tarefa",
    descricao: null,
    estado: "por_fazer",
    prioridade: null,
    data_inicio: null,
    data_limite: null,
    posicao: 1,
    arquivada: false,
    criado_por: "pessoa-1",
    criado_em: "2026-07-29T10:00:00.000Z",
    atualizado_em: "2026-07-29T10:00:00.000Z",
    responsaveis: [],
    nSubtarefas: 0,
    nSubtarefasFeitas: 0,
    ...campos,
  };
}

const base: DadosTarefas = {
  espacos: [
    {
      id: "espaco-1",
      nome: "Interno",
      cor: "verde",
      posicao: 1,
      arquivado: false,
      criado_por: null,
      criado_em: "2026-07-29T10:00:00.000Z",
    },
  ],
  listas: [
    {
      id: "lista-1",
      espaco_id: "espaco-1",
      nome: "Tarefas da equipa",
      posicao: 1,
      arquivada: false,
      criado_por: null,
      criado_em: "2026-07-29T10:00:00.000Z",
    },
  ],
  tarefas: [],
  equipa: [],
};

describe("o que chega do canal de tempo real", () => {
  /*
    A regressão que isto guarda deu ecrã branco no browser, e não apareceu em
    teste nenhum antes de lá se ir: o Realtime do Supabase, quando a
    verificação de RLS lhe corre mal, entrega o evento com o registo VAZIO em
    vez de o não entregar. Esse `{}` ia parar ao `sort`, e `porPosicao`
    rebentava a comparar um `id` que não existe — a página inteira caía por
    causa de uma mensagem que devia ter sido ignorada.

    A causa está corrigida na migração 20260730120000. Isto guarda a outra
    metade: nenhuma mensagem vinda de fora pode derrubar o ecrã.
  */
  const vazio = {} as never;

  it("uma tarefa sem id não entra no estado nem rebenta", () => {
    const estado = estadoInicial(base);
    expect(() =>
      reduzirTarefas(estado, { tipo: "tarefa:upsert", tarefa: vazio }),
    ).not.toThrow();
    expect(
      reduzirTarefas(estado, { tipo: "tarefa:upsert", tarefa: vazio }).tarefas,
    ).toHaveLength(0);
  });

  it("nem quando já lá está uma tarefa a sério", () => {
    const estado = estadoInicial({ ...base, tarefas: [tarefa({ id: "t1" })] });
    const depois = reduzirTarefas(estado, {
      tipo: "tarefa:upsert",
      tarefa: vazio,
    });
    expect(depois.tarefas.map((t) => t.id)).toEqual(["t1"]);
  });

  it("o mesmo para inserir, para espaços e para listas", () => {
    const estado = estadoInicial(base);
    expect(
      reduzirTarefas(estado, { tipo: "tarefa:inserir", tarefa: vazio }).tarefas,
    ).toHaveLength(0);
    expect(
      reduzirTarefas(estado, { tipo: "espaco:upsert", espaco: vazio }).espacos,
    ).toHaveLength(1);
    expect(
      reduzirTarefas(estado, { tipo: "lista:upsert", lista: vazio }).listas,
    ).toHaveLength(1);
  });
});

describe("contagens de subtarefas", () => {
  it("uma subtarefa conta na mãe, venha a alteração de onde vier", () => {
    const estado = estadoInicial({
      ...base,
      tarefas: [
        tarefa({ id: "mae" }),
        tarefa({ id: "filha-1", mae_id: "mae" }),
        tarefa({ id: "filha-2", mae_id: "mae", estado: "concluida" }),
      ],
    });

    const mae = estado.tarefas.find((t) => t.id === "mae")!;
    expect(mae.nSubtarefas).toBe(2);
    expect(mae.nSubtarefasFeitas).toBe(1);

    const depois = reduzirTarefas(estado, {
      tipo: "tarefa:alterar",
      id: "filha-1",
      campos: { estado: "concluida" },
    });
    expect(depois.tarefas.find((t) => t.id === "mae")!.nSubtarefasFeitas).toBe(2);
  });

  it("apagar a mãe leva as filhas — como o ON DELETE CASCADE do servidor", () => {
    const estado = estadoInicial({
      ...base,
      tarefas: [
        tarefa({ id: "mae" }),
        tarefa({ id: "filha", mae_id: "mae" }),
        tarefa({ id: "outra" }),
      ],
    });

    const depois = reduzirTarefas(estado, { tipo: "tarefa:remover", id: "mae" });
    expect(depois.tarefas.map((t) => t.id)).toEqual(["outra"]);
  });

  it("um estado sem alterações devolve o mesmo objeto, para o React não redesenhar", () => {
    const estado = estadoInicial({ ...base, tarefas: [tarefa({ id: "t1" })] });
    const depois = reduzirTarefas(estado, {
      tipo: "tarefa:responsavel",
      tarefa: "t1",
      utilizador: "alguem",
      // Tirar um responsável que já não está lá não muda nada.
      ligar: false,
    });
    expect(depois).toBe(estado);
  });
});

describe("apagar um espaço", () => {
  it("leva as listas e as tarefas que viviam lá dentro", () => {
    const estado = estadoInicial({
      ...base,
      tarefas: [tarefa({ id: "t1" }), tarefa({ id: "t2" })],
    });

    const depois = reduzirTarefas(estado, {
      tipo: "espaco:remover",
      id: "espaco-1",
    });
    expect(depois.espacos).toHaveLength(0);
    expect(depois.listas).toHaveLength(0);
    expect(depois.tarefas).toHaveLength(0);
  });
});
