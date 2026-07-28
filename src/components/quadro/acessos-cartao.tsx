"use client";

import { KeyRound, X } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo, Etiqueta as Rotulo } from "@/components/ui/campo";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import { Emblema } from "@/components/ui/emblema";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { DESCRICOES_PAPEL, NOMES_PAPEL } from "@/lib/quadro/tipos";
import type { PapelQuadro, Perfil } from "@/lib/supabase/tipos";

type AcessoComPerfil = {
  user_id: string;
  papel: PapelQuadro;
  expira_em: string | null;
  /** Calculado quando a lista é lida, e não a cada render: o relógio é externo. */
  expirado: boolean;
  perfil: Pick<Perfil, "id" | "nome" | "avatar_url">;
};

/**
 * Dar a alguém este cartão, e só este cartão.
 *
 * É o mecanismo por trás do "freelancer": a pessoa não entra no quadro, não vê
 * os outros cartões do cliente, e trabalha aqui. A data de fim é o que faz um
 * trabalho pontual acabar sozinho — vale a pena preenchê-la quase sempre.
 *
 * Só aparece a quem gere o quadro, e a rota volta a confirmar isso.
 */
export function AcessosCartao({
  aberto,
  aoMudarAberto,
  idCartao,
  tituloCartao,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  idCartao: string;
  tituloCartao: string;
}) {
  const [acessos, definirAcessos] = React.useState<AcessoComPerfil[]>([]);
  const [email, definirEmail] = React.useState("");
  const [papel, definirPapel] = React.useState<PapelQuadro>("editor");
  const [expiraEm, definirExpiraEm] = React.useState("");
  const [ocupado, definirOcupado] = React.useState(false);

  const carregar = React.useCallback(
    () =>
      criarClienteNavegador()
        .from("card_access")
        .select(
          "user_id, papel, expira_em, perfil:profiles!inner(id, nome, avatar_url)",
        )
        .eq("card_id", idCartao)
        .then(({ data }) => {
          const agora = Date.now();
          definirAcessos(
            (data ?? []).map((linha) => {
              const acesso = linha as unknown as Omit<AcessoComPerfil, "expirado">;
              return {
                ...acesso,
                expirado:
                  !!acesso.expira_em &&
                  new Date(acesso.expira_em).getTime() < agora,
              };
            }),
          );
        }),
    [idCartao],
  );

  React.useEffect(() => {
    if (!aberto) return;
    carregar();
  }, [aberto, carregar]);

  async function conceder(evento: React.FormEvent) {
    evento.preventDefault();
    definirOcupado(true);

    try {
      // O acesso é dado a uma conta que já existe. Quem ainda não tem conta
      // entra por convite, no painel de pessoas — são dois caminhos diferentes
      // e misturá-los aqui só tornava este ecrã mais difícil de perceber.
      const { data: perfil, error } = await criarClienteNavegador().rpc(
        "perfil_por_email",
        { p_email: email.trim().toLowerCase() },
      );
      if (error) throw new Error("Não foi possível procurar essa pessoa.");
      if (!perfil) {
        throw new Error(
          "Não existe nenhuma conta com esse email. Convida a pessoa primeiro, em Pessoas.",
        );
      }

      const resposta = await fetch(`/api/cartoes/${idCartao}/acessos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utilizador: perfil.id,
          papel,
          // O campo dá uma data; o acesso morre no fim desse dia.
          expiraEm: expiraEm
            ? new Date(`${expiraEm}T23:59:59`).toISOString()
            : null,
        }),
      });

      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        throw new Error(corpo.erro ?? "Não foi possível dar o acesso.");
      }

      avisar.feito(`${perfil.nome} passou a ter acesso a este cartão.`);
      definirEmail("");
      definirExpiraEm("");
      await carregar();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível dar o acesso.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function revogar(acesso: AcessoComPerfil) {
    try {
      const resposta = await fetch(
        `/api/cartoes/${idCartao}/acessos/${acesso.user_id}`,
        { method: "DELETE" },
      );
      if (!resposta.ok) throw new Error();
      definirAcessos((atuais) =>
        atuais.filter((a) => a.user_id !== acesso.user_id),
      );
      avisar.feito(`${acesso.perfil.nome} deixou de ter acesso.`);
    } catch {
      avisar.falhou("Não foi possível revogar o acesso.");
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Acesso a este cartão"
        descricao={`Quem trabalha em «${tituloCartao}» sem entrar no quadro.`}
        larguraMaxima="max-w-lg"
      >
        <form onSubmit={conceder} className="space-y-3">
          <div className="space-y-2">
            <Rotulo htmlFor="acesso-email">Email de quem vai trabalhar</Rotulo>
            <Campo
              id="acesso-email"
              type="email"
              required
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              placeholder="freelancer@exemplo.pt"
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Rotulo htmlFor="acesso-papel">O que pode fazer</Rotulo>
              <select
                id="acesso-papel"
                value={papel}
                onChange={(evento) =>
                  definirPapel(evento.target.value as PapelQuadro)
                }
                className="h-9 rounded-md border border-borda-forte bg-superficie px-2 text-sm text-texto"
              >
                {(["editor", "comentador", "leitor"] as PapelQuadro[]).map((chave) => (
                  <option key={chave} value={chave} title={DESCRICOES_PAPEL[chave]}>
                    {NOMES_PAPEL[chave]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 space-y-2">
              <Rotulo htmlFor="acesso-expira">Até quando (opcional)</Rotulo>
              <Campo
                id="acesso-expira"
                type="date"
                value={expiraEm}
                onChange={(evento) => definirExpiraEm(evento.target.value)}
              />
            </div>

            <Botao type="submit" variante="principal" ocupado={ocupado}>
              <KeyRound /> Dar acesso
            </Botao>
          </div>

          <p className="text-xs text-texto-tenue">
            Sem data, o acesso fica até alguém o revogar. Com data, termina
            sozinho — que é quase sempre o que se quer num trabalho pontual.
          </p>
        </form>

        {acessos.length > 0 && (
          <ul className="mt-5 space-y-1 border-t border-borda pt-4">
            {acessos.map((acesso) => (
              <li
                key={acesso.user_id}
                className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
              >
                <Avatar perfil={acesso.perfil} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto">
                    {acesso.perfil.nome}
                  </p>
                  <p className="text-xs text-texto-tenue">
                    {NOMES_PAPEL[acesso.papel]}
                    {acesso.expira_em
                      ? ` · até ${new Date(acesso.expira_em).toLocaleDateString("pt-PT")}`
                      : " · sem prazo"}
                  </p>
                </div>
                {acesso.expirado && <Emblema>Expirou</Emblema>}
                <Botao
                  variante="fantasma"
                  tamanho="iconePequeno"
                  aria-label={`Revogar o acesso de ${acesso.perfil.nome}`}
                  onClick={() => revogar(acesso)}
                >
                  <X />
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </CaixaDialogo>
    </Dialogo>
  );
}
