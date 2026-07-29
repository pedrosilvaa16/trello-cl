"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, Columns3 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * As duas secções de um quadro: o trabalho e o resultado.
 *
 * `<nav>` com `<Link>`, e não `role="tab"`: isto navega entre rotas, e um
 * `tab` sem `tabpanel` no mesmo documento diz a um leitor de ecrã uma coisa que
 * não é verdade. O Radix Tabs fica guardado para os separadores por rede dentro
 * do painel, onde há mesmo painéis a alternar sem mudar de página.
 */
export function SeparadoresQuadro({ idQuadro }: { idQuadro: string }) {
  const caminho = usePathname();
  const emEstatisticas = caminho.startsWith(`/quadro/${idQuadro}/estatisticas`);

  const secoes = [
    {
      href: `/quadro/${idQuadro}`,
      nome: "Conteúdos",
      icone: Columns3,
      ativa: !emEstatisticas,
    },
    {
      href: `/quadro/${idQuadro}/estatisticas`,
      nome: "Estatísticas",
      icone: ChartNoAxesColumn,
      ativa: emEstatisticas,
    },
  ];

  return (
    <nav aria-label="Secções do quadro" className="min-w-0">
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
              {/*
                No telemóvel fica só o ícone: a barra de topo já leva a marca e
                o menu do utilizador, e três textos não cabem sem apertar tudo.
                O nome continua a ser lido por um leitor de ecrã.
              */}
              <span className="sr-only sm:not-sr-only">{secao.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
