"use client";

import { Image as IconeImagem, Trash2, Upload } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { prepararCapa } from "@/lib/imagens";
import * as mutar from "@/lib/quadro/mutacoes";
import { formatarTamanho } from "@/lib/utils";

/** 10 MB — o mesmo limite que a rota impõe. */
const LIMITE_BYTES = 10 * 1024 * 1024;

const TIPOS_ACEITES = "image/jpeg,image/png,image/webp,image/avif";

/**
 * A imagem de destaque de um cartão.
 *
 * Pôr, trocar e tirar é de quem gere o quadro — ver é de quem vê o cartão. Um
 * editor abre isto e vê a imagem sem os botões, que é o que se pretende: a
 * capa é identidade visual do quadro, e não conteúdo do cartão.
 *
 * Como sempre, esconder os botões não é a permissão: quem chamar a rota à mão
 * leva com o 403 de `definir_imagem_cartao`.
 */
export function CapaCartao({
  idCartao,
  chave,
  atualizadoEm,
  gerivel,
  aoMudar,
}: {
  idCartao: string;
  /** A chave no R2, ou nula. Serve para saber se há capa, não para a servir. */
  chave: string | null;
  /** Entra no URL como anti-cache: troca a capa e o browser vai buscar a nova. */
  atualizadoEm: string;
  gerivel: boolean;
  aoMudar: (chave: string | null) => void;
}) {
  const [ocupado, definirOcupado] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);
  const confirmacao = useConfirmacao();

  // Sem capa e sem poder pôr uma: a secção não tem nada para dizer.
  if (!chave && !gerivel) return null;

  async function enviar(ficheiro: File) {
    if (ficheiro.size > LIMITE_BYTES) {
      avisar.falhou(
        `«${ficheiro.name}» tem ${formatarTamanho(ficheiro.size)}.`,
        `O limite para uma capa é ${formatarTamanho(LIMITE_BYTES)}. Uma imagem mais pequena chega e abre mais depressa.`,
      );
      return;
    }

    definirOcupado(true);
    try {
      // Reduzir antes de enviar: o que sai daqui costuma ser um décimo do que
      // entrou, e é o mesmo que se vê no ecrã.
      const preparada = await prepararCapa(ficheiro);
      const nova = await mutar.definirCapa(idCartao, preparada);
      aoMudar(nova);
      avisar.feito(chave ? "Imagem de destaque trocada." : "Imagem de destaque adicionada.");
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error
          ? erro.message
          : "Não foi possível guardar a imagem.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function remover() {
    definirOcupado(true);
    try {
      await mutar.removerCapa(idCartao);
      aoMudar(null);
      avisar.feito("Imagem de destaque removida.");
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error
          ? erro.message
          : "Não foi possível remover a imagem.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-texto">Imagem de destaque</h3>

      {chave ? (
        <div className="overflow-hidden rounded-md border border-borda bg-superficie-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/cartoes/${idCartao}/imagem?v=${encodeURIComponent(atualizadoEm)}`}
            alt="Imagem de destaque do cartão"
            className="block max-h-64 w-full object-cover"
          />
        </div>
      ) : (
        gerivel && (
          <p className="rounded-md border border-dashed border-borda-forte px-3 py-4 text-center text-xs text-texto-tenue">
            Sem imagem. Uma capa faz o cartão encontrar-se de relance no meio da
            coluna.
          </p>
        )
      )}

      {gerivel && (
        <>
          <input
            ref={entrada}
            type="file"
            accept={TIPOS_ACEITES}
            className="sr-only"
            onChange={(evento) => {
              const ficheiro = evento.target.files?.[0];
              // Limpar já: sem isto, escolher o mesmo ficheiro outra vez não
              // dispara o evento e o botão parece avariado.
              evento.target.value = "";
              if (ficheiro) enviar(ficheiro);
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Botao
              variante="secundario"
              tamanho="pequeno"
              ocupado={ocupado}
              onClick={() => entrada.current?.click()}
            >
              {chave ? <Upload /> : <IconeImagem />}
              {ocupado
                ? "A enviar…"
                : chave
                  ? "Trocar imagem"
                  : "Adicionar imagem"}
            </Botao>

            {chave && (
              <Botao
                variante="fantasma"
                tamanho="pequeno"
                className="text-perigo"
                disabled={ocupado}
                onClick={confirmacao.abrir}
              >
                <Trash2 /> Remover
              </Botao>
            )}
          </div>
        </>
      )}

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo="Remover a imagem de destaque?"
        descricao="O cartão volta a mostrar-se só com o texto, e o ficheiro é apagado do armazenamento. Podes pôr outra a seguir."
        rotuloAcao="Remover imagem"
        perigoso
        aoConfirmar={remover}
      />
    </section>
  );
}
