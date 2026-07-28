"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Check, MessageSquare, Paperclip } from "lucide-react";
import * as React from "react";

import { FilaAvatares } from "@/components/ui/avatar";
import { EmblemaData, EmblemaEtiqueta } from "@/components/ui/emblema";
import { estadoData } from "@/lib/datas";
import type { CartaoCompleto, MembroComPerfil } from "@/lib/quadro/tipos";
import type { Etiqueta } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

import { estiloDaCapa, temCapa } from "./capa-cartao";

type Props = {
  cartao: CartaoCompleto;
  etiquetas: Etiqueta[];
  membros: MembroComPerfil[];
  aoAbrir: (id: string) => void;
  aoAlternarConcluido?: (id: string, concluido: boolean) => void;
  editavel?: boolean;
  aSerArrastado?: boolean;
};

export function CartaoMini({
  cartao,
  etiquetas,
  membros,
  aoAbrir,
  aoAlternarConcluido,
  editavel = false,
  aSerArrastado = false,
}: Props) {
  const doCartao = etiquetas.filter((e) => cartao.etiquetas.includes(e.id));
  const pessoas = membros
    .filter((m) => cartao.membros.includes(m.user_id))
    .map((m) => m.perfil);
  const estado = estadoData(cartao.data_limite, cartao.concluido);
  const temRodape =
    !!estado || pessoas.length > 0 || cartao.nComentarios > 0 || cartao.nAnexos > 0;

  /*
    Os dois tamanhos de capa são dois cartões diferentes, não uma variação de
    estilo. A completa ocupa tudo e leva o título por cima; a de faixa é uma
    tira no topo e o cartão continua o que era.
  */
  const comCapa = temCapa(cartao);
  const capaCompleta = comCapa && cartao.capa_tamanho === "completa";
  const capaEmFaixa = comCapa && !capaCompleta;

  if (capaCompleta) {
    return (
      <CartaoComCapaCompleta
        cartao={cartao}
        aoAbrir={aoAbrir}
        aoAlternarConcluido={aoAlternarConcluido}
        editavel={editavel}
        aSerArrastado={aSerArrastado}
      />
    );
  }

  return (
    <article
      className={cn(
        "group/cartao relative rounded-cartao border border-borda bg-superficie p-2 text-left shadow-sm",
        "transition-[border-color,box-shadow] duration-[var(--duracao-rapida)]",
        "hover:border-borda-forte",
        aSerArrastado && "rotate-1 cursor-grabbing shadow-xl",
        cartao.concluido && "opacity-70",
      )}
    >
      {/*
        Capa em faixa: uma tira no topo, a sangrar até à borda, e o cartão
        continua a ler-se por baixo. `aria-hidden` — é identidade visual, não
        informação, e quem usa leitor de ecrã não ganha nada com "imagem"
        repetido trinta vezes na coluna.
      */}
      {capaEmFaixa && (
        <div
          className="-mx-2 -mt-2 mb-2 h-12 overflow-hidden rounded-t-cartao bg-superficie-2"
          style={estiloDaCapa(cartao)}
        >
          {cartao.capa_anexo_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/anexos/${cartao.capa_anexo_id}`}
              alt=""
              aria-hidden
              loading="lazy"
              className="block size-full object-cover"
            />
          )}
        </div>
      )}

      {doCartao.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {doCartao.map((etiqueta) => (
            <EmblemaEtiqueta key={etiqueta.id} etiqueta={etiqueta} compacta />
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {editavel && aoAlternarConcluido && (
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              aoAlternarConcluido(cartao.id, !cartao.concluido);
            }}
            aria-pressed={cartao.concluido}
            aria-label={
              cartao.concluido
                ? `Marcar «${cartao.titulo}» como por fazer`
                : `Marcar «${cartao.titulo}» como concluído`
            }
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
              cartao.concluido
                ? "border-sucesso bg-[var(--cor-sucesso)] text-white"
                : "border-borda-forte opacity-0 group-hover/cartao:opacity-100 focus-visible:opacity-100",
            )}
          >
            {cartao.concluido && <Check className="size-3" aria-hidden />}
          </button>
        )}

        {/* O botão cobre o cartão todo, mas fica por baixo dos controlos. */}
        <button
          type="button"
          onClick={() => aoAbrir(cartao.id)}
          className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-['']"
        >
          <span
            className={cn(
              "block text-sm leading-snug text-texto",
              cartao.concluido && "line-through decoration-texto-tenue",
            )}
          >
            {cartao.titulo}
          </span>
        </button>
      </div>

      {temRodape && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {estado && cartao.data_limite && (
            <EmblemaData dataLimite={cartao.data_limite} estado={estado} />
          )}

          {cartao.descricao && (
            <AlignLeft
              className="size-3.5 text-texto-tenue"
              aria-label="Tem descrição"
            />
          )}

          {cartao.nComentarios > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-texto-tenue"
              data-numerico
            >
              <MessageSquare className="size-3.5" aria-hidden />
              <span className="sr-only">Comentários: </span>
              {cartao.nComentarios}
            </span>
          )}

          {cartao.nAnexos > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-texto-tenue"
              data-numerico
            >
              <Paperclip className="size-3.5" aria-hidden />
              <span className="sr-only">Anexos: </span>
              {cartao.nAnexos}
            </span>
          )}

          {pessoas.length > 0 && (
            <span className="ml-auto">
              <FilaAvatares perfis={pessoas} maximo={3} />
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * O cartão com capa completa: a imagem (ou a cor) é o cartão, e o título vai
 * por cima.
 *
 * As etiquetas e o rodapé não aparecem — é a troca que se faz de propósito ao
 * escolher este tamanho, e é o que a Trello faz. Quem precisa das datas e dos
 * contadores de relance usa a capa em faixa; quem escolhe esta quer a imagem.
 *
 * O `min-h` garante que uma capa de cor, que não tem imagem a dar-lhe altura,
 * continua a ser um retângulo com presença e não uma linha de texto colorida.
 */
function CartaoComCapaCompleta({
  cartao,
  aoAbrir,
  aoAlternarConcluido,
  editavel,
  aSerArrastado,
}: {
  cartao: CartaoCompleto;
  aoAbrir: (id: string) => void;
  aoAlternarConcluido?: (id: string, concluido: boolean) => void;
  editavel: boolean;
  aSerArrastado: boolean;
}) {
  const claro = cartao.capa_texto === "claro";

  return (
    <article
      className={cn(
        "group/cartao relative min-h-24 overflow-hidden rounded-cartao border border-borda text-left shadow-sm",
        "transition-[border-color,box-shadow] duration-[var(--duracao-rapida)]",
        "hover:border-borda-forte",
        aSerArrastado && "rotate-1 cursor-grabbing shadow-xl",
        cartao.concluido && "opacity-70",
      )}
      style={estiloDaCapa(cartao)}
    >
      {cartao.capa_anexo_id && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/anexos/${cartao.capa_anexo_id}`}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      )}

      {/*
        O véu existe para o título se ler sobre uma fotografia qualquer. Sem
        ele, o contraste depende da imagem que alguém escolheu — que é o mesmo
        que não haver contraste garantido nenhum.
      */}
      {cartao.capa_anexo_id && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0",
            claro
              ? "bg-gradient-to-t from-black/70 via-black/25 to-transparent"
              : "bg-gradient-to-t from-white/75 via-white/30 to-transparent",
          )}
        />
      )}

      <div className="relative flex min-h-24 items-end gap-1.5 p-2">
        {editavel && aoAlternarConcluido && (
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              aoAlternarConcluido(cartao.id, !cartao.concluido);
            }}
            aria-pressed={cartao.concluido}
            aria-label={
              cartao.concluido
                ? `Marcar «${cartao.titulo}» como por fazer`
                : `Marcar «${cartao.titulo}» como concluído`
            }
            className={cn(
              "mb-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
              cartao.concluido
                ? "border-sucesso bg-[var(--cor-sucesso)] text-white"
                : cn(
                    "opacity-0 group-hover/cartao:opacity-100 focus-visible:opacity-100",
                    claro ? "border-white/80" : "border-black/50",
                  ),
            )}
          >
            {cartao.concluido && <Check className="size-3" aria-hidden />}
          </button>
        )}

        <button
          type="button"
          onClick={() => aoAbrir(cartao.id)}
          className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-['']"
        >
          <span
            className={cn(
              "block text-sm leading-snug font-semibold",
              claro ? "text-white" : "text-[#172b4d]",
              cartao.concluido && "line-through",
            )}
          >
            {cartao.titulo}
          </span>
        </button>
      </div>
    </article>
  );
}

/** O mesmo cartão, agarrável. Separado para o DragOverlay poder usar o outro. */
export function CartaoArrastavel(props: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.cartao.id,
    data: { tipo: "cartao", nome: props.cartao.titulo },
    disabled: !props.editavel,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }}
      className={cn(
        "touch-manipulation",
        isDragging && "opacity-40",
        props.editavel && "cursor-grab active:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
    >
      <CartaoMini {...props} />
    </div>
  );
}
