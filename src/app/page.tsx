import { redirect } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { ListaQuadros } from "@/components/quadros/lista-quadros";
import { exigirPerfil } from "@/lib/perfil";
import { carregarQuadros } from "@/lib/quadro/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export default async function PaginaInicial() {
  const perfil = await exigirPerfil();
  const quadros = await carregarQuadros();

  /*
    Onde é que cada pessoa aterra depois de entrar.

    Um cliente tem um quadro só — e uma lista de um elemento não é uma lista, é
    um clique a mais, todos os dias. Vai direto para lá.

    Um freelancer não tem quadro nenhum: tem cartões soltos, e o quadro à volta
    deles é precisamente o que não pode ver. Sem este desvio, entrava e ficava a
    olhar para um ecrã vazio sem perceber porquê.

    Quem gere quadros vê sempre a lista, mesmo com um quadro só: para essa
    pessoa, esta página é também por onde se cria o seguinte.
  */
  const externo = perfil.papel_global === "externo";

  if (externo && quadros.length === 1) {
    redirect(`/quadro/${quadros[0].id}`);
  }

  if (externo && quadros.length === 0) {
    const supabase = await criarClienteServidor();
    const { data: temTrabalhos } = await supabase.rpc("tenho_trabalhos_soltos");
    if (temTrabalhos) redirect("/os-meus-trabalhos");
  }

  return (
    <>
      <Cabecalho perfil={perfil} />
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <ListaQuadros quadros={quadros} />
      </main>
    </>
  );
}
