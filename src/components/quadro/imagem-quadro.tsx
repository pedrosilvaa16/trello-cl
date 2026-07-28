"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import { corQuadro } from "@/lib/cores";
import { prepararImagemDoQuadro } from "@/lib/imagens";
import { cn } from "@/lib/utils";

/** 15 MB à entrada — o mesmo limite que a rota impõe. */
const LIMITE_BYTES = 15 * 1024 * 1024;

/**
 * A imagem do quadro: pôr, trocar e tirar.
 *
 * Até aqui só se punha por script (`npm run fundos:r2`), a partir da
 * exportação da Trello. Isto é o mesmo trabalho sem abrir um terminal.
 *
 * São duas versões da mesma fotografia — o fundo do quadro e a miniatura da
 * lista — feitas no browser antes de subirem. É também aí que se decide se a
 * imagem é clara ou escura, que é o que a interface usa para escolher o véu de
 * contraste por cima dela.
 */
export function ImagemDoQuadro({
  aberto,
  aoMudarAberto,
  idQuadro,
  nomeQuadro,
  cor,
  imagemAtual,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  idQuadro: string;
  nomeQuadro: string;
  cor: string;
  /** O URL já assinado da imagem atual, ou nulo. Só para pré-visualizar. */
  imagemAtual: string | null;
}) {
  const router = useRouter();
  const [ocupado, definirOcupado] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);
  const confirmacao = useConfirmacao();

  async function enviar(ficheiro: File) {
    if (ficheiro.size > LIMITE_BYTES) {
      avisar.falhou(
        `«${ficheiro.name}» é grande de mais.`,
        "O limite são 15 MB. Uma fotografia de 2000px de largura chega e sobra.",
      );
      return;
    }

    definirOcupado(true);
    try {
      const preparada = await prepararImagemDoQuadro(ficheiro);

      const autorizacao = await pedir(`/api/quadros/${idQuadro}/imagem`, {
        method: "POST",
        body: JSON.stringify({
          nomeFicheiro: preparada.nomeFicheiro,
          tipoMime: preparada.tipoMime,
          tamanhoFundo: preparada.fundo.size,
          tamanhoMiniatura: preparada.miniatura.size,
        }),
      });

      // As duas ao mesmo tempo: são independentes e o utilizador está à espera.
      await Promise.all([
        subir(autorizacao.fundo.url, preparada.fundo, preparada.tipoMime),
        subir(autorizacao.miniatura.url, preparada.miniatura, preparada.tipoMime),
      ]);

      await pedir(`/api/quadros/${idQuadro}/imagem`, {
        method: "PUT",
        body: JSON.stringify({
          fundo: autorizacao.fundo.chave,
          miniatura: autorizacao.miniatura.chave,
          brilho: preparada.brilho,
        }),
      });

      avisar.feito(
        imagemAtual ? "Imagem do quadro trocada." : "Imagem do quadro definida.",
        preparada.brilho === "claro"
          ? "A imagem é clara — o texto por cima passa a escuro."
          : "A imagem é escura — o texto por cima passa a claro.",
      );
      aoMudarAberto(false);
      // O URL assinado é gerado no servidor, ao desenhar a página.
      router.refresh();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível guardar a imagem.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function remover() {
    definirOcupado(true);
    try {
      await pedir(`/api/quadros/${idQuadro}/imagem`, { method: "DELETE" });
      avisar.feito("Imagem removida.", "O quadro volta a mostrar-se com a cor.");
      aoMudarAberto(false);
      router.refresh();
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível remover.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Imagem do quadro"
        descricao={`A fotografia que identifica «${nomeQuadro}» na lista de quadros e no fundo do próprio quadro.`}
      >
        <div
          className={cn(
            "mb-4 aspect-[16/9] w-full overflow-hidden rounded-lg border border-borda",
            "grid place-items-center",
          )}
          style={imagemAtual ? undefined : { backgroundColor: corQuadro(cor) }}
        >
          {imagemAtual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagemAtual}
              alt="Imagem atual do quadro"
              className="size-full object-cover"
            />
          ) : (
            <p className="px-4 text-center text-xs text-white/80">
              Sem imagem. O quadro mostra-se com a cor.
            </p>
          )}
        </div>

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

        <div className="flex flex-wrap gap-2">
          <Botao
            variante="principal"
            ocupado={ocupado}
            onClick={() => entrada.current?.click()}
          >
            <Upload />
            {ocupado
              ? "A enviar…"
              : imagemAtual
                ? "Trocar imagem"
                : "Escolher imagem"}
          </Botao>

          {imagemAtual && (
            <Botao
              variante="fantasma"
              className="text-perigo"
              disabled={ocupado}
              onClick={confirmacao.abrir}
            >
              <Trash2 /> Remover
            </Botao>
          )}
        </div>

        <p className="mt-3 text-xs text-texto-tenue">
          A imagem é reduzida no browser antes de subir, em duas versões: uma
          para o fundo e uma para a miniatura da lista. Fica guardada em
          privado, como os anexos.
        </p>
      </CaixaDialogo>

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo="Remover a imagem do quadro?"
        descricao="O quadro volta a mostrar-se com a cor, na lista e no fundo. O ficheiro é apagado do armazenamento. Podes pôr outra a seguir."
        rotuloAcao="Remover imagem"
        perigoso
        aoConfirmar={remover}
      />
    </Dialogo>
  );
}

async function subir(url: string, ficheiro: Blob, tipoMime: string) {
  const resposta = await fetch(url, {
    method: "PUT",
    body: ficheiro,
    headers: { "Content-Type": tipoMime },
  });
  if (!resposta.ok) {
    throw new Error("A imagem não chegou ao armazenamento. Tenta outra vez.");
  }
}

/** As rotas respondem sempre `{ erro }` com uma mensagem escrita para ser lida. */
async function pedir(caminho: string, opcoes: RequestInit) {
  const resposta = await fetch(caminho, {
    headers: { "Content-Type": "application/json" },
    ...opcoes,
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(corpo.erro ?? "Não foi possível concluir a operação.");
  }
  return corpo;
}
