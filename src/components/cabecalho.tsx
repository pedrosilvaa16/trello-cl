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
    Uma contagem por render, mas sobre o índice board_members(user_id) — e é o
    que evita mostrar a toda a gente um link que dá "isto é para admins".
  */
  const supabase = await criarClienteServidor();
  const { count } = await supabase
    .from("board_members")
    .select("board_id", { count: "exact", head: true })
    .eq("user_id", perfil.id)
    .eq("papel", "admin");

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-borda bg-superficie px-3 py-2 sm:px-4">
      <a href="#conteudo" className="saltar-conteudo">
        <span className="rounded-md bg-principal px-3 py-1.5 text-sm font-medium text-[var(--cor-principal-texto)]">
          Saltar para o conteúdo
        </span>
      </a>

      <Link
        href="/"
        className="rounded text-principal transition-opacity hover:opacity-80"
        aria-label="Os meus quadros"
      >
        <Marca />
      </Link>

      {children}

      <div className="ml-auto">
        <MenuUtilizador perfil={perfil} eAdmin={(count ?? 0) > 0} />
      </div>
    </header>
  );
}
