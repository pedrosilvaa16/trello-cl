import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { Quadro } from "@/components/quadro/quadro";
import { exigirPerfil } from "@/lib/perfil";
import { carregarQuadro } from "@/lib/quadro/dados";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dados = await carregarQuadro(id);
  return { title: dados?.quadro.nome ?? "Quadro" };
}

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

  return (
    // `bg-transparent`: o fundo do quadro é a imagem do cliente, desenhada
    // por baixo pelo componente do quadro.
    <div className="flex h-dvh flex-col overflow-hidden bg-transparent">
      <Cabecalho perfil={perfil} />
      <Quadro dados={dados} utilizador={perfil} />
    </div>
  );
}
