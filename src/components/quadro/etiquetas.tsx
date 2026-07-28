"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import { EmblemaEtiqueta } from "@/components/ui/emblema";
import { CORES_ETIQUETA, corEtiqueta } from "@/lib/cores";
import type { AccaoQuadro } from "@/lib/quadro/estado";
import * as mutar from "@/lib/quadro/mutacoes";
import type { Etiqueta } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

/** Gestão das etiquetas do quadro: criar, renomear, mudar cor, apagar. */
export function GestorEtiquetas({
  aberto,
  aoMudarAberto,
  idQuadro,
  etiquetas,
  despachar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  idQuadro: string;
  etiquetas: Etiqueta[];
  despachar: React.Dispatch<AccaoQuadro>;
}) {
  const [emEdicao, definirEmEdicao] = React.useState<string | null>(null);

  async function criar() {
    // Escolhe a primeira cor ainda não usada — seis cores iguais não ajudam.
    const usadas = new Set(etiquetas.map((e) => e.cor));
    const livre =
      CORES_ETIQUETA.find((c) => !usadas.has(c.nome))?.nome ??
      CORES_ETIQUETA[0].nome;
    try {
      const etiqueta = await mutar.criarEtiqueta(idQuadro, "", livre);
      despachar({ tipo: "etiqueta:upsert", etiqueta });
      definirEmEdicao(etiqueta.id);
    } catch (erro) {
      avisar.falhou(msg(erro));
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Etiquetas do quadro"
        descricao="As etiquetas são partilhadas por todos os cartões deste quadro."
      >
        <ul className="space-y-1.5">
          {etiquetas.map((etiqueta) => (
            <LinhaEtiqueta
              key={etiqueta.id}
              etiqueta={etiqueta}
              emEdicao={emEdicao === etiqueta.id}
              aoEditar={() => definirEmEdicao(etiqueta.id)}
              aoFechar={() => definirEmEdicao(null)}
              despachar={despachar}
            />
          ))}
        </ul>

        {etiquetas.length === 0 && (
          <p className="py-4 text-center text-sm text-texto-suave">
            Ainda não há etiquetas. Cria a primeira.
          </p>
        )}

        <Botao variante="secundario" className="mt-3 w-full" onClick={criar}>
          <Plus /> Nova etiqueta
        </Botao>
      </CaixaDialogo>
    </Dialogo>
  );
}

function LinhaEtiqueta({
  etiqueta,
  emEdicao,
  aoEditar,
  aoFechar,
  despachar,
}: {
  etiqueta: Etiqueta;
  emEdicao: boolean;
  aoEditar: () => void;
  aoFechar: () => void;
  despachar: React.Dispatch<AccaoQuadro>;
}) {
  // Semeado uma vez. Se o nome mudar noutro separador a meio da escrita, ganha
  // o que está a ser escrito aqui — perder texto a alguém é sempre pior.
  const [nome, definirNome] = React.useState(etiqueta.nome);

  async function guardar(campos: Partial<Etiqueta>) {
    const anterior = { nome: etiqueta.nome, cor: etiqueta.cor };
    despachar({ tipo: "etiqueta:upsert", etiqueta: { ...etiqueta, ...campos } });
    try {
      await mutar.alterarEtiqueta(etiqueta.id, campos);
    } catch (erro) {
      despachar({ tipo: "etiqueta:upsert", etiqueta: { ...etiqueta, ...anterior } });
      avisar.falhou(msg(erro));
    }
  }

  async function apagar() {
    despachar({ tipo: "etiqueta:remover", id: etiqueta.id });
    try {
      await mutar.apagarEtiqueta(etiqueta.id);
    } catch (erro) {
      despachar({ tipo: "etiqueta:upsert", etiqueta });
      avisar.falhou(msg(erro));
    }
  }

  if (!emEdicao) {
    return (
      <li className="flex items-center gap-2">
        <span
          className="h-7 min-w-0 flex-1 rounded px-2 py-1 text-sm font-medium text-white"
          style={{ backgroundColor: corEtiqueta(etiqueta.cor) }}
        >
          <span className="block truncate">{etiqueta.nome || "Sem nome"}</span>
        </span>
        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          onClick={aoEditar}
          aria-label={`Editar a etiqueta ${etiqueta.nome || "sem nome"}`}
        >
          <Pencil />
        </Botao>
        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          onClick={apagar}
          aria-label={`Apagar a etiqueta ${etiqueta.nome || "sem nome"}`}
        >
          <Trash2 />
        </Botao>
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-md border border-borda bg-superficie-2 p-2">
      <Campo
        value={nome}
        onChange={(evento) => definirNome(evento.target.value)}
        onBlur={() => nome !== etiqueta.nome && guardar({ nome })}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            guardar({ nome });
            aoFechar();
          }
          if (evento.key === "Escape") {
            definirNome(etiqueta.nome);
            aoFechar();
          }
        }}
        placeholder="Nome da etiqueta"
        aria-label="Nome da etiqueta"
        maxLength={60}
        autoFocus
      />

      <div className="flex flex-wrap gap-1.5">
        {CORES_ETIQUETA.map((cor) => (
          <button
            key={cor.nome}
            type="button"
            onClick={() => guardar({ cor: cor.nome })}
            aria-label={cor.rotulo}
            aria-pressed={etiqueta.cor === cor.nome}
            className="grid size-7 place-items-center rounded text-white"
            style={{ backgroundColor: corEtiqueta(cor.nome) }}
          >
            {etiqueta.cor === cor.nome && <Check className="size-4" aria-hidden />}
          </button>
        ))}
      </div>

      <Botao variante="secundario" tamanho="pequeno" onClick={aoFechar}>
        Fechar
      </Botao>
    </li>
  );
}

/** Escolha das etiquetas de um cartão. */
export function SeletorEtiquetas({
  etiquetas,
  selecionadas,
  aoAlternar,
  aoGerir,
}: {
  etiquetas: Etiqueta[];
  selecionadas: string[];
  aoAlternar: (id: string, ligar: boolean) => void;
  aoGerir: () => void;
}) {
  if (etiquetas.length === 0) {
    return (
      <div className="space-y-2 p-1">
        <p className="text-sm text-texto-suave">
          Este quadro ainda não tem etiquetas.
        </p>
        <Botao variante="secundario" tamanho="pequeno" onClick={aoGerir}>
          <Plus /> Criar a primeira
        </Botao>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-1">
      {etiquetas.map((etiqueta) => {
        const ativa = selecionadas.includes(etiqueta.id);
        return (
          <button
            key={etiqueta.id}
            type="button"
            onClick={() => aoAlternar(etiqueta.id, !ativa)}
            aria-pressed={ativa}
            className={cn(
              "flex w-full items-center gap-2 rounded p-1 text-left transition-colors hover:bg-superficie-2",
            )}
          >
            <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
              <Check className={cn("size-4", !ativa && "invisible")} />
            </span>
            <EmblemaEtiqueta etiqueta={etiqueta} className="min-w-0 flex-1" />
          </button>
        );
      })}
      <button
        type="button"
        onClick={aoGerir}
        className="mt-1 w-full rounded p-1.5 text-left text-xs text-texto-suave hover:bg-superficie-2"
      >
        Gerir etiquetas do quadro…
      </button>
    </div>
  );
}

function msg(erro: unknown) {
  return erro instanceof Error ? erro.message : "Não foi possível guardar.";
}
