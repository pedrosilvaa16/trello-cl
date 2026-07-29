"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronLeft } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import { avisar } from "@/components/ui/avisos";
import { REDES } from "@/lib/redes/vocabulario";
import type { RedeSocial } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

/**
 * Escolher o portfólio e a conta, depois de a Meta autorizar.
 *
 * Isto abre-se sozinho quando o callback devolve a pessoa ao painel com
 * `?escolher=<rede>` na barra de endereços. É o passo que existe por causa de
 * como uma agência está organizada: a mesma conta de Facebook administra as
 * Páginas de dezenas de clientes, e ligar a primeira que aparecesse punha o
 * Instagram de um cliente no quadro de outro.
 *
 * Dois passos: primeiro o portfólio de negócio do cliente, depois a conta lá
 * dentro. O portfólio corta uma lista de quarenta para uma ou duas.
 */

type Portfolio = { id: string; nome: string };
type Conta = {
  id: string;
  pagina: string;
  nome: string;
  contexto: string | null;
  avatar: string | null;
};

export function EscolherConta({
  rede,
  aoFechar,
}: {
  rede: RedeSocial;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [portfolios, definirPortfolios] = React.useState<Portfolio[] | null>(null);
  const [portfolio, definirPortfolio] = React.useState<Portfolio | null>(null);
  const [contas, definirContas] = React.useState<Conta[] | null>(null);
  const [aviso, definirAviso] = React.useState<string | null>(null);
  const [aLigar, definirALigar] = React.useState<string | null>(null);
  const [erro, definirErro] = React.useState<string | null>(null);

  // Os portfólios, assim que o diálogo abre.
  React.useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const resposta = await fetch("/api/redes/contas");
        const dados = await resposta.json();
        if (cancelado) return;
        if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível continuar.");
        definirPortfolios(dados.portfolios ?? []);
        definirAviso(dados.aviso ?? null);
      } catch (causa) {
        if (!cancelado) definirErro((causa as Error).message);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  async function abrirPortfolio(escolhido: Portfolio) {
    definirPortfolio(escolhido);
    definirContas(null);
    definirAviso(null);

    try {
      const resposta = await fetch(
        `/api/redes/contas?portfolio=${encodeURIComponent(escolhido.id)}`,
      );
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível ler as contas.");
      definirContas(dados.contas ?? []);
      definirAviso(dados.aviso ?? null);
    } catch (causa) {
      definirErro((causa as Error).message);
    }
  }

  async function ligar(conta: Conta) {
    if (!portfolio) return;
    definirALigar(conta.id);

    try {
      const resposta = await fetch("/api/redes/contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conta: conta.id,
          nome: conta.nome,
          avatar: conta.avatar,
          pagina: conta.pagina,
          portfolio: portfolio.id,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível ligar a conta.");

      /*
        A primeira sincronização corre no servidor antes desta resposta chegar,
        e pode ter trazido avisos — uma conta com menos de cem seguidores não
        tem demografia, por exemplo. Vale a pena dizê-lo já, em vez de deixar a
        pessoa a estranhar um bloco vazio.
      */
      const avisos: string[] = dados.sincronizacao?.avisos ?? [];
      avisar.feito(
        `${REDES[rede].nome} ligado a ${conta.nome}.`,
        avisos.length
          ? avisos[0]
          : "Os números dos últimos 30 dias já estão no painel.",
      );

      aoFechar();
      router.refresh();
    } catch (causa) {
      definirALigar(null);
      avisar.falhou("Não foi possível ligar a conta.", (causa as Error).message);
    }
  }

  const aCarregar = portfolio ? contas === null : portfolios === null;

  return (
    <Dialogo open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <CaixaDialogo
        titulo={
          portfolio
            ? `Que conta de ${REDES[rede].nome} é deste cliente?`
            : "De que cliente é este quadro?"
        }
        descricao={
          portfolio
            ? "Escolhe a conta. É esta que vai alimentar o painel deste quadro."
            : "Escolhe o portfólio de negócio do cliente. Só vamos ler o que está lá dentro."
        }
        larguraMaxima="max-w-lg"
      >
        {erro && (
          <p className="mb-4 rounded-md border border-borda bg-[var(--cor-perigo-tenue)] p-3 text-sm text-texto">
            {erro}
          </p>
        )}

        {aCarregar && !erro && (
          <p className="py-6 text-center text-sm text-texto-suave">
            A ler o que a Meta autorizou…
          </p>
        )}

        {aviso && (
          <p className="mb-3 rounded-md border border-borda bg-[var(--cor-aviso-tenue)] p-3 text-sm text-texto">
            {aviso}
          </p>
        )}

        {/* Passo 1 — o portfólio */}
        {!portfolio && portfolios && portfolios.length > 0 && (
          <ul className="space-y-1.5">
            {portfolios.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => abrirPortfolio(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border border-borda p-3 text-left",
                    "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
                  )}
                >
                  <Building2 className="size-4 shrink-0 text-texto-tenue" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-texto">
                    {item.nome}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Passo 2 — a conta */}
        {portfolio && contas && (
          <>
            <button
              type="button"
              onClick={() => {
                definirPortfolio(null);
                definirContas(null);
                definirAviso(null);
              }}
              className="mb-3 flex items-center gap-1 text-[13px] text-texto-suave hover:text-texto"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              {portfolio.nome}
            </button>

            <ul className="space-y-1.5">
              {contas.map((conta) => (
                <li key={conta.id}>
                  <button
                    type="button"
                    onClick={() => ligar(conta)}
                    disabled={aLigar !== null}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border border-borda p-3 text-left",
                      "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
                      "disabled:opacity-50",
                    )}
                  >
                    {/*
                      A fotografia vem da Meta e o URL dela caduca. Um `img`
                      simples degrada para nada quando falha, que é o certo aqui:
                      o nome já identifica a conta.
                    */}
                    {conta.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={conta.avatar}
                        alt=""
                        className="size-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="size-8 shrink-0 rounded-full bg-superficie-3" />
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-texto">
                        {conta.nome}
                      </span>
                      {conta.contexto && (
                        <span className="block truncate text-xs text-texto-tenue">
                          Página: {conta.contexto}
                        </span>
                      )}
                    </span>

                    {aLigar === conta.id && (
                      <Check className="size-4 shrink-0 text-principal" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </CaixaDialogo>
    </Dialogo>
  );
}
