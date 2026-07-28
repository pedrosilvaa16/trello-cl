import { Cabecalho } from "@/components/cabecalho";
import { ListaQuadros } from "@/components/quadros/lista-quadros";
import { exigirPerfil } from "@/lib/perfil";
import { carregarQuadros } from "@/lib/quadro/dados";

export default async function PaginaInicial() {
  const perfil = await exigirPerfil();
  const quadros = await carregarQuadros();

  return (
    <>
      <Cabecalho perfil={perfil} />
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <ListaQuadros quadros={quadros} />
      </main>
    </>
  );
}
