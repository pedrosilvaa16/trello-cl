import { ArrowLeft, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho } from "@/components/cabecalho";
import { PainelPessoas } from "@/components/pessoas/painel-pessoas";
import { Botao } from "@/components/ui/botao";
import { Vazio } from "@/components/ui/vazio";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { PessoaNaLista } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "Pessoas" };

/**
 * O painel de gestão de pessoas.
 *
 * Visível a super_admin e admin, com âmbitos diferentes: o primeiro vê todas
 * as contas, o segundo só quem partilha quadros consigo. Quem decide isso é
 * `listar_pessoas()`, no servidor — esta página não faz o filtro, faz o ecrã.
 */
export default async function PaginaPessoas() {
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();

  const eExterno = perfil.papel_global === "externo";

  // A função rebenta para quem não tem papel para isto. Evita-se a chamada, e
  // não se depende do erro para desenhar o ecrã.
  const { data: pessoas } = eExterno
    ? { data: [] as PessoaNaLista[] }
    : await supabase.rpc("listar_pessoas");

  // Os quadros que quem está a ver pode oferecer num convite. A regra é
  // `pode_gerir_quadro`, e quem a aplica é `quadros_que_giro` — repeti-la aqui
  // com um join a `board_members` deixava de fora o super_admin, que gere todos
  // os quadros sem ser membro de nenhum.
  const { data: quadros } = eExterno
    ? { data: [] }
    : await supabase.rpc("quadros_que_giro");

  return (
    <>
      <Cabecalho perfil={perfil} />

      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        <Botao comoFilho variante="fantasma" tamanho="pequeno" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft /> Os meus quadros
          </Link>
        </Botao>

        {eExterno ? (
          <Vazio
            icone={ShieldOff}
            titulo="Isto é para quem gere pessoas"
            descricao="Só um admin ou um super_admin vê quem tem acesso a quê. Se precisas de dar acesso a alguém, fala com quem gere a plataforma."
          />
        ) : (
          <PainelPessoas
            pessoas={pessoas ?? []}
            quadros={quadros ?? []}
            euProprio={perfil}
          />
        )}
      </main>
    </>
  );
}
