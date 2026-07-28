import { Briefcase } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho } from "@/components/cabecalho";
import { EmblemaData } from "@/components/ui/emblema";
import { estadoData } from "@/lib/datas";
import { Vazio } from "@/components/ui/vazio";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { TrabalhoSolto } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "Os meus trabalhos" };

/**
 * O ecrã de quem tem cartões e não tem quadros.
 *
 * Um freelancer com acesso a cartões soltos não pode abrir o quadro — veria os
 * cartões dos outros clientes. Sem uma página como esta, entrava na plataforma
 * e não via nada. Aqui vê o que lhe foi dado, agrupado por cliente, e abre
 * cada cartão diretamente.
 *
 * O nome do cliente vem de `os_meus_trabalhos()`, que o vai buscar por dentro:
 * a linha do quadro em si continua invisível para quem está aqui.
 */
export default async function PaginaMeusTrabalhos() {
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();

  const { data } = await supabase.rpc("os_meus_trabalhos");
  const porCliente = agrupar(data ?? []);

  return (
    <>
      <Cabecalho perfil={perfil} />

      <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight text-texto">
          Os meus trabalhos
        </h1>
        <p className="mt-1 mb-6 max-w-2xl text-sm text-texto-suave">
          Os cartões a que tens acesso, por cliente. Abre um para ver o que é
          preciso, comentar e entregar.
        </p>

        {porCliente.length === 0 ? (
          <Vazio
            icone={Briefcase}
            titulo="Ainda não há trabalho para ti"
            descricao="Quando alguém te der acesso a um cartão, ele aparece aqui. Se estavas à espera de um e não o vês, pede a quem to prometeu para confirmar o acesso."
          />
        ) : (
          <div className="space-y-6">
            {porCliente.map(([cliente, cartoes]) => (
              <section key={cliente}>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
                  {cliente}
                </h2>

                <ul className="divide-y divide-borda rounded-lg border border-borda">
                  {cartoes.map((cartao) => (
                    <li key={cartao.card_id}>
                      <Link
                        href={`/cartao/${cartao.card_id}`}
                        className={
                          "flex items-center gap-3 px-3 py-2.5 transition-colors " +
                          "duration-[var(--duracao-rapida)] hover:bg-superficie-2 " +
                          "focus-visible:bg-superficie-2 focus-visible:outline-none"
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={
                              "truncate text-sm font-medium text-texto " +
                              (cartao.concluido ? "line-through opacity-60" : "")
                            }
                          >
                            {cartao.titulo}
                          </p>
                          <p className="truncate text-xs text-texto-tenue">
                            {cartao.lista}
                          </p>
                        </div>

                        {(() => {
                          const estado = estadoData(
                            cartao.data_limite,
                            cartao.concluido,
                          );
                          return estado && cartao.data_limite ? (
                            <EmblemaData
                              dataLimite={cartao.data_limite}
                              estado={estado}
                            />
                          ) : null;
                        })()}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/**
 * Agrupa por cliente preservando a ordem que veio da base de dados — ela já
 * ordena por nome de quadro e depois por data-limite, e refazer a ordenação
 * aqui só daria oportunidade de discordarem.
 */
function agrupar(trabalhos: TrabalhoSolto[]): [string, TrabalhoSolto[]][] {
  const grupos = new Map<string, TrabalhoSolto[]>();
  for (const trabalho of trabalhos) {
    if (trabalho.arquivado) continue;
    const atual = grupos.get(trabalho.quadro);
    if (atual) atual.push(trabalho);
    else grupos.set(trabalho.quadro, [trabalho]);
  }
  return [...grupos.entries()];
}
