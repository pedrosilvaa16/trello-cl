"use client";

import { AlertTriangle, Copy, Mail, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar } from "@/components/ui/confirmar";
import { Emblema } from "@/components/ui/emblema";
import { Vazio } from "@/components/ui/vazio";
import { NOMES_PAPEL, NOMES_PAPEL_GLOBAL } from "@/lib/quadro/tipos";
import type { ConviteNaLista, EstadoConvite } from "@/lib/supabase/tipos";

type Filtro = "por-usar" | "todos";

/**
 * Ver e gerir convites por aceitar.
 *
 * Três coisas que quem gere precisa de saber de relance, e que a lista mostra
 * em vez de esconder: se o email chegou a sair, se o link ainda é válido, e a
 * quê é que o convite dá acesso. Sem isso, a única forma de responder a "ele
 * disse que não recebeu" era criar outro convite às cegas.
 */
export function PainelConvites({
  convites,
  emailConfigurado,
  eSuperAdmin,
}: {
  convites: ConviteNaLista[];
  emailConfigurado: boolean;
  eSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [filtro, definirFiltro] = React.useState<Filtro>("por-usar");
  const [ocupado, definirOcupado] = React.useState<string | null>(null);
  const [aRevogar, definirARevogar] = React.useState<ConviteNaLista | null>(null);

  const visiveis = convites.filter((c) =>
    filtro === "todos" ? true : c.usado_em === null,
  );
  const porUsar = convites.filter((c) => c.usado_em === null).length;

  async function reenviar(convite: ConviteNaLista) {
    definirOcupado(convite.id);
    try {
      const resposta = await fetch(`/api/convites/${convite.id}/reenviar`, {
        method: "POST",
      });
      const corpo = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        // O convite continua válido mesmo quando o envio falha — e a ligação
        // vem na resposta, para haver sempre uma saída.
        if (corpo.ligacao) {
          await copiar(corpo.ligacao);
          avisar.falhou(
            corpo.erro ?? "Não foi possível enviar o email.",
            "Copiei o link para a área de transferência — envia-o à mão.",
          );
        } else {
          avisar.falhou(corpo.erro ?? "Não foi possível reenviar.");
        }
        router.refresh();
        return;
      }

      avisar.feito(`Convite reenviado para ${convite.email}.`);
      router.refresh();
    } catch {
      avisar.falhou("Não foi possível reenviar.");
    } finally {
      definirOcupado(null);
    }
  }

  async function revogar(convite: ConviteNaLista) {
    definirOcupado(convite.id);
    try {
      const resposta = await fetch(`/api/convites/${convite.id}`, {
        method: "DELETE",
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro ?? "Não foi possível revogar.");
      }
      avisar.feito("Convite revogado. O link deixou de funcionar.");
      router.refresh();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível revogar.",
      );
    } finally {
      definirOcupado(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-texto">
            Convites
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-texto-suave">
            Quem foi convidado e ainda não entrou.{" "}
            {eSuperAdmin
              ? "Vês todos os convites da plataforma."
              : "Vês os que criaste e os dos quadros que geres."}
          </p>
        </div>

        <select
          value={filtro}
          aria-label="Que convites mostrar"
          onChange={(evento) => definirFiltro(evento.target.value as Filtro)}
          className="h-9 rounded-md border border-borda-forte bg-superficie px-2 text-sm text-texto"
        >
          <option value="por-usar">Por usar ({porUsar})</option>
          <option value="todos">Todos ({convites.length})</option>
        </select>
      </div>

      {!emailConfigurado && (
        <div
          role="status"
          className="mb-4 flex gap-2.5 rounded-md border border-borda-forte bg-superficie-2 p-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-texto-suave" aria-hidden />
          <div>
            <p className="text-sm font-medium text-texto">
              O envio de email não está configurado.
            </p>
            <p className="mt-0.5 text-xs text-texto-suave">
              Falta a <code className="font-mono">RESEND_API_KEY</code>. Os
              convites continuam a ser criados — só têm de ser enviados à mão,
              copiando o link.
            </p>
          </div>
        </div>
      )}

      {visiveis.length === 0 ? (
        <Vazio
          icone={Mail}
          titulo={
            convites.length === 0
              ? "Ainda não convidaste ninguém"
              : "Não há convites por usar"
          }
          descricao={
            convites.length === 0
              ? "Os convites que criares aparecem aqui, com o estado de cada um e um botão para reenviar."
              : "Está tudo aceite. Muda o filtro para «Todos» para veres o histórico."
          }
        />
      ) : (
        <ul className="divide-y divide-borda rounded-lg border border-borda">
          {visiveis.map((convite) => (
            <li key={convite.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-texto">
                  <span className="truncate">{convite.email}</span>
                  <EmblemaEstado estado={convite.estado} />
                  {convite.papel_global !== "externo" && (
                    <Emblema>{NOMES_PAPEL_GLOBAL[convite.papel_global]}</Emblema>
                  )}
                </p>

                <p className="mt-0.5 text-xs text-texto-tenue">
                  {descrever(convite)}
                </p>

                {convite.acessos.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {convite.acessos.map((acesso, i) => (
                      <Emblema key={i}>
                        {acesso.nome} · {NOMES_PAPEL[acesso.papel]}
                      </Emblema>
                    ))}
                  </p>
                )}
              </div>

              {convite.usado_em === null && (
                <div className="flex shrink-0 gap-1">
                  <Botao
                    variante="fantasma"
                    tamanho="iconePequeno"
                    aria-label={`Copiar o link do convite de ${convite.email}`}
                    onClick={() => copiar(ligacaoDe(convite.token))}
                  >
                    <Copy />
                  </Botao>
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    ocupado={ocupado === convite.id}
                    onClick={() => reenviar(convite)}
                  >
                    <Send />
                    {convite.estado === "expirado" ? "Renovar e enviar" : "Reenviar"}
                  </Botao>
                  <Botao
                    variante="fantasma"
                    tamanho="iconePequeno"
                    aria-label={`Revogar o convite de ${convite.email}`}
                    onClick={() => definirARevogar(convite)}
                  >
                    <X />
                  </Botao>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Confirmar
        aberto={aRevogar !== null}
        aoMudarAberto={(aberto) => !aberto && definirARevogar(null)}
        titulo={`Revogar o convite de ${aRevogar?.email ?? ""}?`}
        descricao="O link deixa de funcionar no mesmo instante. Se a pessoa ainda precisar de entrar, terás de a convidar outra vez."
        rotuloAcao="Revogar convite"
        perigoso
        aoConfirmar={async () => {
          if (aRevogar) await revogar(aRevogar);
          definirARevogar(null);
        }}
      />
    </>
  );
}

function EmblemaEstado({ estado }: { estado: EstadoConvite }) {
  const estilos: Record<EstadoConvite, string> = {
    pendente: "",
    "por-enviar": "border-[var(--cor-principal-borda)] text-principal",
    expirado: "border-perigo/30 text-perigo",
    usado: "",
  };
  const nomes: Record<EstadoConvite, string> = {
    pendente: "Enviado",
    "por-enviar": "Por enviar",
    expirado: "Expirado",
    usado: "Aceite",
  };
  return <Emblema className={estilos[estado]}>{nomes[estado]}</Emblema>;
}

/** Uma linha que diz o essencial: de quem veio, quando, e até quando vale. */
function descrever(convite: ConviteNaLista): string {
  const partes: string[] = [];

  if (convite.autor) partes.push(`Por ${convite.autor}`);

  if (convite.usado_em) {
    partes.push(`aceite a ${data(convite.usado_em)}`);
    return partes.join(" · ");
  }

  if (convite.enviado_em) {
    partes.push(`enviado a ${data(convite.enviado_em)}`);
    if (convite.reenvios > 0) {
      partes.push(
        convite.reenvios === 1 ? "reenviado 1 vez" : `reenviado ${convite.reenvios} vezes`,
      );
    }
  } else {
    partes.push("ainda não foi enviado");
  }

  partes.push(
    convite.estado === "expirado"
      ? `expirou a ${data(convite.expira_em)}`
      : `válido até ${data(convite.expira_em)}`,
  );

  return partes.join(" · ");
}

function ligacaoDe(token: string): string {
  return `${window.location.origin}/convite/${token}`;
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar.feito("Link copiado.");
  } catch {
    avisar.falhou(
      "O browser não deixou copiar.",
      "Seleciona o link à mão e copia com Ctrl+C.",
    );
  }
}

function data(valor: string): string {
  return new Date(valor).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });
}
