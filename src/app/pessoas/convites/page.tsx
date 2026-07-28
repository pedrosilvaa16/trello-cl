import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho } from "@/components/cabecalho";
import { PainelConvites } from "@/components/pessoas/painel-convites";
import { Botao } from "@/components/ui/botao";
import { emailConfigurado } from "@/lib/email";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Convites" };

/**
 * O painel de convites.
 *
 * Aberto a qualquer conta ativa, porque o âmbito não é o papel global: um
 * gestor de quadro convida para o quadro dele mesmo sendo externo, e tem de
 * poder ver o que convidou. Quem não convidou nada vê uma lista vazia — que é
 * a resposta certa, e não um "não tens permissão".
 *
 * `listar_convites()` é que decide o que cada um vê: um super_admin vê todos
 * os convites, toda a gente vê os que criou e os que tocam em quadros que gere.
 */
export default async function PaginaConvites() {
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();

  const { data: convites } = await supabase.rpc("listar_convites");

  return (
    <>
      <Cabecalho perfil={perfil} />

      <main id="conteudo" className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <Botao comoFilho variante="fantasma" tamanho="pequeno" className="mb-4 -ml-2">
          <Link href="/pessoas">
            <ArrowLeft /> Pessoas
          </Link>
        </Botao>

        <PainelConvites
          convites={convites ?? []}
          emailConfigurado={emailConfigurado()}
          eSuperAdmin={perfil.papel_global === "super_admin"}
        />
      </main>
    </>
  );
}
