import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { DetalheDaPessoa } from "@/components/pessoas/detalhe-da-pessoa";
import { Botao } from "@/components/ui/botao";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { DetalhePessoa, QuadroGerido } from "@/lib/supabase/tipos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detalhe = await carregarDetalhe(id);
  return { title: detalhe?.pessoa.nome ?? "Pessoa" };
}

/**
 * O detalhe é sempre servido por `detalhe_pessoa`, que corre com a sessão de
 * quem pede: um admin não descobre por aqui os quadros de outro admin, e um
 * externo não chega sequer a passar a porta.
 *
 * Um erro da função (sem permissão, id que não existe) vira 404 — de fora, uma
 * pessoa a que não se tem acesso e uma pessoa que não existe são a mesma coisa.
 */
async function carregarDetalhe(id: string): Promise<DetalhePessoa | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("detalhe_pessoa", { p_alvo: id });
  if (error || !data) return null;
  return data;
}

/**
 * Os quadros que quem está a ver pode dar a esta pessoa.
 *
 * Vem de `quadros_que_giro`, que aplica `pode_gerir_quadro`: um super_admin
 * oferece todos, um gestor oferece os seus, e quem não gere nenhum não vê o
 * formulário. Isto desenha o ecrã — quem recusa mesmo é `definir_membro_quadro`.
 */
async function carregarQuadrosGeridos(): Promise<QuadroGerido[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("quadros_que_giro");
  return data ?? [];
}

export default async function PaginaPessoa({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await exigirPerfil();
  const [detalhe, quadrosGeridos] = await Promise.all([
    carregarDetalhe(id),
    carregarQuadrosGeridos(),
  ]);

  if (!detalhe) notFound();

  return (
    <>
      <Cabecalho perfil={perfil} />

      <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        <Botao comoFilho variante="fantasma" tamanho="pequeno" className="mb-4 -ml-2">
          <Link href="/pessoas">
            <ArrowLeft /> Pessoas
          </Link>
        </Botao>

        <DetalheDaPessoa
          detalhe={detalhe}
          quadrosGeridos={quadrosGeridos}
          euProprio={perfil}
          eSuperAdmin={perfil.papel_global === "super_admin"}
        />
      </main>
    </>
  );
}
