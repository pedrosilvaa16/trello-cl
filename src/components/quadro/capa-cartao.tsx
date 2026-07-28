"use client";

import { Check, Image as IconeImagem, Upload, X } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { CORES_ETIQUETA, corEtiqueta } from "@/lib/cores";
import { prepararCapa } from "@/lib/imagens";
import * as mutar from "@/lib/quadro/mutacoes";
import type { CorEtiqueta } from "@/lib/cores";
import type { AnexoComAutor } from "@/lib/quadro/tipos";
import type { Capa, TamanhoCapa } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

/** 10 MB. Uma capa é para ser vista, não guardada. */
const LIMITE_BYTES = 10 * 1024 * 1024;

/**
 * O painel da capa: cor ou imagem, faixa ou completa.
 *
 * A capa é de quem gere o quadro — é identidade visual, não conteúdo do
 * cartão. Quem não gere nunca vê este painel; e se lá chegar por outro
 * caminho, `definir_capa_cartao` recusa. Esconder um botão não é a permissão.
 *
 * A imagem entra como anexo do cartão, como na Trello. Não é atalho: é o que
 * faz apagar o anexo limpar a capa sozinho, sem uma segunda regra a ter de se
 * lembrar disso.
 */
export function PainelCapa({
  idCartao,
  capa,
  utilizadorId,
  aoMudar,
  aoAnexar,
  aoFechar,
}: {
  idCartao: string;
  capa: Capa;
  utilizadorId: string;
  aoMudar: (capa: Capa) => void;
  /** Avisa o detalhe de que a lista de anexos cresceu. */
  aoAnexar?: (anexo: AnexoComAutor) => void;
  aoFechar: () => void;
}) {
  const [anexos, definirAnexos] = React.useState<AnexoComAutor[]>([]);
  const [ocupado, definirOcupado] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);

  // As imagens que já estão no cartão e podem virar capa. Ligações para fora
  // não servem: não há ficheiro nosso para assinar.
  React.useEffect(() => {
    let vivo = true;
    mutar
      .listarAnexos(idCartao)
      .then((lista) => {
        if (!vivo) return;
        definirAnexos(
          lista.filter((a) => !a.url && a.tipo_mime.startsWith("image/")),
        );
      })
      .catch(() => definirAnexos([]));
    return () => {
      vivo = false;
    };
  }, [idCartao]);

  const comCapa = !!capa.capa_cor || !!capa.capa_anexo_id;

  async function guardar(alteracao: Partial<Capa>) {
    const seguinte = { ...capa, ...alteracao };
    definirOcupado(true);
    try {
      aoMudar(await mutar.definirCapa(idCartao, seguinte));
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível guardar a capa.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function enviar(ficheiro: File) {
    if (ficheiro.size > LIMITE_BYTES) {
      avisar.falhou(
        `«${ficheiro.name}» é grande de mais para capa.`,
        "O limite são 10 MB. Uma imagem mais pequena chega e abre mais depressa.",
      );
      return;
    }

    definirOcupado(true);
    try {
      // Reduzir antes de enviar: o que sai daqui costuma ser um décimo do que
      // entrou, e é exatamente o que se vê no ecrã.
      const preparada = await prepararCapa(ficheiro);
      const { anexo, capa: nova } = await mutar.carregarCapa(
        idCartao,
        preparada,
        utilizadorId,
        { capa_tamanho: capa.capa_tamanho, capa_texto: capa.capa_texto },
      );
      definirAnexos((atuais) => [anexo, ...atuais]);
      aoAnexar?.(anexo);
      aoMudar(nova);
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível enviar a imagem.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <div className="w-72 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-texto">Capa</h3>
        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          aria-label="Fechar"
          onClick={aoFechar}
        >
          <X />
        </Botao>
      </div>

      {/* ----------------------------------------------------------- tamanho */}

      <fieldset disabled={ocupado || !comCapa} className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
          Tamanho
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <BotaoTamanho
            tamanho="faixa"
            atual={capa.capa_tamanho}
            capa={capa}
            aoEscolher={() => guardar({ capa_tamanho: "faixa" })}
          />
          <BotaoTamanho
            tamanho="completa"
            atual={capa.capa_tamanho}
            capa={capa}
            aoEscolher={() => guardar({ capa_tamanho: "completa" })}
          />
        </div>
        {!comCapa && (
          <p className="text-xs text-texto-tenue">
            Escolhe primeiro uma cor ou uma imagem.
          </p>
        )}
      </fieldset>

      {/* ------------------------------------------------------ cor do texto */}

      {capa.capa_tamanho === "completa" && comCapa && (
        <fieldset disabled={ocupado} className="space-y-1.5">
          <legend className="mb-1.5 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
            Cor do texto
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["escuro", "claro"] as const).map((tom) => (
              <button
                key={tom}
                type="button"
                onClick={() => guardar({ capa_texto: tom })}
                aria-pressed={capa.capa_texto === tom}
                className={cn(
                  "flex h-10 items-center justify-center rounded-md border-2 px-2 text-xs font-semibold",
                  capa.capa_texto === tom
                    ? "border-principal"
                    : "border-transparent",
                  tom === "escuro"
                    ? "bg-superficie-2 text-texto"
                    : "bg-[#4b3fd4] text-white",
                )}
              >
                {tom === "escuro" ? "Texto escuro" : "Texto claro"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* ------------------------------------------------------------- cores */}

      <fieldset disabled={ocupado} className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
          Cores
        </legend>
        <div className="grid grid-cols-5 gap-2">
          {CORES_ETIQUETA.map(({ nome, rotulo }) => {
            const escolhida = capa.capa_cor === nome;
            return (
              <button
                key={nome}
                type="button"
                aria-label={rotulo}
                aria-pressed={escolhida}
                onClick={() =>
                  guardar({
                    capa_cor: escolhida ? null : (nome as CorEtiqueta),
                    capa_anexo_id: null,
                  })
                }
                style={{ backgroundColor: corEtiqueta(nome) }}
                className={cn(
                  "grid h-8 place-items-center rounded-md border-2 transition-transform",
                  "hover:scale-105 focus-visible:scale-105",
                  escolhida ? "border-texto" : "border-transparent",
                )}
              >
                {escolhida && (
                  <Check className="size-4 text-white drop-shadow" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ------------------------------------------------------------ anexos */}

      {anexos.length > 0 && (
        <fieldset disabled={ocupado} className="space-y-1.5">
          <legend className="mb-1.5 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
            Anexos deste cartão
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {anexos.map((anexo) => {
              const escolhido = capa.capa_anexo_id === anexo.id;
              return (
                <button
                  key={anexo.id}
                  type="button"
                  aria-label={`Usar ${anexo.nome_ficheiro} como capa`}
                  aria-pressed={escolhido}
                  onClick={() =>
                    guardar({
                      capa_anexo_id: escolhido ? null : anexo.id,
                      capa_cor: null,
                    })
                  }
                  className={cn(
                    "relative h-14 overflow-hidden rounded-md border-2 bg-superficie-2",
                    escolhido ? "border-texto" : "border-transparent",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/anexos/${anexo.id}`}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="size-full object-cover"
                  />
                  {escolhido && (
                    <span className="absolute inset-0 grid place-items-center bg-black/40">
                      <Check className="size-5 text-white" aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* ------------------------------------------------------------ enviar */}

      <div className="space-y-2">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(evento) => {
            const ficheiro = evento.target.files?.[0];
            // Limpar já: sem isto, escolher o mesmo ficheiro outra vez não
            // dispara o evento e o botão parece avariado.
            evento.target.value = "";
            if (ficheiro) enviar(ficheiro);
          }}
        />
        <Botao
          variante="secundario"
          tamanho="pequeno"
          ocupado={ocupado}
          className="w-full"
          onClick={() => entrada.current?.click()}
        >
          <Upload /> {ocupado ? "A enviar…" : "Carregar uma imagem"}
        </Botao>
        <p className="text-xs text-texto-tenue">
          A imagem fica também nos anexos do cartão. É reduzida antes de subir.
        </p>
      </div>

      {comCapa && (
        <Botao
          variante="fantasma"
          tamanho="pequeno"
          disabled={ocupado}
          className="w-full text-perigo"
          onClick={() => guardar(mutar.SEM_CAPA)}
        >
          <X /> Remover capa
        </Botao>
      )}
    </div>
  );
}

/** A pré-visualização dos dois tamanhos, como no painel da Trello. */
function BotaoTamanho({
  tamanho,
  atual,
  capa,
  aoEscolher,
}: {
  tamanho: TamanhoCapa;
  atual: TamanhoCapa;
  capa: Capa;
  aoEscolher: () => void;
}) {
  const escolhido = atual === tamanho;
  const fundo = capa.capa_cor
    ? corEtiqueta(capa.capa_cor)
    : "var(--cor-superficie-2)";

  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={escolhido}
      aria-label={tamanho === "faixa" ? "Capa em faixa" : "Capa completa"}
      className={cn(
        "overflow-hidden rounded-md border-2 bg-superficie p-0",
        escolhido ? "border-principal" : "border-borda",
      )}
    >
      {tamanho === "faixa" ? (
        <span className="block">
          <span className="block h-4 w-full" style={{ background: fundo }} />
          <span className="flex flex-col gap-1 p-1.5">
            <span className="block h-1 w-full rounded bg-borda-forte" />
            <span className="block h-1 w-2/3 rounded bg-borda-forte" />
          </span>
        </span>
      ) : (
        <span
          className="flex h-[46px] flex-col justify-end gap-1 p-1.5"
          style={{ background: fundo }}
        >
          <span className="block h-1 w-full rounded bg-white/70" />
          <span className="block h-1 w-2/3 rounded bg-white/70" />
        </span>
      )}
    </button>
  );
}

/**
 * O que a capa é, em CSS, para o cartão e para o detalhe.
 *
 * Um sítio só: o cartão da coluna e o painel do detalhe desenham a mesma capa,
 * e duas cópias disto divergiriam à primeira alteração.
 */
export function estiloDaCapa(capa: Capa): React.CSSProperties | undefined {
  if (capa.capa_cor) return { backgroundColor: corEtiqueta(capa.capa_cor) };
  return undefined;
}

export function temCapa(capa: Capa) {
  return !!capa.capa_cor || !!capa.capa_anexo_id;
}

export { IconeImagem };
