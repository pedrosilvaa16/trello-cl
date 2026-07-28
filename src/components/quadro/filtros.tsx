"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { Botao } from "@/components/ui/botao";
import { EmblemaEtiqueta } from "@/components/ui/emblema";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  ItemMenuMarcavel,
  Menu,
  RotuloMenu,
  SeparadorMenu,
} from "@/components/ui/menu";
import {
  contarFiltros,
  FILTROS_VAZIOS,
  ROTULOS_DATA,
  type FiltroData,
  type Filtros,
} from "@/lib/quadro/filtros";
import type { MembroComPerfil } from "@/lib/quadro/tipos";
import type { Etiqueta } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

/**
 * O atalho `/` procura o campo pelo id em vez de o alcançar por uma ref
 * passada de mão em mão através de três componentes. Focar um campo é uma
 * ação sobre o documento, e o id já lá está.
 */
export const ID_CAMPO_PESQUISA = "pesquisa-do-quadro";

export function BarraFiltros({
  filtros,
  aoMudar,
  etiquetas,
  membros,
}: {
  filtros: Filtros;
  aoMudar: (filtros: Filtros) => void;
  etiquetas: Etiqueta[];
  membros: MembroComPerfil[];
}) {
  const total = contarFiltros(filtros);

  function alternar(chave: "etiquetas" | "membros", id: string) {
    const atuais = filtros[chave];
    aoMudar({
      ...filtros,
      [chave]: atuais.includes(id)
        ? atuais.filter((x) => x !== id)
        : [...atuais, id],
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-texto-tenue"
          aria-hidden
        />
        <input
          id={ID_CAMPO_PESQUISA}
          type="search"
          value={filtros.texto}
          onChange={(evento) =>
            aoMudar({ ...filtros, texto: evento.target.value })
          }
          placeholder="Pesquisar (/)"
          aria-label="Pesquisar cartões neste quadro"
          className="h-8 w-40 rounded-md border border-borda-forte bg-superficie pr-2 pl-8 text-sm text-texto placeholder:text-texto-tenue focus:w-56 sm:w-48"
        />
      </div>

      {/* Etiquetas */}
      <Menu>
        <AbrirMenu asChild>
          <Botao variante="secundario" tamanho="pequeno">
            Etiquetas
            {filtros.etiquetas.length > 0 && (
              <span className="rounded bg-principal px-1 text-[11px] text-[var(--cor-principal-texto)]">
                {filtros.etiquetas.length}
              </span>
            )}
            <ChevronDown />
          </Botao>
        </AbrirMenu>
        <ConteudoMenu alinhamento="start" className="min-w-56">
          <RotuloMenu>Filtrar por etiqueta</RotuloMenu>
          {etiquetas.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-texto-tenue">
              Este quadro ainda não tem etiquetas.
            </p>
          )}
          {etiquetas.map((etiqueta) => (
            <ItemMenuMarcavel
              key={etiqueta.id}
              checked={filtros.etiquetas.includes(etiqueta.id)}
              onCheckedChange={() => alternar("etiquetas", etiqueta.id)}
              onSelect={(evento) => evento.preventDefault()}
            >
              <Marca marcado={filtros.etiquetas.includes(etiqueta.id)} />
              <EmblemaEtiqueta etiqueta={etiqueta} className="min-w-0" />
            </ItemMenuMarcavel>
          ))}
        </ConteudoMenu>
      </Menu>

      {/* Membros */}
      <Menu>
        <AbrirMenu asChild>
          <Botao variante="secundario" tamanho="pequeno">
            Membros
            {filtros.membros.length > 0 && (
              <span className="rounded bg-principal px-1 text-[11px] text-[var(--cor-principal-texto)]">
                {filtros.membros.length}
              </span>
            )}
            <ChevronDown />
          </Botao>
        </AbrirMenu>
        <ConteudoMenu alinhamento="start" className="min-w-56">
          <RotuloMenu>Filtrar por membro</RotuloMenu>
          {membros.map((membro) => (
            <ItemMenuMarcavel
              key={membro.user_id}
              checked={filtros.membros.includes(membro.user_id)}
              onCheckedChange={() => alternar("membros", membro.user_id)}
              onSelect={(evento) => evento.preventDefault()}
            >
              <Marca marcado={filtros.membros.includes(membro.user_id)} />
              <Avatar perfil={membro.perfil} tamanho="pequeno" />
              <span className="truncate">{membro.perfil.nome}</span>
            </ItemMenuMarcavel>
          ))}
        </ConteudoMenu>
      </Menu>

      {/* Datas e concluídos */}
      <Menu>
        <AbrirMenu asChild>
          <Botao variante="secundario" tamanho="pequeno">
            {filtros.data === "qualquer" ? "Datas" : ROTULOS_DATA[filtros.data]}
            <ChevronDown />
          </Botao>
        </AbrirMenu>
        <ConteudoMenu alinhamento="start" className="min-w-52">
          <RotuloMenu>Data-limite</RotuloMenu>
          {(Object.keys(ROTULOS_DATA) as FiltroData[]).map((chave) => (
            <ItemMenu
              key={chave}
              onSelect={() => aoMudar({ ...filtros, data: chave })}
            >
              <Marca marcado={filtros.data === chave} />
              {ROTULOS_DATA[chave]}
            </ItemMenu>
          ))}
          <SeparadorMenu />
          <ItemMenuMarcavel
            checked={filtros.esconderConcluidos}
            onCheckedChange={(marcado) =>
              aoMudar({ ...filtros, esconderConcluidos: marcado === true })
            }
            onSelect={(evento) => evento.preventDefault()}
          >
            <Marca marcado={filtros.esconderConcluidos} />
            Esconder concluídos
          </ItemMenuMarcavel>
        </ConteudoMenu>
      </Menu>

      {total > 0 && (
        <Botao
          variante="fantasma"
          tamanho="pequeno"
          onClick={() => aoMudar(FILTROS_VAZIOS)}
          title="Limpar os filtros (x)"
        >
          <X />
          Limpar {total} {total === 1 ? "filtro" : "filtros"}
        </Botao>
      )}
    </div>
  );
}

function Marca({ marcado }: { marcado: boolean }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
      <Check className={cn("size-4", !marcado && "invisible")} />
    </span>
  );
}
