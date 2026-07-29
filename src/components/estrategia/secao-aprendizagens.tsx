"use client";

import { Plus, ThumbsDown, ThumbsUp, StickyNote, Trash2 } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import type { TipoAprendizagem } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

export type Aprendizagem = {
  id: string;
  texto: string;
  tipo: TipoAprendizagem;
  criado_em: string;
};

const TIPOS: Record<
  TipoAprendizagem,
  { nome: string; icone: typeof ThumbsUp; classe: string }
> = {
  funcionou: {
    nome: "Funcionou",
    icone: ThumbsUp,
    classe: "border-sucesso/40 bg-sucesso/5 text-sucesso",
  },
  nao_funcionou: {
    nome: "Não funcionou",
    icone: ThumbsDown,
    classe: "border-perigo/40 bg-perigo/5 text-perigo",
  },
  nota: {
    nome: "Nota",
    icone: StickyNote,
    classe: "border-borda-forte bg-superficie-2 text-texto-suave",
  },
};

/**
 * O que resultou e o que não resultou com este cliente.
 *
 * Entra no contexto tal como está escrito, e é por isso que o campo é uma
 * linha e não um documento: uma aprendizagem que não caiba numa frase ainda
 * não é uma aprendizagem, é uma conversa por ter.
 */
export function SecaoAprendizagens({
  idQuadro,
  iniciais,
  aoGuardar,
}: {
  idQuadro: string;
  iniciais: Aprendizagem[];
  aoGuardar: () => void;
}) {
  const [lista, definirLista] = React.useState(iniciais);
  const [texto, definirTexto] = React.useState("");
  const [tipo, definirTipo] = React.useState<TipoAprendizagem>("funcionou");
  const [filtro, definirFiltro] = React.useState<TipoAprendizagem | "todas">(
    "todas",
  );
  const [ocupado, definirOcupado] = React.useState(false);

  const visiveis =
    filtro === "todas" ? lista : lista.filter((a) => a.tipo === filtro);

  async function acrescentar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!texto.trim()) return;

    definirOcupado(true);
    try {
      const resposta = await fetch(`/api/quadros/${idQuadro}/aprendizagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), tipo }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível guardar.");
      definirLista((atuais) => [corpo, ...atuais]);
      definirTexto("");
      aoGuardar();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível guardar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function apagar(id: string) {
    const anterior = lista;
    definirLista((atuais) => atuais.filter((a) => a.id !== id));
    try {
      const resposta = await fetch(
        `/api/quadros/${idQuadro}/aprendizagens/${id}`,
        { method: "DELETE" },
      );
      if (!resposta.ok) throw new Error();
      aoGuardar();
    } catch {
      definirLista(anterior);
      avisar.falhou("Não foi possível apagar.");
    }
  }

  const contagem = (chave: TipoAprendizagem) =>
    lista.filter((a) => a.tipo === chave).length;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- acrescentar */}

      <form
        onSubmit={acrescentar}
        className="flex flex-wrap gap-2 rounded-md border border-borda bg-superficie-2 p-2.5"
      >
        <div
          role="radiogroup"
          aria-label="Tipo de aprendizagem"
          className="flex shrink-0 gap-1"
        >
          {(Object.keys(TIPOS) as TipoAprendizagem[]).map((chave) => {
            const { nome, icone: Icone, classe } = TIPOS[chave];
            const ativo = tipo === chave;
            return (
              <button
                key={chave}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => definirTipo(chave)}
                title={nome}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium",
                  "transition-colors duration-[var(--duracao-rapida)]",
                  ativo
                    ? classe
                    : "border-borda text-texto-tenue hover:bg-superficie",
                )}
              >
                <Icone className="size-3.5" aria-hidden />
                <span className="sr-only lg:not-sr-only">{nome}</span>
              </button>
            );
          })}
        </div>

        <Campo
          value={texto}
          onChange={(evento) => definirTexto(evento.target.value)}
          placeholder="Os vídeos sem locução tiveram o dobro do alcance."
          className="min-w-48 flex-1"
        />

        <Botao type="submit" variante="principal" ocupado={ocupado}>
          <Plus /> Acrescentar
        </Botao>
      </form>

      {/* ------------------------------------------------------------ lista */}

      {lista.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <FiltroChip
            ativo={filtro === "todas"}
            onClick={() => definirFiltro("todas")}
          >
            Todas ({lista.length})
          </FiltroChip>
          {(Object.keys(TIPOS) as TipoAprendizagem[]).map((chave) => (
            <FiltroChip
              key={chave}
              ativo={filtro === chave}
              onClick={() => definirFiltro(chave)}
            >
              {TIPOS[chave].nome} ({contagem(chave)})
            </FiltroChip>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <p className="rounded-md border border-dashed border-borda-forte px-3 py-8 text-center text-sm text-texto-tenue">
          Ainda nada. A primeira aprendizagem costuma vir do primeiro mês de
          resultados.
        </p>
      ) : (
        <ul className="grid gap-1.5 xl:grid-cols-2">
          {visiveis.map((aprendizagem) => {
            const { nome, icone: Icone, classe } = TIPOS[aprendizagem.tipo];
            return (
              <li
                key={aprendizagem.id}
                className="group/linha flex items-start gap-2 rounded-md border border-borda bg-superficie p-2.5"
              >
                <span
                  title={nome}
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded border",
                    classe,
                  )}
                >
                  <Icone className="size-3.5" aria-hidden />
                  <span className="sr-only">{nome}</span>
                </span>

                <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-texto">
                  {aprendizagem.texto}
                </p>

                <span className="shrink-0 text-xs text-texto-tenue">
                  {new Date(aprendizagem.criado_em).toLocaleDateString("pt-PT", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>

                <Botao
                  variante="fantasma"
                  tamanho="iconePequeno"
                  className="opacity-0 group-hover/linha:opacity-100 focus-visible:opacity-100"
                  aria-label={`Apagar «${aprendizagem.texto.slice(0, 40)}»`}
                  onClick={() => apagar(aprendizagem.id)}
                >
                  <Trash2 />
                </Botao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        ativo
          ? "border-principal bg-[var(--cor-principal-tenue)] text-texto"
          : "border-borda text-texto-tenue hover:bg-superficie-2",
      )}
    >
      {children}
    </button>
  );
}
