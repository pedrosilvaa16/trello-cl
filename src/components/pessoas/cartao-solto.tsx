"use client";

import { Check } from "lucide-react";
import * as React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Anexos } from "@/components/quadro/anexos";
import { Comentarios } from "@/components/quadro/comentarios";
import { Compositor } from "@/components/quadro/compositor";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { EmblemaData } from "@/components/ui/emblema";
import { estadoData } from "@/lib/datas";
import * as mutar from "@/lib/quadro/mutacoes";
import type { Perfil } from "@/lib/supabase/tipos";

type CartaoIsolado = {
  id: string;
  board_id: string;
  list_id: string;
  titulo: string;
  descricao: string | null;
  data_limite: string | null;
  concluido: boolean;
  arquivado: boolean;
};

/**
 * O cartão como o vê quem não tem o quadro.
 *
 * Deliberadamente mais pequeno do que o painel do quadro: sem etiquetas, sem
 * membros, sem mover de lista. Não é uma versão reduzida por preguiça — é o
 * que sobra depois de tirar tudo o que só faz sentido com o quadro à volta, e
 * tudo o que revelaria os outros cartões do cliente.
 *
 * `podeEditar` e `podeComentar` vêm das mesmas funções que o RLS usa. Servem
 * para desenhar o ecrã; quem recusa a escrita é a base de dados.
 */
export function CartaoSolto({
  cartao,
  utilizador,
  podeEditar,
  podeComentar,
}: {
  cartao: CartaoIsolado;
  utilizador: Perfil;
  podeEditar: boolean;
  podeComentar: boolean;
}) {
  const [descricao, definirDescricao] = React.useState(cartao.descricao ?? "");
  const [aEditar, definirAEditar] = React.useState(false);
  const [concluido, definirConcluido] = React.useState(cartao.concluido);
  const estado = estadoData(cartao.data_limite, concluido);

  async function guardarDescricao(texto: string) {
    const anterior = descricao;
    definirDescricao(texto);
    definirAEditar(false);
    try {
      await mutar.alterarCartao(cartao.id, { descricao: texto || null });
    } catch (erro) {
      // Recuo: o que está no ecrã volta a ser o que está no servidor.
      definirDescricao(anterior);
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível guardar.",
      );
    }
  }

  async function alternarConcluido() {
    const seguinte = !concluido;
    definirConcluido(seguinte);
    try {
      await mutar.alterarCartao(cartao.id, { concluido: seguinte });
    } catch (erro) {
      definirConcluido(!seguinte);
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível guardar.",
      );
    }
  }

  return (
    <article>
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1
            className={
              "text-lg font-semibold tracking-tight text-texto " +
              (concluido ? "line-through opacity-60" : "")
            }
          >
            {cartao.titulo}
          </h1>

          {podeEditar && (
            <Botao
              variante={concluido ? "principal" : "secundario"}
              tamanho="pequeno"
              onClick={alternarConcluido}
            >
              <Check /> {concluido ? "Concluído" : "Marcar como concluído"}
            </Botao>
          )}
        </div>

        {cartao.data_limite && estado && (
          <div className="mt-2">
            <EmblemaData dataLimite={cartao.data_limite} estado={estado} />
          </div>
        )}
      </header>

      <section className="mb-6">
        <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
          Descrição
        </h2>

        {aEditar ? (
          <Compositor
            valorInicial={descricao}
            placeholder="O que é preciso fazer neste cartão?"
            rotuloGuardar="Guardar descrição"
            aoGuardar={guardarDescricao}
            aoFechar={() => definirAEditar(false)}
          />
        ) : descricao ? (
          <div
            className="prosa text-sm text-texto-suave"
            onDoubleClick={() => podeEditar && definirAEditar(true)}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{descricao}</Markdown>
            {podeEditar && (
              <Botao
                variante="ligacao"
                className="mt-2"
                onClick={() => definirAEditar(true)}
              >
                Editar descrição
              </Botao>
            )}
          </div>
        ) : podeEditar ? (
          <Botao variante="ligacao" onClick={() => definirAEditar(true)}>
            Acrescentar uma descrição
          </Botao>
        ) : (
          <p className="text-sm text-texto-tenue">Sem descrição.</p>
        )}
      </section>

      <Anexos
        idCartao={cartao.id}
        utilizador={utilizador}
        editavel={podeEditar}
        aoMudarTotal={() => {}}
      />

      <Comentarios
        idCartao={cartao.id}
        utilizador={utilizador}
        editavel={podeComentar}
        aoMudarTotal={() => {}}
      />
    </article>
  );
}
