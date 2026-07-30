"use client";

import { PanelLeft } from "lucide-react";
import * as React from "react";

import { Botao } from "@/components/ui/botao";
import { avisar } from "@/components/ui/avisos";
import type { Perfil } from "@/lib/supabase/tipos";
import {
  estadoInicial,
  reduzirTarefas,
  type AccaoTarefas,
} from "@/lib/tarefas/estado";
import * as escrever from "@/lib/tarefas/mutacoes";
import type { AtualizarTarefa } from "@/lib/tarefas/mutacoes";
import { useTempoRealTarefas } from "@/lib/tarefas/tempo-real";
import type { DadosTarefas, TarefaCompleta } from "@/lib/tarefas/tipos";
import {
  contarPorVista,
  tarefasDaVista,
  TITULOS_VISTA,
  type Vista,
} from "@/lib/tarefas/vistas";
import { cn } from "@/lib/utils";

import { BarraLateral } from "./barra-lateral";
import { DetalheTarefa } from "./detalhe-tarefa";
import { VistaTarefas } from "./vista-tarefas";

/**
 * O separador «Tarefas», inteiro.
 *
 * Três colunas: por onde se escolhe, o que se vê, e o detalhe do que se abriu.
 * Tudo carregado de uma vez pelo servidor e mantido aqui — trocar de vista não
 * vai à rede, e por isso a barra lateral responde à velocidade do clique.
 *
 * As escritas são otimistas: o ecrã muda primeiro e a rede confirma depois. Se
 * o servidor recusar, o estado volta atrás e o aviso diz o que falhou. Numa
 * ferramenta usada o dia inteiro, esperar 200 ms para ver um visto aparecer é
 * a diferença entre uma lista que se usa e uma que se evita.
 */
export function AreaTarefas({
  dados,
  perfil,
  /** O instante do render no servidor, em ISO. Ver `agora`, mais abaixo. */
  agoraInicial,
}: {
  dados: DadosTarefas;
  perfil: Perfil;
  agoraInicial: string;
}) {
  const [estado, despachar] = React.useReducer(
    reduzirTarefas,
    dados,
    estadoInicial,
  );
  useTempoRealTarefas(despachar);

  const [vista, definirVista] = React.useState<Vista>({ tipo: "agenda" });
  const [idAberta, definirIdAberta] = React.useState<string | null>(null);
  const [mostrarConcluidas, definirMostrarConcluidas] = React.useState(false);
  const [barraAberta, definirBarraAberta] = React.useState(false);

  /*
    O relógio que decide os grupos da agenda e a cor dos emblemas.

    Começa no instante que o servidor renderizou, e não em `new Date()`: o
    servidor e o browser desenhariam HTML diferente à volta da meia-noite, e a
    hidratação do React reclamaria — com razão. A partir daí anda de minuto a
    minuto, que é o que faz «hoje, 17:30» ficar vermelho às 17:30 e o que faz a
    agenda virar o dia sem recarregar, num separador que ficou aberto de um dia
    para o outro.

    O primeiro acerto fica para o primeiro minuto de propósito: a página é
    dinâmica e o carimbo do servidor está a menos de um segundo do relógio de
    quem a está a ver. Corrigi-lo já a seguir a montar custava um render
    inteiro a mais para não mudar um único píxel.
  */
  const [agora, definirAgora] = React.useState(() => new Date(agoraInicial));
  React.useEffect(() => {
    const relogio = setInterval(() => definirAgora(new Date()), 60_000);
    return () => clearInterval(relogio);
  }, []);

  const visiveis = React.useMemo(
    () =>
      tarefasDaVista(estado.tarefas, vista, {
        eu: perfil.id,
        mostrarConcluidas,
      }),
    [estado.tarefas, vista, perfil.id, mostrarConcluidas],
  );

  const contagens = React.useMemo(
    () => contarPorVista(estado.tarefas, perfil.id),
    [estado.tarefas, perfil.id],
  );

  const aberta = estado.tarefas.find((t) => t.id === idAberta) ?? null;
  const subtarefas = React.useMemo(
    () =>
      aberta
        ? estado.tarefas
            .filter((t) => t.mae_id === aberta.id)
            .sort((a, b) => a.posicao - b.posicao)
        : [],
    [estado.tarefas, aberta],
  );

  /*
    A lista onde uma tarefa nova aterra.

    Numa vista de lista é essa. Nas outras não há resposta óbvia — e inventar
    uma («a primeira lista do primeiro espaço») punha tarefas em sítios que
    ninguém escolheu. Nessas vistas o campo de criar não é construído, e o
    ecrã vazio manda escolher uma lista à esquerda.
  */
  const listaDeDestino = vista.tipo === "lista" ? vista.id : null;

  /**
   * Escreve primeiro no ecrã, depois na base de dados, e desfaz se falhar.
   *
   * O `reverter` recebe o estado que a tarefa tinha antes — e é por isso que é
   * uma função e não um objeto: o valor tem de ser lido no momento em que a
   * ação começa, e não no momento em que a rede responde.
   */
  const comReversao = React.useCallback(
    async (
      otimista: AccaoTarefas,
      reverter: AccaoTarefas,
      escrita: () => Promise<unknown>,
    ) => {
      despachar(otimista);
      try {
        await escrita();
      } catch (erro) {
        despachar(reverter);
        avisar.falhou(mensagem(erro));
      }
    },
    [],
  );

  const alterarTarefa = React.useCallback(
    (id: string, campos: AtualizarTarefa) => {
      const antes = estado.tarefas.find((t) => t.id === id);
      if (!antes) return;

      // Só os campos que estão a mudar, para a reversão não escrever por cima
      // de alterações que outra pessoa fez entretanto pelo canal.
      const anteriores = Object.fromEntries(
        Object.keys(campos).map((chave) => [
          chave,
          antes[chave as keyof TarefaCompleta],
        ]),
      ) as Partial<TarefaCompleta>;

      void comReversao(
        { tipo: "tarefa:alterar", id, campos: campos as Partial<TarefaCompleta> },
        { tipo: "tarefa:alterar", id, campos: anteriores },
        () => escrever.alterarTarefa(id, campos),
      );
    },
    [estado.tarefas, comReversao],
  );

  const alternarResponsavel = React.useCallback(
    (idTarefa: string, idPessoa: string, ligar: boolean) => {
      void comReversao(
        { tipo: "tarefa:responsavel", tarefa: idTarefa, utilizador: idPessoa, ligar },
        {
          tipo: "tarefa:responsavel",
          tarefa: idTarefa,
          utilizador: idPessoa,
          ligar: !ligar,
        },
        () =>
          ligar
            ? escrever.ligarResponsavel(idTarefa, idPessoa)
            : escrever.desligarResponsavel(idTarefa, idPessoa),
      );
    },
    [comReversao],
  );

  /*
    Criar não é otimista, e é o único sítio onde não é.

    O id vem da base de dados, e uma linha desenhada com um id inventado aqui
    ficaria a apontar para nada mal se clicasse nela. São 100 ms para ganhar
    uma tarefa que se pode abrir logo a seguir.
  */
  const criarTarefa = React.useCallback(
    async (idLista: string, titulo: string, idMae?: string) => {
      try {
        const nova = await escrever.criarTarefa({
          lista_id: idLista,
          titulo,
          criado_por: perfil.id,
          mae_id: idMae ?? null,
        });
        despachar({
          tipo: "tarefa:inserir",
          tarefa: {
            ...nova,
            responsaveis: [],
            nSubtarefas: 0,
            nSubtarefasFeitas: 0,
          },
        });
      } catch (erro) {
        avisar.falhou(mensagem(erro));
      }
    },
    [perfil.id],
  );

  async function arquivarTarefa(id: string) {
    const antes = estado.tarefas.find((t) => t.id === id);
    if (!antes) return;

    despachar({ tipo: "tarefa:remover", id });
    if (idAberta === id) definirIdAberta(null);

    try {
      await escrever.arquivarTarefa(id);
      avisar.comAnular("Tarefa arquivada.", () => {
        void (async () => {
          try {
            await escrever.alterarTarefa(id, { arquivada: false });
            despachar({ tipo: "tarefa:inserir", tarefa: antes });
          } catch (erro) {
            avisar.falhou(mensagem(erro));
          }
        })();
      });
    } catch (erro) {
      despachar({ tipo: "tarefa:inserir", tarefa: antes });
      avisar.falhou(mensagem(erro));
    }
  }

  async function apagarTarefa(id: string) {
    const antes = estado.tarefas.filter((t) => t.id === id || t.mae_id === id);
    despachar({ tipo: "tarefa:remover", id });
    if (idAberta === id) definirIdAberta(null);

    try {
      await escrever.apagarTarefa(id);
    } catch (erro) {
      for (const tarefa of antes) despachar({ tipo: "tarefa:inserir", tarefa });
      avisar.falhou(mensagem(erro));
    }
  }

  /* Espaços e listas: poucos, e mexidos raramente — sem otimismo, com aviso. */
  async function tentar(escrita: () => Promise<unknown>) {
    try {
      await escrita();
    } catch (erro) {
      avisar.falhou(mensagem(erro));
    }
  }

  const listaAberta =
    vista.tipo === "lista"
      ? estado.listas.find((l) => l.id === vista.id)
      : undefined;

  const titulo =
    vista.tipo === "lista"
      ? (listaAberta?.nome ?? "Lista")
      : TITULOS_VISTA[vista.tipo];

  return (
    <div className="flex min-h-0 flex-1">
      {/* ------------------------------------------------------ à esquerda */}
      <BarraLateral
        vista={vista}
        aoMudarVista={(nova) => {
          definirVista(nova);
          definirBarraAberta(false);
        }}
        espacos={estado.espacos}
        listas={estado.listas}
        contagens={contagens}
        aoCriarEspaco={(nome) => tentar(() => escrever.criarEspaco(nome, "cinza"))}
        aoCriarLista={(idEspaco, nome) =>
          tentar(() => escrever.criarListaTarefas(idEspaco, nome))
        }
        aoRenomearEspaco={(id, nome) =>
          tentar(() => escrever.alterarEspaco(id, { nome }))
        }
        aoRenomearLista={(id, nome) =>
          tentar(() => escrever.alterarListaTarefas(id, { nome }))
        }
        aoArquivarEspaco={(id) => tentar(() => escrever.arquivarEspaco(id))}
        aoArquivarLista={(id) => tentar(() => escrever.arquivarListaTarefas(id))}
        className={cn(
          "w-60 shrink-0 border-r border-borda bg-superficie",
          // Em ecrã estreito a barra sai da frente e volta por um botão.
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-xl",
          "max-lg:transition-transform max-lg:duration-[var(--duracao-arrasto)] max-lg:ease-[var(--curva)]",
          !barraAberta && "max-lg:-translate-x-full",
        )}
      />

      {barraAberta && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          aria-label="Fechar as vistas"
          onClick={() => definirBarraAberta(false)}
        />
      )}

      {/* --------------------------------------------------------- ao meio */}
      <main
        id="conteudo"
        className="flex min-w-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="flex items-center gap-2 border-b border-borda px-4 py-2.5">
          <Botao
            variante="fantasma"
            tamanho="icone"
            className="lg:hidden"
            onClick={() => definirBarraAberta(true)}
            aria-label="Ver as vistas e as listas"
          >
            <PanelLeft />
          </Botao>

          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-texto">
            {titulo}
          </h1>

          <label className="flex shrink-0 items-center gap-1.5 text-xs text-texto-suave">
            <input
              type="checkbox"
              checked={mostrarConcluidas}
              onChange={(evento) =>
                definirMostrarConcluidas(evento.target.checked)
              }
              className="size-3.5 accent-[var(--cor-principal)]"
            />
            Mostrar concluídas
          </label>
        </div>

        <VistaTarefas
          vista={vista}
          tarefas={visiveis}
          todas={estado.tarefas}
          listas={estado.listas}
          espacos={estado.espacos}
          equipa={estado.equipa}
          idAberta={idAberta}
          agora={agora}
          aoAbrir={definirIdAberta}
          aoAlternarFeita={(tarefa) =>
            alterarTarefa(tarefa.id, {
              estado: tarefa.estado === "concluida" ? "por_fazer" : "concluida",
            })
          }
          aoCriar={
            listaDeDestino
              ? (titulo) => criarTarefa(listaDeDestino, titulo)
              : null
          }
        />
      </main>

      {/* ------------------------------------------------------- à direita */}
      {aberta && (
        <aside
          aria-label={`Detalhe de ${aberta.titulo}`}
          className={cn(
            "flex flex-col border-l border-borda bg-superficie",
            "xl:w-[26rem] xl:shrink-0",
            // Abaixo de xl não há largura para três colunas: cobre a do meio.
            "max-xl:fixed max-xl:inset-0 max-xl:z-40",
          )}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") definirIdAberta(null);
          }}
        >
          <DetalheTarefa
            tarefa={aberta}
            subtarefas={subtarefas}
            mae={
              aberta.mae_id
                ? estado.tarefas.find((t) => t.id === aberta.mae_id)
                : undefined
            }
            lista={estado.listas.find((l) => l.id === aberta.lista_id)}
            espaco={estado.espacos.find((e) => e.id === aberta.espaco_id)}
            equipa={estado.equipa}
            idPessoa={perfil.id}
            aoFechar={() => definirIdAberta(null)}
            aoAlterarTarefa={alterarTarefa}
            aoAlternarResponsavel={(idPessoa, ligar) =>
              alternarResponsavel(aberta.id, idPessoa, ligar)
            }
            aoCriarSubtarefa={(titulo) =>
              criarTarefa(aberta.lista_id, titulo, aberta.id)
            }
            aoAbrirTarefa={definirIdAberta}
            aoArquivar={() => void arquivarTarefa(aberta.id)}
            aoApagar={() => apagarTarefa(aberta.id)}
          />
        </aside>
      )}
    </div>
  );
}

function mensagem(erro: unknown) {
  return erro instanceof Error
    ? erro.message
    : "Não foi possível guardar a alteração. Tenta outra vez.";
}
