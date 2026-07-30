"use client";

import { Archive, Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Botao } from "@/components/ui/botao";
import { Area, Campo } from "@/components/ui/campo";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
} from "@/components/ui/menu";
import { corEtiqueta } from "@/lib/cores";
import { dataCompleta } from "@/lib/datas";
import type {
  EspacoTarefas,
  ListaTarefas,
  Perfil,
} from "@/lib/supabase/tipos";
import type { AtualizarTarefa } from "@/lib/tarefas/mutacoes";
import type { TarefaCompleta } from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

import { Documentos } from "./documentos";
import {
  CampoData,
  PontoEstado,
  SeletorEstado,
  SeletorPrioridade,
  SeletorResponsaveis,
} from "./seletores";

/**
 * O painel do detalhe de uma tarefa.
 *
 * Em ecrã largo é a terceira coluna e fica ao lado da lista, para se poder ir
 * de tarefa em tarefa sem abrir e fechar nada. Em ecrã estreito passa a cobrir
 * a lista — é o mesmo componente e a mesma árvore, só com outras classes: duas
 * árvores diferentes davam dois sítios para corrigir cada erro.
 *
 * Não leva `aria-modal`: em ecrã largo não é modal coisa nenhuma, e dizer a um
 * leitor de ecrã que o resto da página desapareceu quando ela está lá ao lado
 * é pior do que não dizer nada.
 */
export function DetalheTarefa({
  tarefa,
  subtarefas,
  mae,
  lista,
  espaco,
  equipa,
  idPessoa,
  aoFechar,
  aoAlterarTarefa,
  aoAlternarResponsavel,
  aoCriarSubtarefa,
  aoAbrirTarefa,
  aoArquivar,
  aoApagar,
}: {
  tarefa: TarefaCompleta;
  subtarefas: TarefaCompleta[];
  mae: TarefaCompleta | undefined;
  lista: ListaTarefas | undefined;
  espaco: EspacoTarefas | undefined;
  equipa: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  /** Quem está a ver — fica como autor dos documentos que anexar. */
  idPessoa: string;
  aoFechar: () => void;
  /*
    Leva o id, e não altera implicitamente a tarefa aberta. As subtarefas são
    alteradas a partir deste mesmo painel, e uma função que só soubesse mexer
    na tarefa aberta fechava a mãe quando se fechasse uma filha — que foi
    exatamente o que aconteceu à primeira escrita disto.
  */
  aoAlterarTarefa: (id: string, campos: AtualizarTarefa) => void;
  aoAlternarResponsavel: (idPessoa: string, ligar: boolean) => void;
  aoCriarSubtarefa: (titulo: string) => Promise<void>;
  aoAbrirTarefa: (id: string) => void;
  aoArquivar: () => void;
  aoApagar: () => void;
}) {
  const confirmacao = useConfirmacao();
  const aoAlterar = React.useCallback(
    (campos: AtualizarTarefa) => aoAlterarTarefa(tarefa.id, campos),
    [aoAlterarTarefa, tarefa.id],
  );

  return (
    <>
      <div className="flex h-full flex-col overflow-y-auto">
        {/* ------------------------------------------------------ cabeçalho */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-borda bg-superficie px-4 py-3">
          <SeletorEstado
            estado={tarefa.estado}
            aoMudar={(estado) => aoAlterar({ estado })}
          />
          <SeletorResponsaveis
            equipa={equipa}
            responsaveis={tarefa.responsaveis}
            aoAlternar={aoAlternarResponsavel}
          />
          <SeletorPrioridade
            prioridade={tarefa.prioridade}
            aoMudar={(prioridade) => aoAlterar({ prioridade })}
          />

          <div className="ml-auto flex items-center gap-1">
            <Menu>
              <AbrirMenu asChild>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Mais opções da tarefa"
                >
                  <span aria-hidden>···</span>
                </Botao>
              </AbrirMenu>
              <ConteudoMenu>
                <ItemMenu onSelect={aoArquivar}>
                  <Archive /> Arquivar tarefa
                </ItemMenu>
                <ItemMenu perigoso onSelect={confirmacao.abrir}>
                  <Trash2 /> Apagar tarefa
                </ItemMenu>
              </ConteudoMenu>
            </Menu>

            <Botao
              variante="fantasma"
              tamanho="icone"
              onClick={aoFechar}
              aria-label="Fechar o detalhe"
            >
              <X />
            </Botao>
          </div>
        </div>

        <div className="flex-1 space-y-5 px-4 py-4">
          {/* ---------------------------------------------------- o título */}
          {mae && (
            <button
              type="button"
              onClick={() => aoAbrirTarefa(mae.id)}
              className="flex max-w-full items-center gap-1.5 text-xs text-texto-suave hover:text-texto"
            >
              <PontoEstado estado={mae.estado} />
              <span className="truncate">Subtarefa de {mae.titulo}</span>
            </button>
          )}

          <TituloEditavel
            key={`${tarefa.id}:${tarefa.titulo}`}
            valor={tarefa.titulo}
            aoGuardar={(titulo) => aoAlterar({ titulo })}
          />

          <p className="flex items-center gap-1.5 text-xs text-texto-tenue">
            {espaco && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: corEtiqueta(espaco.cor) }}
                aria-hidden
              />
            )}
            <span className="truncate">
              {espaco?.nome ?? "Sem espaço"} · {lista?.nome ?? "Sem lista"}
            </span>
          </p>

          {/* ----------------------------------------------------- as datas */}
          <div className="grid grid-cols-2 gap-3">
            <CampoData
              rotulo="Início"
              valor={tarefa.data_inicio}
              aoMudar={(data_inicio) => aoAlterar({ data_inicio })}
            />
            <CampoData
              rotulo="Data-limite"
              valor={tarefa.data_limite}
              aoMudar={(data_limite) => aoAlterar({ data_limite })}
            />
          </div>

          {/* ------------------------------------------------- a descrição */}
          <Descricao
            valor={tarefa.descricao}
            aoGuardar={(descricao) => aoAlterar({ descricao })}
          />

          {/* ------------------------------------------------- subtarefas */}
          {/*
            Uma subtarefa não tem subtarefas — o trigger `tarefas_validar_mae`
            recusa-o na base de dados. Aqui a secção não é construída, para o
            ecrã não oferecer um campo cuja gravação já se sabe que falha.
          */}
          {!tarefa.mae_id && (
            <Subtarefas
              subtarefas={subtarefas}
              aoCriar={aoCriarSubtarefa}
              aoAbrir={aoAbrirTarefa}
              aoAlternarFeita={(id, feita) =>
                aoAlterarTarefa(id, {
                  estado: feita ? "concluida" : "por_fazer",
                })
              }
            />
          )}

          {/* `key`: mudar de tarefa traz uma instância nova, com a lista da
              tarefa certa em vez da anterior enquanto a nova não chega. */}
          <Documentos key={tarefa.id} idTarefa={tarefa.id} idPessoa={idPessoa} />

          <p className="border-t border-borda pt-3 text-xs text-texto-tenue">
            Criada a <time dateTime={tarefa.criado_em}>{dataCompleta(tarefa.criado_em)}</time>
          </p>
        </div>
      </div>

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo="Apagar esta tarefa?"
        descricao={
          tarefa.nSubtarefas > 0
            ? `As ${tarefa.nSubtarefas} subtarefas vão com ela, e isto não se desfaz. Para a tirar da frente sem perder nada, arquiva-a.`
            : "Isto não se desfaz. Para a tirar da frente sem a perder, arquiva-a."
        }
        rotuloAcao="Apagar tarefa"
        perigoso
        aoConfirmar={aoApagar}
      />
    </>
  );
}

/**
 * O título edita-se no sítio. Enter guarda, Escape desiste.
 *
 * Quem monta isto passa-lhe uma `key` com o id e o título, e é essa `key` que
 * faz o rascunho voltar ao valor certo quando se muda de tarefa ou quando
 * outra pessoa renomeia esta — sem nenhum efeito a sincronizar estado com
 * props, que é o caminho que dá renders em cascata. Enquanto se escreve, o
 * título não muda do lado de fora, logo não há remontagem nenhuma a interromper
 * a escrita.
 */
function TituloEditavel({
  valor,
  aoGuardar,
}: {
  valor: string;
  aoGuardar: (valor: string) => void;
}) {
  const [rascunho, definirRascunho] = React.useState(valor);

  function guardar() {
    const limpo = rascunho.trim();
    if (!limpo || limpo === valor) {
      definirRascunho(valor);
      return;
    }
    aoGuardar(limpo);
  }

  return (
    <Campo
      value={rascunho}
      aria-label="Título da tarefa"
      maxLength={200}
      onChange={(evento) => definirRascunho(evento.target.value)}
      onBlur={guardar}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          evento.currentTarget.blur();
        }
        if (evento.key === "Escape") {
          definirRascunho(valor);
          evento.currentTarget.blur();
        }
      }}
      className="h-auto border-transparent bg-transparent px-0 text-lg font-semibold hover:border-transparent focus:border-borda-forte"
    />
  );
}

/**
 * Descrição em markdown simples.
 *
 * Lê-se renderizada e edita-se em bruto, com um clique a trocar de modo — o
 * mesmo que o detalhe do cartão faz. Um editor sempre em bruto obriga toda a
 * gente a ler asteriscos; um editor sempre renderizado esconde onde se escreve.
 */
function Descricao({
  valor,
  aoGuardar,
}: {
  valor: string | null;
  aoGuardar: (valor: string | null) => void;
}) {
  const [aEditar, definirAEditar] = React.useState(false);

  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
        Descrição
        {/*
          O texto renderizado abre-se a clicar em cima — mas um `<div>` com
          `onClick` não é alcançável pelo teclado, e o markdown traz blocos
          (`<p>`, `<ul>`) que não podem viver dentro de um `<button>`. Este
          botão é o caminho de teclado para a mesma coisa, e é o que mantém a
          secção utilizável sem rato.
        */}
        {valor && !aEditar && (
          <button
            type="button"
            onClick={() => definirAEditar(true)}
            className="rounded font-medium text-principal normal-case hover:underline"
          >
            Editar
          </button>
        )}
      </h3>

      {aEditar ? (
        /*
          O rascunho vive dentro do editor, e o editor só existe enquanto se
          edita. É o que dispensa qualquer efeito a copiar a prop para o estado:
          montar já é inicializar. E é também o que garante que uma alteração
          que chegue pelo canal a meio da escrita não apaga o que se está a
          escrever — quem tem o cursor no campo é quem manda nele.
        */
        <EditorDescricao
          valorInicial={valor ?? ""}
          aoGuardar={(texto) => {
            definirAEditar(false);
            if (texto === (valor ?? "")) return;
            aoGuardar(texto || null);
          }}
          aoCancelar={() => definirAEditar(false)}
        />
      ) : valor ? (
        <div
          className={cn(
            "prosa -mx-2 cursor-text rounded-md px-2 py-1",
            "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
          )}
          onClick={() => definirAEditar(true)}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{valor}</ReactMarkdown>
        </div>
      ) : (
        <Botao
          variante="secundario"
          tamanho="pequeno"
          className="w-full justify-start font-normal text-texto-suave"
          onClick={() => definirAEditar(true)}
        >
          Escrever uma descrição…
        </Botao>
      )}
    </section>
  );
}

function EditorDescricao({
  valorInicial,
  aoGuardar,
  aoCancelar,
}: {
  valorInicial: string;
  aoGuardar: (texto: string) => void;
  aoCancelar: () => void;
}) {
  const [rascunho, definirRascunho] = React.useState(valorInicial);

  return (
    <Area
      autoFocus
      value={rascunho}
      aria-label="Descrição da tarefa"
      maxLength={20000}
      onChange={(evento) => definirRascunho(evento.target.value)}
      onBlur={() => aoGuardar(rascunho.trim())}
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          evento.preventDefault();
          aoCancelar();
        }
      }}
      className="min-h-32"
      placeholder="O que é preciso fazer, e o que conta como feito."
    />
  );
}

function Subtarefas({
  subtarefas,
  aoCriar,
  aoAbrir,
  aoAlternarFeita,
}: {
  subtarefas: TarefaCompleta[];
  aoCriar: (titulo: string) => Promise<void>;
  aoAbrir: (id: string) => void;
  aoAlternarFeita: (id: string, feita: boolean) => void;
}) {
  const [titulo, definirTitulo] = React.useState("");
  const [ocupado, definirOcupado] = React.useState(false);

  const feitas = subtarefas.filter((s) => s.estado === "concluida").length;

  async function criar() {
    const limpo = titulo.trim();
    if (!limpo || ocupado) return;
    definirOcupado(true);
    try {
      await aoCriar(limpo);
      definirTitulo("");
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
        Subtarefas
        {subtarefas.length > 0 && (
          <span data-numerico className="font-normal normal-case">
            {feitas} de {subtarefas.length}
          </span>
        )}
      </h3>

      {subtarefas.length > 0 && (
        <ul className="mb-2 space-y-0.5">
          {subtarefas.map((subtarefa) => {
            const feita = subtarefa.estado === "concluida";
            return (
              <li key={subtarefa.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => aoAlternarFeita(subtarefa.id, !feita)}
                  className="flex size-5 shrink-0 items-center justify-center rounded"
                  aria-pressed={feita}
                  aria-label={
                    feita
                      ? `Reabrir "${subtarefa.titulo}"`
                      : `Marcar "${subtarefa.titulo}" como concluída`
                  }
                >
                  <PontoEstado estado={subtarefa.estado} />
                </button>
                <button
                  type="button"
                  onClick={() => aoAbrir(subtarefa.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-sm",
                    "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
                    feita ? "text-texto-tenue line-through" : "text-texto",
                  )}
                >
                  {subtarefa.titulo}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(evento) => {
          evento.preventDefault();
          void criar();
        }}
      >
        <Campo
          value={titulo}
          onChange={(evento) => definirTitulo(evento.target.value)}
          placeholder="Acrescentar uma subtarefa"
          aria-label="Título da subtarefa"
          maxLength={200}
          disabled={ocupado}
          className="h-8 text-[13px]"
        />
        <Botao
          type="submit"
          variante="secundario"
          tamanho="icone"
          ocupado={ocupado}
          disabled={!titulo.trim()}
          aria-label="Acrescentar subtarefa"
        >
          <Plus />
        </Botao>
      </form>
    </section>
  );
}
