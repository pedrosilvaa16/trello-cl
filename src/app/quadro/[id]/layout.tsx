import { notFound } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { SeparadoresQuadro } from "@/components/quadro/separadores";
import { exigirPerfil } from "@/lib/perfil";
import { carregarCabecalhoQuadro } from "@/lib/quadro/dados";

/**
 * O envelope de um quadro: a barra de topo e os separadores.
 *
 * Existe desde que o quadro passou a ter duas secções — Conteúdos e
 * Estatísticas. Antes, a página do quadro renderizava o seu próprio
 * `<Cabecalho>`; agora é daqui, para as duas secções partilharem a mesma barra
 * e a navegação entre elas não redesenhar o topo.
 *
 * `h-dvh overflow-hidden` é do quadro e fica aqui porque as duas secções o
 * querem: no quadro é o que faz as colunas rolarem por dentro em vez de a
 * página inteira rolar, e nas estatísticas é o que mantém os separadores à vista
 * enquanto se desce o painel. Cada página traz o seu próprio contentor com
 * `overflow-y-auto` quando precisa de rolar.
 */
export default async function LayoutQuadro({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await exigirPerfil();
  const dados = await carregarCabecalhoQuadro(id);

  // Um quadro de que não se é membro é indistinguível de um que não existe.
  if (!dados) notFound();

  return (
    // `bg-transparent`: o fundo do quadro é a imagem do cliente, desenhada por
    // baixo pelo componente do quadro.
    <div className="flex h-dvh flex-col overflow-hidden bg-transparent">
      <Cabecalho perfil={perfil}>
        <SeparadoresQuadro idQuadro={id} gere={dados.papel === "gestor"} />
      </Cabecalho>
      {children}
    </div>
  );
}
