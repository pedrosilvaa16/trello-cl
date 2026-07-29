"use client";

import {
  Check,
  Compass,
  Copy,
  Eye,
  Lightbulb,
  MessageSquareQuote,
  PanelRightOpen,
  Sparkles,
  X,
} from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import type { ContextoMontado } from "@/lib/contexto";
import { cn } from "@/lib/utils";

import { EditorDocumento } from "./editor-documento";
import { copiar, PainelContexto } from "./painel-contexto";
import {
  SecaoAprendizagens,
  type Aprendizagem,
} from "./secao-aprendizagens";
import {
  SecaoReferencias,
  type Lista,
  type Referencia,
} from "./secao-referencias";

type Chave = "estrategia" | "voz" | "referencias" | "aprendizagens";

const SUGESTAO_ESTRATEGIA = `Público
  Quem é. Onde está. O que já sabe e o que não sabe.

Tom
  Como falamos com estas pessoas. E como não falamos.

Temas recorrentes
  Os três ou quatro assuntos a que voltamos sempre.

O que nunca dizer
  Palavras, promessas e comparações fora de questão.

Objetivos do trimestre
  O que tem de acontecer até ao fim deste trimestre.`;

const SUGESTAO_VOZ = `Tom
  Formal ou próximo? Trata por tu ou por si?

Vocabulário
  Palavras da casa. Palavras proibidas.

Ritmo
  Frases curtas ou longas? Uma ideia por publicação ou várias?

O que nunca faz
  Exclamações, superlativos, emojis a mais…`;

/**
 * O separador «Estratégia», como área de trabalho.
 *
 * Três colunas: o que há para fazer à esquerda, o trabalho ao centro, e o
 * resultado à direita. Cada uma rola por si — a página não rola, e por isso
 * nunca se perde de vista nem o que falta nem o que sai daqui.
 *
 * É desenhado para o computador de propósito, ao contrário do painel de
 * estatísticas (secção 11 da especificação): as estatísticas são para o
 * cliente abrir no telemóvel, isto é uma ferramenta de trabalho de quem gere
 * a conta, usada ao lado do quadro e horas seguidas. Abaixo de `lg` as colunas
 * empilham, para o ecrã continuar utilizável — mas não é para lá que está
 * desenhado.
 */
export function PainelEstrategia({
  idQuadro,
  nomeQuadro,
  contexto,
  listas,
  referencias,
  aprendizagens,
  montado: montadoInicial,
}: {
  idQuadro: string;
  nomeQuadro: string;
  contexto: {
    estrategia: string;
    vozMarca: string;
    atualizadoEm: string | null;
    autor: string | null;
  };
  listas: Lista[];
  referencias: Referencia[];
  aprendizagens: Aprendizagem[];
  montado: ContextoMontado;
}) {
  const [secao, definirSecao] = React.useState<Chave>("estrategia");
  const [montado, definirMontado] = React.useState(montadoInicial);
  const [aRecarregar, definirARecarregar] = React.useState(false);
  const [contextoAberto, definirContextoAberto] = React.useState(true);

  /*
    A estratégia e a voz gravam-se juntas: `guardar_contexto_quadro` escreve a
    linha inteira, e mandar só uma delas apagaria a outra. Guardá-las aqui é o
    que permite os dois editores serem independentes no ecrã sem se pisarem no
    servidor.
  */
  const documento = React.useRef({
    estrategia: contexto.estrategia,
    vozMarca: contexto.vozMarca,
  });

  /*
    Recarregar o contexto depois de cada gravação é o que faz o painel da
    direita valer a pena: escreve-se à esquerda e vê-se o efeito à direita. Sem
    isto seria uma fotografia do que era verdade ao abrir a página.
  */
  const recarregar = React.useCallback(async () => {
    definirARecarregar(true);
    try {
      const resposta = await fetch(`/api/quadros/${idQuadro}/contexto`);
      if (resposta.ok) definirMontado(await resposta.json());
    } catch {
      // Um contexto desatualizado é melhor do que um aviso a meio do trabalho.
      // O botão de atualizar no painel resolve, e o próximo save tenta outra vez.
    } finally {
      definirARecarregar(false);
    }
  }, [idQuadro]);

  async function gravarDocumento(campos: Partial<typeof documento.current>) {
    documento.current = { ...documento.current, ...campos };
    const resposta = await fetch(`/api/quadros/${idQuadro}/contexto`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(documento.current),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      throw new Error(corpo.erro ?? "Não foi possível guardar.");
    }
    recarregar();
  }

  const guardadoPor =
    contexto.atualizadoEm &&
    `Guardado a ${new Date(contexto.atualizadoEm).toLocaleDateString("pt-PT", {
      day: "numeric",
      month: "short",
    })}${contexto.autor ? ` por ${contexto.autor}` : ""}`;

  const e = montado.estatisticas;
  const semPorque = e.totalReferencias - e.referenciasComPorque;

  const secoes: {
    chave: Chave;
    nome: string;
    icone: typeof Compass;
    feito: boolean;
    contagem?: string;
    alerta?: number;
  }[] = [
    {
      chave: "estrategia",
      nome: "Estratégia",
      icone: Compass,
      feito: e.temEstrategia,
    },
    {
      chave: "voz",
      nome: "Voz da marca",
      icone: MessageSquareQuote,
      feito: e.temVozMarca,
    },
    {
      chave: "referencias",
      nome: "Referências",
      icone: Sparkles,
      feito: e.totalReferencias > 0 && semPorque === 0,
      contagem: `${e.referenciasComPorque}/${e.totalReferencias}`,
      alerta: semPorque,
    },
    {
      chave: "aprendizagens",
      nome: "Aprendizagens",
      icone: Lightbulb,
      feito: e.totalAprendizagens > 0,
      contagem: `${e.totalAprendizagens}`,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* ═══════════════════════════════════════════════════ rail esquerdo */}

      <nav
        aria-label="Secções da estratégia"
        className="shrink-0 border-b border-borda bg-superficie lg:w-56 lg:border-r lg:border-b-0"
      >
        <div className="hidden px-3 py-3 lg:block">
          <p className="truncate text-[11px] tracking-wide text-texto-tenue uppercase">
            Estratégia
          </p>
          <p className="truncate text-sm font-semibold text-texto" title={nomeQuadro}>
            {nomeQuadro}
          </p>
        </div>

        <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:p-2 lg:pt-0">
          {secoes.map((s) => {
            const ativa = secao === s.chave;
            return (
              <li key={s.chave} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => definirSecao(s.chave)}
                  aria-current={ativa ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px]",
                    "transition-colors duration-[var(--duracao-rapida)]",
                    ativa
                      ? "bg-superficie-3 font-medium text-texto"
                      : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                  )}
                >
                  <s.icone className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{s.nome}</span>

                  {/*
                    O estado de cada secção à vista, e sempre. É o que
                    transforma quatro separadores numa lista do que falta —
                    que é a pergunta que se faz ao abrir isto.
                  */}
                  {s.alerta ? (
                    <span
                      className="shrink-0 rounded-full bg-aviso/15 px-1.5 text-[11px] font-medium text-aviso"
                      title={`${s.alerta} sem o porquê preenchido`}
                      data-numerico
                    >
                      {s.contagem}
                    </span>
                  ) : s.feito ? (
                    <Check
                      className="size-3.5 shrink-0 text-sucesso"
                      aria-label="Preenchida"
                    />
                  ) : (
                    <span
                      className="shrink-0 text-[11px] text-texto-tenue"
                      data-numerico
                    >
                      {s.contagem ?? "—"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden border-t border-borda p-3 lg:block">
          <p className="mb-1 text-[11px] tracking-wide text-texto-tenue uppercase">
            Contexto
          </p>
          <p className="text-sm text-texto" data-numerico>
            ~{e.tokensEstimados.toLocaleString("pt-PT")}{" "}
            <span className="text-xs text-texto-tenue">tokens</span>
          </p>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            className="mt-2 w-full"
            onClick={() => copiar(montado.texto)}
          >
            <Copy /> Copiar contexto
          </Botao>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════ área de trabalho */}

      <main className="barra-fina min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-texto">
                {secoes.find((s) => s.chave === secao)?.nome}
              </h1>
              <p className="mt-0.5 text-xs text-texto-suave">
                {DESCRICOES[secao]}
              </p>
            </div>

            {!contextoAberto && (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                className="shrink-0"
                onClick={() => definirContextoAberto(true)}
              >
                <PanelRightOpen /> O que a AI vê
              </Botao>
            )}
          </header>

          {secao === "estrategia" && (
            <EditorDocumento
              id="estrategia"
              rotulo="Documento macro"
              descricao="É o primeiro bloco de tudo o que sair daqui."
              sugestao={SUGESTAO_ESTRATEGIA}
              valorInicial={contexto.estrategia}
              minhas={guardadoPor || null}
              linhas={22}
              aoGuardar={(estrategia) => gravarDocumento({ estrategia })}
            />
          )}

          {secao === "voz" && (
            <VozDaMarca
              idQuadro={idQuadro}
              valorInicial={contexto.vozMarca}
              minhas={guardadoPor || null}
              aoGuardar={(vozMarca) => gravarDocumento({ vozMarca })}
            />
          )}

          {secao === "referencias" && (
            <SecaoReferencias
              idQuadro={idQuadro}
              listas={listas}
              referencias={referencias}
              aoGuardar={recarregar}
            />
          )}

          {secao === "aprendizagens" && (
            <SecaoAprendizagens
              idQuadro={idQuadro}
              iniciais={aprendizagens}
              aoGuardar={recarregar}
            />
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════ painel do contexto */}

      {contextoAberto && (
        <aside
          className={cn(
            "shrink-0 border-t border-borda bg-superficie",
            // Empilhado, o painel do contexto seria uma parede de texto sem
            // fim. Em coluna, ocupa a altura toda que a coluna lhe der.
            "max-h-[60vh] lg:max-h-none lg:w-96 lg:border-t-0 lg:border-l",
          )}
        >
          <PainelContexto
            montado={montado}
            aRecarregar={aRecarregar}
            aoRecarregar={recarregar}
            aoFechar={() => definirContextoAberto(false)}
          />
        </aside>
      )}
    </div>
  );
}

const DESCRICOES: Record<Chave, string> = {
  estrategia: "O que esta marca é, para quem fala e o que nunca diz.",
  voz: "Como esta marca fala. Corrigir uma proposta é mais rápido do que escrever de raiz.",
  referencias:
    "O porquê é o que transforma uma imagem bonita em contexto útil.",
  aprendizagens:
    "O que resultou e o que não resultou. Entra no contexto tal como está escrito.",
};

/* --------------------------------------------------------- voz da marca -- */

function VozDaMarca({
  idQuadro,
  valorInicial,
  minhas,
  aoGuardar,
}: {
  idQuadro: string;
  valorInicial: string;
  minhas: string | null;
  aoGuardar: (valor: string) => Promise<void>;
}) {
  const [proposta, definirProposta] = React.useState<string | null>(null);
  const [aPropor, definirAPropor] = React.useState(false);

  async function propor() {
    definirAPropor(true);
    try {
      const resposta = await fetch(`/api/quadros/${idQuadro}/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarefa: "voz_marca" }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível propor.");
      definirProposta(corpo.resposta);
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível propor.",
      );
    } finally {
      definirAPropor(false);
    }
  }

  return (
    <EditorDocumento
      id="voz-marca"
      rotulo="Como esta marca fala"
      descricao="Tom, vocabulário, ritmo, e o que nunca faz."
      sugestao={SUGESTAO_VOZ}
      valorInicial={valorInicial}
      minhas={minhas}
      linhas={18}
      aoGuardar={aoGuardar}
      extra={
        <div className="mb-3">
          <Botao
            variante="secundario"
            tamanho="pequeno"
            ocupado={aPropor}
            onClick={propor}
          >
            <Sparkles />{" "}
            {aPropor ? "A propor…" : "Propor a partir dos publicados"}
          </Botao>

          {proposta && (
            <div className="mt-3 rounded-md border border-[var(--cor-principal-borda)] bg-[var(--cor-principal-tenue)] p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-texto">
                <Eye className="size-3.5" aria-hidden />
                Proposta — copia para o campo abaixo e corrige o que não soar a
                esta marca.
              </p>
              <pre className="barra-fina max-h-56 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-texto-suave">
                {proposta}
              </pre>
              <div className="mt-2 flex gap-2">
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => copiar(proposta)}
                >
                  <Copy /> Copiar
                </Botao>
                <Botao
                  variante="fantasma"
                  tamanho="pequeno"
                  onClick={() => definirProposta(null)}
                >
                  <X /> Dispensar
                </Botao>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
