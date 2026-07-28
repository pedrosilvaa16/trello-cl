"use client";

import { ArchiveRestore, Trash2 } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import type { AccaoQuadro, EstadoQuadro } from "@/lib/quadro/estado";
import * as mutar from "@/lib/quadro/mutacoes";

/**
 * O arquivo.
 *
 * Arquivar é a alternativa a apagar: tira da vista, guarda tudo. É por isso que
 * este ecrã existe — sem sítio para onde voltar, "arquivar" seria só um nome
 * mais simpático para "perder".
 */
export function Arquivo({
  aberto,
  aoMudarAberto,
  estado,
  editavel,
  despachar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  estado: EstadoQuadro;
  editavel: boolean;
  despachar: React.Dispatch<AccaoQuadro>;
}) {
  const listas = estado.listas.filter((l) => l.arquivada);
  const cartoes = estado.cartoes.filter((c) => c.arquivado);
  const vazio = listas.length === 0 && cartoes.length === 0;

  async function reporLista(id: string) {
    despachar({ tipo: "lista:alterar", id, campos: { arquivada: false } });
    try {
      await mutar.alterarLista(id, { arquivada: false });
    } catch (erro) {
      despachar({ tipo: "lista:alterar", id, campos: { arquivada: true } });
      avisar.falhou(msg(erro));
    }
  }

  async function reporCartao(id: string) {
    despachar({ tipo: "cartao:alterar", id, campos: { arquivado: false } });
    try {
      await mutar.alterarCartao(id, { arquivado: false });
    } catch (erro) {
      despachar({ tipo: "cartao:alterar", id, campos: { arquivado: true } });
      avisar.falhou(msg(erro));
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Arquivo"
        descricao="O que foi arquivado continua aqui, inteiro, pronto a voltar."
        larguraMaxima="max-w-lg"
      >
        {vazio && (
          <p className="py-6 text-center text-sm text-texto-suave">
            Nada arquivado até agora.
          </p>
        )}

        {listas.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
              Listas
            </h3>
            <ul className="space-y-1">
              {listas.map((lista) => (
                <li
                  key={lista.id}
                  className="flex items-center gap-2 rounded-md border border-borda px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-texto">
                    {lista.nome}
                  </span>
                  <span className="text-xs text-texto-tenue" data-numerico>
                    {
                      estado.cartoes.filter((c) => c.list_id === lista.id).length
                    }{" "}
                    cartões
                  </span>
                  {editavel && (
                    <Botao
                      variante="secundario"
                      tamanho="pequeno"
                      onClick={() => reporLista(lista.id)}
                    >
                      <ArchiveRestore /> Repor
                    </Botao>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {cartoes.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
              Cartões
            </h3>
            <ul className="space-y-1">
              {cartoes.map((cartao) => {
                const lista = estado.listas.find((l) => l.id === cartao.list_id);
                return (
                  <li
                    key={cartao.id}
                    className="flex items-center gap-2 rounded-md border border-borda px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-texto">
                        {cartao.titulo}
                      </p>
                      {lista && (
                        <p className="truncate text-xs text-texto-tenue">
                          em {lista.nome}
                          {lista.arquivada && " (lista arquivada)"}
                        </p>
                      )}
                    </div>
                    {editavel && (
                      <>
                        <Botao
                          variante="secundario"
                          tamanho="pequeno"
                          onClick={() => reporCartao(cartao.id)}
                          disabled={lista?.arquivada}
                          title={
                            lista?.arquivada
                              ? "Repõe primeiro a lista onde este cartão estava."
                              : undefined
                          }
                        >
                          <ArchiveRestore /> Repor
                        </Botao>
                        <Botao
                          variante="fantasma"
                          tamanho="iconePequeno"
                          aria-label={`Apagar «${cartao.titulo}» de vez`}
                          onClick={async () => {
                            try {
                              await mutar.apagarCartao(cartao.id);
                              despachar({
                                tipo: "cartao:remover",
                                id: cartao.id,
                              });
                            } catch (erro) {
                              avisar.falhou(msg(erro));
                            }
                          }}
                        >
                          <Trash2 />
                        </Botao>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </CaixaDialogo>
    </Dialogo>
  );
}

function msg(erro: unknown) {
  return erro instanceof Error ? erro.message : "Não foi possível repor.";
}
