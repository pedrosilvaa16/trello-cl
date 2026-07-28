import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { CartaoSolto } from "@/components/pessoas/cartao-solto";
import { Botao } from "@/components/ui/botao";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Um cartão aberto sozinho, fora do quadro.
 *
 * É a outra metade de "Os meus trabalhos": quem tem acesso ao cartão e não ao
 * quadro precisa de um sítio onde o abrir. Quem tem acesso ao quadro não passa
 * por aqui — vai para o quadro, com o cartão aberto, que é onde o trabalho
 * está em contexto.
 */
async function carregar(id: string) {
  const supabase = await criarClienteServidor();

  // O SELECT é a verificação: o RLS já decide se esta linha existe para quem
  // pergunta. Não há aqui uma segunda regra a poder divergir da primeira.
  const { data: cartao } = await supabase
    .from("cards")
    .select("id, board_id, list_id, titulo, descricao, data_limite, concluido, arquivado")
    .eq("id", id)
    .maybeSingle();

  if (!cartao) return null;

  const [{ data: papelNoQuadro }, { data: podeEditar }, { data: podeComentar }] =
    await Promise.all([
      supabase.rpc("papel_no_quadro", { board_id: cartao.board_id }),
      supabase.rpc("pode_editar_cartao", { p_cartao: id }),
      supabase.rpc("pode_comentar_cartao", { p_cartao: id }),
    ]);

  return { cartao, papelNoQuadro, podeEditar: !!podeEditar, podeComentar: !!podeComentar };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dados = await carregar(id);
  return { title: dados?.cartao.titulo ?? "Cartão" };
}

export default async function PaginaCartao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await exigirPerfil();
  const dados = await carregar(id);

  // Sem acesso e inexistente são indistinguíveis de fora. É o RLS a funcionar.
  if (!dados) notFound();

  // Quem é membro do quadro tem melhor sítio para estar: o cartão em contexto,
  // com as listas à volta. Esta página é para quem não tem esse contexto.
  if (dados.papelNoQuadro) {
    redirect(`/quadro/${dados.cartao.board_id}`);
  }

  return (
    <>
      <Cabecalho perfil={perfil} />

      <main id="conteudo" className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
        <Botao comoFilho variante="fantasma" tamanho="pequeno" className="mb-4 -ml-2">
          <Link href="/os-meus-trabalhos">
            <ArrowLeft /> Os meus trabalhos
          </Link>
        </Botao>

        <CartaoSolto
          cartao={dados.cartao}
          utilizador={perfil}
          podeEditar={dados.podeEditar}
          podeComentar={dados.podeComentar}
        />
      </main>
    </>
  );
}
