import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Quadro } from "@/components/quadro/quadro";
import { exigirPerfil } from "@/lib/perfil";
import { carregarCabecalhoQuadro, carregarQuadro } from "@/lib/quadro/dados";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  /*
    O carregador leve, e não `carregarQuadro`: um título não precisa dos cartões
    todos. Está em `cache()` do React, por isso o layout e esta função partilham
    a mesma consulta dentro do mesmo pedido em vez de a repetirem.
  */
  const dados = await carregarCabecalhoQuadro(id);
  return { title: dados?.quadro.nome ?? "Quadro" };
}

/**
 * O quadro: listas, cartões e arrasto.
 *
 * A barra de topo e os separadores estão em `layout.tsx`, partilhados com as
 * estatísticas — daí esta página devolver só o quadro.
 */
export default async function PaginaQuadro({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await exigirPerfil();
  const dados = await carregarQuadro(id);

  // Um quadro de que não se é membro é indistinguível de um que não existe —
  // é RLS a funcionar, e é assim que deve ser visto de fora.
  if (!dados) notFound();

  return <Quadro dados={dados} utilizador={perfil} />;
}
