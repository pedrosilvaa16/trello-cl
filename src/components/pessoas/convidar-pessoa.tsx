"use client";

import { CheckSquare, Copy, Square, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo, Etiqueta as Rotulo } from "@/components/ui/campo";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import {
  DESCRICOES_PAPEL,
  DESCRICOES_PAPEL_GLOBAL,
  NOMES_PAPEL,
  NOMES_PAPEL_GLOBAL,
} from "@/lib/quadro/tipos";
import type { PapelGlobal, PapelQuadro, QuadroGerido } from "@/lib/supabase/tipos";

/**
 * Convite numa página só: email, papel global e a que quadros dá acesso.
 *
 * O seletor de papel global só aparece a um super_admin — mas escondê-lo não é
 * a permissão. Um admin que force `papelGlobal` no pedido leva com o 403 de
 * `criar_convite`, que é quem manda.
 */
export function ConvidarPessoa({
  aberto,
  aoMudarAberto,
  quadros,
  podeEscolherPapelGlobal,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  quadros: QuadroGerido[];
  podeEscolherPapelGlobal: boolean;
}) {
  const router = useRouter();
  const [email, definirEmail] = React.useState("");
  const [papelGlobal, definirPapelGlobal] = React.useState<PapelGlobal>("externo");
  const [acessos, definirAcessos] = React.useState<Record<string, PapelQuadro>>({});
  const [ocupado, definirOcupado] = React.useState(false);
  const [ligacao, definirLigacao] = React.useState<string | null>(null);

  const escolhidos = Object.keys(acessos).length;
  const todosEscolhidos = quadros.length > 0 && escolhidos === quadros.length;

  function alternarQuadro(id: string) {
    definirAcessos((atuais) => {
      const seguintes = { ...atuais };
      if (id in seguintes) delete seguintes[id];
      else seguintes[id] = "editor";
      return seguintes;
    });
  }

  /**
   * Todos ou nenhum.
   *
   * Quem entra para trabalhar em tudo — um gestor de conta, alguém que rende
   * outra pessoa — entra em dez ou vinte quadros, e marcá-los um a um é onde
   * se falha um sem dar por isso. Os papéis já escolhidos mantêm-se: só se
   * acrescenta o que falta.
   */
  function alternarTodos() {
    definirAcessos((atuais) => {
      if (quadros.every((quadro) => quadro.id in atuais)) return {};

      const seguintes = { ...atuais };
      for (const quadro of quadros) {
        if (!(quadro.id in seguintes)) seguintes[quadro.id] = "editor";
      }
      return seguintes;
    });
  }

  async function convidar(evento: React.FormEvent) {
    evento.preventDefault();
    definirOcupado(true);
    definirLigacao(null);

    try {
      const resposta = await fetch("/api/pessoas/convidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          papelGlobal,
          acessos: Object.entries(acessos).map(([quadro, papel]) => ({
            quadro,
            papel,
          })),
        }),
      });

      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível convidar.");

      definirLigacao(corpo.ligacao);
      definirEmail("");
      definirAcessos({});
      definirPapelGlobal("externo");
      router.refresh();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível convidar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Convidar pessoa"
        descricao="O email, o que pode fazer no sistema e a que quadros entra — tudo de uma vez."
        larguraMaxima="max-w-lg"
      >
        <form onSubmit={convidar} className="space-y-5">
          <div className="space-y-2">
            <Rotulo htmlFor="convite-email">Email</Rotulo>
            <Campo
              id="convite-email"
              type="email"
              required
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              placeholder="pessoa@empresa.pt"
            />
          </div>

          {podeEscolherPapelGlobal && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-texto">
                Papel no sistema
              </legend>
              {(Object.keys(NOMES_PAPEL_GLOBAL) as PapelGlobal[]).map((chave) => (
                <label
                  key={chave}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-superficie-2"
                >
                  <input
                    type="radio"
                    name="papel-global"
                    value={chave}
                    checked={papelGlobal === chave}
                    onChange={() => definirPapelGlobal(chave)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm text-texto">
                      {NOMES_PAPEL_GLOBAL[chave]}
                    </span>
                    <span className="text-xs text-texto-tenue">
                      {DESCRICOES_PAPEL_GLOBAL[chave]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-texto">
              A que quadros dá acesso
            </legend>

            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-xs text-texto-tenue">
                Só aparecem os quadros que geres. Para dar acesso a um cartão
                solto, convida primeiro e concede o cartão no detalhe da pessoa.
              </p>

              {quadros.length > 1 && (
                <Botao
                  type="button"
                  variante="fantasma"
                  tamanho="pequeno"
                  className="shrink-0"
                  onClick={alternarTodos}
                >
                  {todosEscolhidos ? (
                    <>
                      <Square /> Limpar seleção
                    </>
                  ) : (
                    <>
                      <CheckSquare /> Selecionar todos
                    </>
                  )}
                </Botao>
              )}
            </div>

            {escolhidos > 0 && (
              <p className="mb-2 text-xs text-texto-suave" aria-live="polite">
                {escolhidos === quadros.length
                  ? `Entra em todos os quadros (${quadros.length}).`
                  : `${escolhidos} de ${quadros.length} quadros escolhidos.`}
              </p>
            )}

            {quadros.length === 0 ? (
              <p className="rounded-md border border-dashed border-borda-forte px-3 py-4 text-center text-xs text-texto-tenue">
                Não geres nenhum quadro. A pessoa entra na plataforma sem acesso
                a nada até alguém lho dar.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {quadros.map((quadro) => {
                  const escolhido = quadro.id in acessos;
                  return (
                    <li key={quadro.id} className="flex items-center gap-2">
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-md p-2 hover:bg-superficie-2">
                        <input
                          type="checkbox"
                          checked={escolhido}
                          onChange={() => alternarQuadro(quadro.id)}
                        />
                        <span className="truncate text-sm text-texto">
                          {quadro.nome}
                        </span>
                      </label>

                      {escolhido && (
                        <select
                          value={acessos[quadro.id]}
                          aria-label={`Papel em ${quadro.nome}`}
                          onChange={(evento) =>
                            definirAcessos((atuais) => ({
                              ...atuais,
                              [quadro.id]: evento.target.value as PapelQuadro,
                            }))
                          }
                          className="h-8 shrink-0 rounded-md border border-borda-forte bg-superficie px-2 text-[13px] text-texto"
                        >
                          {(Object.keys(NOMES_PAPEL) as PapelQuadro[]).map((papel) => (
                            <option key={papel} value={papel} title={DESCRICOES_PAPEL[papel]}>
                              {NOMES_PAPEL[papel]}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <Botao type="submit" variante="principal" ocupado={ocupado} className="w-full">
            <UserPlus /> Criar convite
          </Botao>
        </form>

        {ligacao && <LigacaoConvite ligacao={ligacao} />}
      </CaixaDialogo>
    </Dialogo>
  );
}

/**
 * O convite não se envia sozinho.
 *
 * Não há servidor de email ligado, e inventar um "Enviado!" que não aconteceu
 * seria pior do que dizer a verdade: aqui está o link, envia-o tu.
 */
function LigacaoConvite({ ligacao }: { ligacao: string }) {
  return (
    <div className="mt-4 rounded-md border border-[var(--cor-principal-borda)] bg-[var(--cor-principal-tenue)] p-3">
      <p className="text-sm font-medium text-texto">Convite criado.</p>
      <p className="mt-0.5 mb-2 text-xs text-texto-suave">
        Envia este link à pessoa. É válido 7 dias e só pode ser usado uma vez.
      </p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-borda bg-superficie px-2 py-1.5 font-mono text-xs text-texto-suave">
          {ligacao}
        </code>
        <Botao
          variante="secundario"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ligacao);
              avisar.feito("Link copiado.");
            } catch {
              avisar.falhou(
                "O browser não deixou copiar.",
                "Seleciona o link à mão e copia com Ctrl+C.",
              );
            }
          }}
        >
          <Copy /> Copiar
        </Botao>
      </div>
    </div>
  );
}
