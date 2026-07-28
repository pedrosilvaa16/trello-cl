import Link from "next/link";

import { Marca } from "@/components/marca";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Perfil } from "@/lib/supabase/tipos";

import { MenuUtilizador } from "./menu-utilizador";

/** Barra de topo, igual em todas as páginas com sessão. */
export async function Cabecalho({
  perfil,
  children,
}: {
  perfil: Perfil;
  children?: React.ReactNode;
}) {
  /*
    O papel global vem no perfil que a página já carregou — antes era uma
    contagem em board_members a cada render, e agora é uma coluna. Serve só
    para não mostrar a toda a gente um link que dá "isto não é para ti"; quem
    decide se a página abre é a própria página, no servidor.
  */
  const gerePessoas = perfil.papel_global !== "externo";

  /*
    Um freelancer não pode abrir o quadro onde está o cartão dele, por isso o
    caminho para o trabalho tem de estar aqui em cima. Uma consulta ao índice
    card_access(user_id, card_id), e só para quem não gere nada — para a equipa
    da casa a resposta seria quase sempre não.
  */
  const supabase = await criarClienteServidor();
  const { data: temTrabalhos } = await supabase.rpc("tenho_trabalhos_soltos");

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-borda bg-superficie px-3 py-2 sm:px-4">
      <a href="#conteudo" className="saltar-conteudo">
        <span className="rounded-md bg-principal px-3 py-1.5 text-sm font-medium text-[var(--cor-principal-texto)]">
          Saltar para o conteúdo
        </span>
      </a>

      <Link
        href="/"
        className="shrink-0 rounded transition-opacity hover:opacity-80"
        aria-label="Os meus quadros"
      >
        <Marca className="h-4 sm:h-[18px]" />
      </Link>

      {children}

      <div className="ml-auto">
        <MenuUtilizador
          perfil={perfil}
          gerePessoas={gerePessoas}
          temTrabalhos={temTrabalhos ?? false}
        />
      </div>
    </header>
  );
}
