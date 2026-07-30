"use client";

import { LayoutGrid, ListTodo } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * As secções de topo da plataforma: os quadros dos clientes e o trabalho da casa.
 *
 * Só é construída para quem é da equipa. Para um cliente ou um freelancer não
 * fica cinzenta nem desativada — não existe, e é a mesma regra do separador
 * «Estratégia»: um separador com um cadeado conta exatamente a história que não
 * se quer contar a um cliente, que é a de que há um sítio onde ele não entra.
 *
 * `<nav>` com `<Link>`, e não `role="tab"`: isto navega entre rotas, e um `tab`
 * sem `tabpanel` no mesmo documento diz a um leitor de ecrã uma coisa que não é
 * verdade.
 */
export function NavegacaoPrincipal() {
  const caminho = usePathname();

  const secoes = [
    {
      href: "/",
      nome: "Quadros",
      icone: LayoutGrid,
      // Um quadro é um cliente, e estar dentro de um continua a ser estar nos
      // quadros — daí `/quadro` também acender esta secção.
      ativa: caminho === "/" || caminho.startsWith("/quadro"),
    },
    {
      href: "/tarefas",
      nome: "Tarefas",
      icone: ListTodo,
      ativa: caminho.startsWith("/tarefas"),
    },
  ];

  return (
    <nav aria-label="Secções da plataforma" className="min-w-0">
      <ul className="flex items-center gap-1">
        {secoes.map((secao) => (
          <li key={secao.href}>
            <Link
              href={secao.href}
              aria-current={secao.ativa ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium",
                "transition-colors duration-[var(--duracao-rapida)] ease-[var(--curva)]",
                secao.ativa
                  ? "bg-superficie-3 text-texto"
                  : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
              )}
            >
              <secao.icone className="size-4 shrink-0" aria-hidden />
              {/* No telemóvel fica só o ícone, como nos separadores do quadro.
                  O nome continua a ser lido por um leitor de ecrã. */}
              <span className="sr-only sm:not-sr-only">{secao.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
