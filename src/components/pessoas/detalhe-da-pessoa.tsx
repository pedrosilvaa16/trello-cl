"use client";

import { CalendarClock, LayoutGrid, ShieldX, SquareKanban, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { Emblema } from "@/components/ui/emblema";
import {
  DESCRICOES_PAPEL,
  DESCRICOES_PAPEL_GLOBAL,
  NOMES_PAPEL,
  NOMES_PAPEL_GLOBAL,
} from "@/lib/quadro/tipos";
import type {
  DetalhePessoa,
  PapelGlobal,
  PapelQuadro,
  Perfil,
} from "@/lib/supabase/tipos";

/**
 * Tudo o que esta pessoa alcança, e o que quem está a ver lhe pode fazer.
 *
 * As ações aparecem conforme o papel de quem vê, mas nenhuma delas depende
 * disso para ser segura: cada uma bate numa rota que volta a verificar tudo no
 * servidor. Esconder um botão é cortesia, não é uma permissão.
 */
export function DetalheDaPessoa({
  detalhe,
  euProprio,
  eSuperAdmin,
}: {
  detalhe: DetalhePessoa;
  euProprio: Perfil;
  eSuperAdmin: boolean;
}) {
  const router = useRouter();
  const { pessoa, quadros, cartoes } = detalhe;
  const [ocupado, definirOcupado] = React.useState(false);
  const confirmacaoRevogar = useConfirmacao();
  const confirmacaoEstado = useConfirmacao();

  const souEu = pessoa.id === euProprio.id;

  async function pedir(caminho: string, opcoes: RequestInit, feito: string) {
    definirOcupado(true);
    try {
      const resposta = await fetch(caminho, {
        headers: { "Content-Type": "application/json" },
        ...opcoes,
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        throw new Error(corpo.erro ?? "Não foi possível concluir a operação.");
      }
      avisar.feito(feito);
      router.refresh();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível concluir.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-start gap-4">
        <Avatar
          perfil={pessoa}
          tamanho="grande"
          className={pessoa.ativo ? undefined : "opacity-40 grayscale"}
        />

        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-texto">
            {pessoa.nome}
            {souEu && (
              <span className="text-sm font-normal text-texto-tenue">(tu)</span>
            )}
            {!pessoa.ativo && <Emblema>Conta desativada</Emblema>}
          </h1>
          <p className="text-sm text-texto-suave">{pessoa.email}</p>
          <p className="mt-1 text-xs text-texto-tenue">
            {pessoa.ultimo_acesso
              ? `Último acesso a ${data(pessoa.ultimo_acesso)}`
              : "Nunca entrou na plataforma"}
            {" · "}
            {`Conta criada a ${data(pessoa.criado_em)}`}
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------ papel global */}

      <section className="mt-6 rounded-lg border border-borda p-4">
        <h2 className="text-sm font-semibold text-texto">Papel no sistema</h2>
        <p className="mt-0.5 mb-3 text-xs text-texto-tenue">
          {DESCRICOES_PAPEL_GLOBAL[pessoa.papel_global]}
        </p>

        {eSuperAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pessoa.papel_global}
              disabled={ocupado}
              aria-label="Papel global"
              onChange={(evento) =>
                pedir(
                  `/api/pessoas/${pessoa.id}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({
                      papelGlobal: evento.target.value as PapelGlobal,
                    }),
                  },
                  "Papel global alterado.",
                )
              }
              className="h-9 rounded-md border border-borda-forte bg-superficie px-2 text-sm text-texto"
            >
              {(Object.keys(NOMES_PAPEL_GLOBAL) as PapelGlobal[]).map((chave) => (
                <option key={chave} value={chave}>
                  {NOMES_PAPEL_GLOBAL[chave]}
                </option>
              ))}
            </select>

            <Botao
              variante={pessoa.ativo ? "secundario" : "principal"}
              disabled={ocupado}
              onClick={confirmacaoEstado.abrir}
            >
              {pessoa.ativo ? "Desativar conta" : "Reativar conta"}
            </Botao>
          </div>
        ) : (
          <Emblema>{NOMES_PAPEL_GLOBAL[pessoa.papel_global]}</Emblema>
        )}
      </section>

      {/* ----------------------------------------------------------- quadros */}

      <section className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-texto">
          Quadros ({quadros.length})
        </h2>

        {quadros.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-sm text-texto-tenue">
            Não é membro de nenhum quadro que possas ver.
          </p>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {quadros.map((quadro) => (
              <li key={quadro.board_id} className="flex items-center gap-3 p-3">
                <LayoutGrid className="size-4 shrink-0 text-texto-tenue" aria-hidden />

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/quadro/${quadro.board_id}`}
                    className="truncate text-sm font-medium text-texto hover:underline"
                  >
                    {quadro.nome}
                  </Link>
                  <p className="text-xs text-texto-tenue">
                    {DESCRICOES_PAPEL[quadro.papel]} Desde {data(quadro.desde)}.
                  </p>
                </div>

                {quadro.posso_gerir && !souEu ? (
                  <>
                    <select
                      value={quadro.papel}
                      disabled={ocupado}
                      aria-label={`Papel em ${quadro.nome}`}
                      onChange={(evento) =>
                        pedir(
                          `/api/quadros/${quadro.board_id}/membros`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              utilizador: pessoa.id,
                              papel: evento.target.value as PapelQuadro,
                            }),
                          },
                          `Papel alterado em «${quadro.nome}».`,
                        )
                      }
                      className="h-8 shrink-0 rounded-md border border-borda-forte bg-superficie px-2 text-[13px] text-texto"
                    >
                      {(Object.keys(NOMES_PAPEL) as PapelQuadro[]).map((papel) => (
                        <option key={papel} value={papel}>
                          {NOMES_PAPEL[papel]}
                        </option>
                      ))}
                    </select>

                    <Botao
                      variante="fantasma"
                      tamanho="iconePequeno"
                      disabled={ocupado}
                      aria-label={`Remover de ${quadro.nome}`}
                      onClick={() =>
                        pedir(
                          `/api/quadros/${quadro.board_id}/membros/${pessoa.id}`,
                          { method: "DELETE" },
                          `Saiu de «${quadro.nome}».`,
                        )
                      }
                    >
                      <X />
                    </Botao>
                  </>
                ) : (
                  <Emblema>{NOMES_PAPEL[quadro.papel]}</Emblema>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------- cartões soltos */}

      <section className="mt-4">
        <h2 className="mb-1 text-sm font-semibold text-texto">
          Cartões concedidos ({cartoes.length})
        </h2>
        <p className="mb-2 text-xs text-texto-tenue">
          Acesso a cartões concretos, sem acesso ao quadro à volta.
        </p>

        {cartoes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-sm text-texto-tenue">
            Nenhum. Para dar um cartão a alguém, abre o cartão no quadro e usa
            «Dar acesso a este cartão».
          </p>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {cartoes.map((cartao) => (
              <li key={cartao.card_id} className="flex items-center gap-3 p-3">
                <SquareKanban className="size-4 shrink-0 text-texto-tenue" aria-hidden />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto">
                    {cartao.titulo}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-texto-tenue">
                    <span>{cartao.quadro}</span>
                    <span aria-hidden>·</span>
                    <span>{NOMES_PAPEL[cartao.papel]}</span>
                    {cartao.concedido_por && (
                      <>
                        <span aria-hidden>·</span>
                        <span>por {cartao.concedido_por}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>{data(cartao.concedido_em)}</span>
                  </p>
                </div>

                {cartao.expira_em && (
                  <Emblema
                    className={
                      cartao.expirado
                        ? "border-perigo/30 text-perigo"
                        : undefined
                    }
                  >
                    <CalendarClock className="mr-1 size-3" aria-hidden />
                    {cartao.expirado ? "Expirou" : "Até"} {data(cartao.expira_em)}
                  </Emblema>
                )}

                {cartao.posso_gerir && (
                  <Botao
                    variante="fantasma"
                    tamanho="iconePequeno"
                    disabled={ocupado}
                    aria-label={`Revogar o acesso a ${cartao.titulo}`}
                    onClick={() =>
                      pedir(
                        `/api/cartoes/${cartao.card_id}/acessos/${pessoa.id}`,
                        { method: "DELETE" },
                        "Acesso revogado.",
                      )
                    }
                  >
                    <X />
                  </Botao>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------- revogar tudo */}

      {!souEu && (quadros.length > 0 || cartoes.length > 0) && (
        <section className="mt-6 rounded-lg border border-perigo/30 bg-perigo/5 p-4">
          <h2 className="text-sm font-semibold text-texto">Revogar tudo</h2>
          <p className="mt-0.5 mb-3 text-xs text-texto-suave">
            Tira a esta pessoa todos os quadros e cartões que estão ao teu
            alcance. Não desativa a conta, e não apaga nada do que ela escreveu.
          </p>
          <Botao variante="perigo" disabled={ocupado} onClick={confirmacaoRevogar.abrir}>
            <ShieldX /> Revogar todos os acessos
          </Botao>
        </section>
      )}

      <Confirmar
        aberto={confirmacaoRevogar.aberto}
        aoMudarAberto={confirmacaoRevogar.definirAberto}
        titulo={`Revogar todos os acessos de ${pessoa.nome}?`}
        descricao="Sai de todos os quadros e perde todos os cartões concedidos que estejam ao teu alcance. Os comentários e o histórico ficam como estão."
        rotuloAcao="Revogar tudo"
        perigoso
        aoConfirmar={() =>
          pedir(
            `/api/pessoas/${pessoa.id}/revogar-tudo`,
            { method: "POST" },
            "Acessos revogados.",
          )
        }
      />

      <Confirmar
        aberto={confirmacaoEstado.aberto}
        aoMudarAberto={confirmacaoEstado.definirAberto}
        titulo={
          pessoa.ativo
            ? `Desativar a conta de ${pessoa.nome}?`
            : `Reativar a conta de ${pessoa.nome}?`
        }
        descricao={
          pessoa.ativo
            ? "Deixa de entrar e de contar como membro em qualquer quadro. O nome continua a aparecer nos comentários e nos cartões — é por isso que as contas se desativam em vez de se apagarem."
            : "Volta a entrar e a contar como membro nos quadros onde ainda está."
        }
        rotuloAcao={pessoa.ativo ? "Desativar conta" : "Reativar conta"}
        perigoso={pessoa.ativo}
        aoConfirmar={() =>
          pedir(
            `/api/pessoas/${pessoa.id}/estado`,
            { method: "PATCH", body: JSON.stringify({ ativo: !pessoa.ativo }) },
            pessoa.ativo ? "Conta desativada." : "Conta reativada.",
          )
        }
      />
    </>
  );
}

function data(valor: string) {
  return new Date(valor).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
