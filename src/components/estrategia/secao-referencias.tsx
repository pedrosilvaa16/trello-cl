"use client";

import { AlertTriangle, Check, Link2, ListFilter } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Emblema } from "@/components/ui/emblema";
import type { TipoLista } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

export type Lista = { id: string; nome: string; tipo: TipoLista };
export type Referencia = {
  id: string;
  titulo: string;
  referencia_porque: string | null;
  referencia_url: string | null;
};

const NOMES_TIPO: Record<TipoLista, string> = {
  normal: "Normal",
  referencias: "Referências",
  publicados: "Publicados",
};

/**
 * As referências do quadro, anotadas sem sair daqui.
 *
 * Duas coisas neste ecrã, e a ordem entre elas importa: primeiro dizer que
 * listas são o quê — sem isso não há referências nenhumas para mostrar — e só
 * depois anotar o porquê de cada uma.
 */
export function SecaoReferencias({
  idQuadro,
  listas,
  referencias,
  aoGuardar,
}: {
  idQuadro: string;
  listas: Lista[];
  referencias: Referencia[];
  aoGuardar: () => void;
}) {
  const [tipos, definirTipos] = React.useState(
    () => new Map(listas.map((l) => [l.id, l.tipo])),
  );
  const [soPorPreencher, definirSoPorPreencher] = React.useState(false);

  const semPorque = referencias.filter((r) => !r.referencia_porque?.trim());
  const visiveis = soPorPreencher ? semPorque : referencias;

  async function mudarTipo(idLista: string, tipo: TipoLista) {
    const anterior = tipos.get(idLista) ?? "normal";
    definirTipos((atuais) => new Map(atuais).set(idLista, tipo));
    try {
      const resposta = await fetch(
        `/api/quadros/${idQuadro}/listas/${idLista}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo }),
        },
      );
      if (!resposta.ok) throw new Error();
      aoGuardar();
      avisar.feito(
        "Tipo de lista alterado.",
        "Recarrega a página para ver as referências desta lista.",
      );
    } catch {
      definirTipos((atuais) => new Map(atuais).set(idLista, anterior));
      avisar.falhou("Não foi possível mudar o tipo da lista.");
    }
  }

  return (
    <div className="space-y-5">
      {/* --------------------------------------------- tipos das listas */}

      <section>
        <h3 className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">
          Para que serve cada lista
        </h3>
        <p className="mt-1 mb-2 text-xs text-texto-tenue">
          Os tipos foram adivinhados pelo nome quando a funcionalidade entrou.
          É por aqui que se sabe o que é uma referência e o que é uma publicação.
        </p>

        <ul className="grid gap-1 sm:grid-cols-2">
          {listas.map((lista) => {
            const tipo = tipos.get(lista.id) ?? "normal";
            return (
              <li
                key={lista.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                  tipo === "normal"
                    ? "border-borda"
                    : "border-[var(--cor-principal-borda)] bg-[var(--cor-principal-tenue)]",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-texto">
                  {lista.nome}
                </span>
                <select
                  value={tipo}
                  aria-label={`Tipo de «${lista.nome}»`}
                  onChange={(evento) =>
                    mudarTipo(lista.id, evento.target.value as TipoLista)
                  }
                  className="h-7 shrink-0 rounded border border-borda-forte bg-superficie px-1.5 text-xs text-texto"
                >
                  {(Object.keys(NOMES_TIPO) as TipoLista[]).map((chave) => (
                    <option key={chave} value={chave}>
                      {NOMES_TIPO[chave]}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </section>

      {/* -------------------------------------------------- as referências */}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">
            O porquê de cada uma
            <span className="ml-2 font-normal normal-case" data-numerico>
              {referencias.length}
            </span>
          </h3>

          {semPorque.length > 0 && (
            <Botao
              variante={soPorPreencher ? "principal" : "secundario"}
              tamanho="pequeno"
              aria-pressed={soPorPreencher}
              onClick={() => definirSoPorPreencher((v) => !v)}
            >
              <ListFilter /> Só as que faltam ({semPorque.length})
            </Botao>
          )}
        </div>

        {referencias.length === 0 ? (
          <p className="rounded-md border border-dashed border-borda-forte px-3 py-8 text-center text-sm text-texto-tenue">
            Nenhuma referência. Marca acima como «Referências» a lista onde
            guardas inspiração.
          </p>
        ) : visiveis.length === 0 ? (
          <p className="flex items-center justify-center gap-2 rounded-md border border-sucesso/40 bg-sucesso/5 px-3 py-8 text-center text-sm text-texto-suave">
            <Check className="size-4 text-sucesso" aria-hidden />
            Todas as referências têm o porquê preenchido.
          </p>
        ) : (
          /*
            Duas colunas a partir do ecrã largo. Uma referência é um bloco
            pequeno — em coluna única, vinte delas são vinte ecrãs de scroll
            num painel que existe para se ver o conjunto.
          */
          <ul className="grid gap-2 xl:grid-cols-2">
            {visiveis.map((referencia) => (
              <LinhaReferencia
                key={referencia.id}
                idQuadro={idQuadro}
                referencia={referencia}
                aoGuardar={aoGuardar}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LinhaReferencia({
  idQuadro,
  referencia,
  aoGuardar,
}: {
  idQuadro: string;
  referencia: Referencia;
  aoGuardar: () => void;
}) {
  const [porque, definirPorque] = React.useState(
    referencia.referencia_porque ?? "",
  );
  const [url, definirUrl] = React.useState(referencia.referencia_url ?? "");
  const [guardado, definirGuardado] = React.useState(false);

  const gravado = React.useRef({
    porque: referencia.referencia_porque ?? "",
    url: referencia.referencia_url ?? "",
  });
  const avisar_ = React.useRef(aoGuardar);
  React.useEffect(() => {
    avisar_.current = aoGuardar;
  }, [aoGuardar]);

  const vazio = !porque.trim();

  React.useEffect(() => {
    if (porque === gravado.current.porque && url === gravado.current.url) return;

    const temporizador = setTimeout(async () => {
      try {
        const resposta = await fetch(
          `/api/quadros/${idQuadro}/referencias/${referencia.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ porque, url }),
          },
        );
        if (!resposta.ok) throw new Error();
        gravado.current = { porque, url };
        definirGuardado(true);
        avisar_.current();
        setTimeout(() => definirGuardado(false), 1800);
      } catch {
        avisar.falhou(`Não foi possível guardar «${referencia.titulo}».`);
      }
    }, 1000);

    return () => clearTimeout(temporizador);
  }, [porque, url, idQuadro, referencia.id, referencia.titulo]);

  return (
    <li
      className={cn(
        "rounded-md border p-2.5",
        // O destaque é do que falta, não do que está feito: isto é a lista do
        // que há para fazer, não um mostruário do que já se fez.
        vazio ? "border-aviso/50 bg-aviso/5" : "border-borda bg-superficie",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {vazio && (
          <AlertTriangle className="size-3.5 shrink-0 text-aviso" aria-hidden />
        )}
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-texto">
          {referencia.titulo}
        </p>
        {guardado && (
          <Emblema className="shrink-0 border-sucesso/40 text-sucesso">
            <Check className="mr-1 size-3" aria-hidden /> Guardado
          </Emblema>
        )}
      </div>

      <textarea
        value={porque}
        onChange={(evento) => definirPorque(evento.target.value)}
        placeholder="Porque é que isto é uma referência? O que aqui resulta e vale a pena repetir?"
        rows={2}
        aria-label={`Porquê de «${referencia.titulo}»`}
        className="w-full resize-y rounded border border-borda-forte bg-superficie px-2 py-1.5 text-[13px] leading-relaxed text-texto placeholder:text-texto-tenue focus-visible:border-principal focus-visible:outline-none"
      />

      <div className="relative mt-1.5">
        <Link2
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-texto-tenue"
          aria-hidden
        />
        <Campo
          value={url}
          onChange={(evento) => definirUrl(evento.target.value)}
          placeholder="Ligação (opcional)"
          aria-label={`Ligação de «${referencia.titulo}»`}
          className="h-7 pl-7 text-xs"
        />
      </div>
    </li>
  );
}
