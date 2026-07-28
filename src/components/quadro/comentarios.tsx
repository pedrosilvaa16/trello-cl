"use client";

import { MessageSquare } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { dataCompleta, haQuantoTempo } from "@/lib/datas";
import * as mutar from "@/lib/quadro/mutacoes";
import type { ComentarioComAutor } from "@/lib/quadro/tipos";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Comentario, Perfil } from "@/lib/supabase/tipos";

import { Compositor } from "./compositor";

export function Comentarios({
  idCartao,
  utilizador,
  editavel,
  aoMudarTotal,
}: {
  idCartao: string;
  utilizador: Perfil;
  editavel: boolean;
  aoMudarTotal: (total: number) => void;
}) {
  const [comentarios, definirComentarios] = React.useState<ComentarioComAutor[]>(
    [],
  );
  const [aCarregar, definirACarregar] = React.useState(true);
  const [aEditar, definirAEditar] = React.useState<string | null>(null);

  /*
    Sem reposição de estado no efeito: o painel monta este componente com
    `key={cartao.id}`, por isso mudar de cartão traz uma instância nova, já com
    `aCarregar` a true. `aoMudarTotal` chega estável de lá, e assim pode ser
    dependência do efeito sem o mandar correr a cada render.
  */
  React.useEffect(() => {
    let vivo = true;

    mutar
      .listarComentarios(idCartao)
      .then((lista) => {
        if (!vivo) return;
        definirComentarios(lista);
        aoMudarTotal(lista.length);
      })
      .catch(() => avisar.falhou("Não foi possível ler os comentários."))
      .finally(() => vivo && definirACarregar(false));

    return () => {
      vivo = false;
    };
  }, [idCartao, aoMudarTotal]);

  /*
    Tempo real só deste cartão. O canal morre quando o painel fecha — subscrever
    os comentários do quadro inteiro seria tráfego para conversas que ninguém
    tem à frente.
  */
  React.useEffect(() => {
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`cartao:${idCartao}:comentarios`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `card_id=eq.${idCartao}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const antigo = payload.old as Partial<Comentario>;
            definirComentarios((atuais) => {
              const novos = atuais.filter((c) => c.id !== antigo.id);
              aoMudarTotal(novos.length);
              return novos;
            });
            return;
          }

          const linha = payload.new as Comentario;
          definirComentarios((atuais) => {
            const existente = atuais.find((c) => c.id === linha.id);
            // O autor vem só na consulta com join; num INSERT de outra pessoa
            // ainda não o temos, e é preenchido logo a seguir.
            const novos = existente
              ? atuais.map((c) => (c.id === linha.id ? { ...c, ...linha } : c))
              : [...atuais, { ...linha, autor: null }];
            aoMudarTotal(novos.length);
            return novos;
          });

          if (payload.eventType === "INSERT") {
            const completos = await mutar.listarComentarios(idCartao);
            definirComentarios(completos);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [idCartao, aoMudarTotal]);

  async function publicar(corpo: string) {
    try {
      const novo = await mutar.criarComentario(idCartao, corpo, utilizador.id);
      definirComentarios((atuais) => {
        if (atuais.some((c) => c.id === novo.id)) return atuais;
        const novos = [...atuais, novo];
        aoMudarTotal(novos.length);
        return novos;
      });
    } catch (erro) {
      avisar.falhou(msg(erro));
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
        <MessageSquare className="size-4 text-texto-tenue" aria-hidden />
        Comentários
        {comentarios.length > 0 && (
          <span className="text-texto-tenue" data-numerico>
            {comentarios.length}
          </span>
        )}
      </h3>

      {editavel && (
        <div className="flex gap-2">
          <Avatar perfil={utilizador} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <Compositor
              placeholder="Escrever um comentário…"
              rotuloGuardar="Comentar"
              autoFoco={false}
              continuar
              aoGuardar={publicar}
              aoFechar={() => {}}
            />
          </div>
        </div>
      )}

      {aCarregar ? (
        <p className="text-sm text-texto-tenue">A carregar…</p>
      ) : comentarios.length === 0 ? (
        <p className="text-sm text-texto-tenue">
          Ainda sem comentários. {editavel && "Começa a conversa."}
        </p>
      ) : (
        <ul className="space-y-3">
          {comentarios.map((comentario) => (
            <LinhaComentario
              key={comentario.id}
              comentario={comentario}
              utilizador={utilizador}
              emEdicao={aEditar === comentario.id}
              aoEditar={() => definirAEditar(comentario.id)}
              aoFecharEdicao={() => definirAEditar(null)}
              aoAlterar={(corpo) =>
                definirComentarios((atuais) =>
                  atuais.map((c) =>
                    c.id === comentario.id
                      ? { ...c, corpo, editado_em: new Date().toISOString() }
                      : c,
                  ),
                )
              }
              aoApagar={() =>
                definirComentarios((atuais) => {
                  const novos = atuais.filter((c) => c.id !== comentario.id);
                  aoMudarTotal(novos.length);
                  return novos;
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaComentario({
  comentario,
  utilizador,
  emEdicao,
  aoEditar,
  aoFecharEdicao,
  aoAlterar,
  aoApagar,
}: {
  comentario: ComentarioComAutor;
  utilizador: Perfil;
  emEdicao: boolean;
  aoEditar: () => void;
  aoFecharEdicao: () => void;
  aoAlterar: (corpo: string) => void;
  aoApagar: () => void;
}) {
  const confirmacao = useConfirmacao();
  // Editar e apagar: só os próprios. A regra está na base de dados; aqui é só
  // não mostrar botões que iam dar erro.
  const meu = comentario.autor_id === utilizador.id;
  // `autor_externo` vem da migração da Trello: quem escreveu não tem conta
  // aqui, mas o nome não se perde por isso.
  const autor = comentario.autor ?? {
    id: comentario.autor_id ?? comentario.autor_externo ?? "?",
    nome: comentario.autor_externo ?? "Colaborador removido",
    avatar_url: null,
  };
  const migrado = !comentario.autor && !!comentario.autor_externo;

  async function guardar(corpo: string) {
    const anterior = comentario.corpo;
    aoAlterar(corpo);
    aoFecharEdicao();
    try {
      await mutar.editarComentario(comentario.id, corpo);
    } catch (erro) {
      aoAlterar(anterior);
      avisar.falhou(msg(erro));
    }
  }

  async function apagar() {
    try {
      await mutar.apagarComentario(comentario.id);
      aoApagar();
    } catch (erro) {
      avisar.falhou(msg(erro));
    }
  }

  return (
    <li className="flex gap-2">
      <Avatar perfil={autor} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-texto">{autor.nome}</span>
          <time
            dateTime={comentario.criado_em}
            title={dataCompleta(comentario.criado_em)}
            className="text-xs text-texto-tenue"
          >
            {haQuantoTempo(comentario.criado_em)}
            {comentario.editado_em && " · editado"}
          </time>
          {migrado && (
            <span
              className="rounded border border-borda bg-superficie-2 px-1 text-[10px] text-texto-tenue"
              title="Escrito na Trello por alguém sem conta nesta plataforma"
            >
              migrado
            </span>
          )}
        </p>

        {emEdicao ? (
          <div className="mt-1">
            <Compositor
              valorInicial={comentario.corpo}
              placeholder="Editar o comentário"
              rotuloGuardar="Guardar alterações"
              aoGuardar={guardar}
              aoFechar={aoFecharEdicao}
            />
          </div>
        ) : (
          <>
            <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-texto">
              {comentario.corpo}
            </p>
            {meu && (
              <p className="mt-1 flex gap-3">
                <Botao variante="ligacao" tamanho="pequeno" onClick={aoEditar}>
                  Editar
                </Botao>
                <Botao
                  variante="ligacao"
                  tamanho="pequeno"
                  className="text-texto-tenue"
                  onClick={confirmacao.abrir}
                >
                  Apagar
                </Botao>
              </p>
            )}
          </>
        )}
      </div>

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo="Apagar o comentário?"
        descricao="O comentário desaparece para todos e não há como o recuperar."
        rotuloAcao="Apagar comentário"
        perigoso
        aoConfirmar={apagar}
      />
    </li>
  );
}

function msg(erro: unknown) {
  return erro instanceof Error ? erro.message : "Não foi possível guardar.";
}
