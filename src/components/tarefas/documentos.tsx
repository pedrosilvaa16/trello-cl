"use client";

import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { LIMITE_BYTES } from "@/lib/limites";
import * as escrever from "@/lib/tarefas/mutacoes";
import type { AnexoTarefa } from "@/lib/supabase/tipos";
import { dataCompleta, haQuantoTempo } from "@/lib/datas";
import { cn, formatarTamanho } from "@/lib/utils";

/**
 * Os documentos de uma tarefa.
 *
 * Carregam-se por instância — a `key` com o id da tarefa, posta por quem monta
 * o painel, é o que faz mudar de tarefa trazer uma lista nova em vez de mostrar
 * a da tarefa anterior enquanto a certa não chega.
 *
 * O ficheiro vai do browser direto para o R2. O servidor não o vê: confirma a
 * permissão, decide a chave do objeto e devolve um URL de escrita de validade
 * curta. É o que permite 200 MB sem esbarrar no limite de corpo de pedido de
 * uma função serverless, e é o que mantém as credenciais do R2 do lado de lá.
 */
export function Documentos({
  idTarefa,
  idPessoa,
}: {
  idTarefa: string;
  idPessoa: string;
}) {
  const [anexos, definirAnexos] = React.useState<AnexoTarefa[]>([]);
  const [aCarregar, definirACarregar] = React.useState(true);
  const [aEnviar, definirAEnviar] = React.useState(false);
  const [aArrastar, definirAArrastar] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let vivo = true;
    escrever
      .listarAnexos(idTarefa)
      .then((lista) => vivo && definirAnexos(lista))
      .catch(() => vivo && avisar.falhou("Não foi possível ler os documentos."))
      .finally(() => vivo && definirACarregar(false));
    return () => {
      vivo = false;
    };
  }, [idTarefa]);

  async function enviar(ficheiros: FileList | File[]) {
    const lista = [...ficheiros];
    if (lista.length === 0) return;

    definirAEnviar(true);
    try {
      for (const ficheiro of lista) {
        if (ficheiro.size > LIMITE_BYTES) {
          avisar.falhou(
            `«${ficheiro.name}» tem ${formatarTamanho(ficheiro.size)}.`,
            `O limite por ficheiro é ${formatarTamanho(LIMITE_BYTES)}.`,
          );
          continue;
        }
        try {
          const novo = await escrever.enviarAnexo(idTarefa, ficheiro, idPessoa);
          // À cabeça: a lista vem da mais recente para a mais antiga.
          definirAnexos((atuais) => [novo, ...atuais]);
        } catch (erro) {
          avisar.falhou(
            `Não foi possível anexar «${ficheiro.name}».`,
            erro instanceof Error ? erro.message : undefined,
          );
        }
      }
    } finally {
      definirAEnviar(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <section
      onDragOver={(evento) => {
        evento.preventDefault();
        definirAArrastar(true);
      }}
      onDragLeave={() => definirAArrastar(false)}
      onDrop={(evento) => {
        evento.preventDefault();
        definirAArrastar(false);
        void enviar(evento.dataTransfer.files);
      }}
    >
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
        Documentos
        {anexos.length > 0 && (
          <span data-numerico className="font-normal">
            {anexos.length}
          </span>
        )}
      </h3>

      {aCarregar ? (
        <p className="text-sm text-texto-tenue">A ler os documentos…</p>
      ) : (
        <>
          {anexos.length > 0 && (
            <ul className="mb-2 space-y-1">
              {anexos.map((anexo) => (
                <LinhaDocumento
                  key={anexo.id}
                  anexo={anexo}
                  aoRemover={() =>
                    definirAnexos((atuais) =>
                      atuais.filter((a) => a.id !== anexo.id),
                    )
                  }
                />
              ))}
            </ul>
          )}

          <input
            ref={entrada}
            type="file"
            multiple
            className="sr-only"
            onChange={(evento) =>
              evento.target.files && void enviar(evento.target.files)
            }
          />

          <Botao
            variante="secundario"
            tamanho="pequeno"
            className={cn(
              "w-full justify-start font-normal text-texto-suave",
              aArrastar && "border-principal bg-principal-tenue text-texto",
            )}
            ocupado={aEnviar}
            onClick={() => entrada.current?.click()}
          >
            {aEnviar ? (
              "A enviar…"
            ) : (
              <>
                <Upload />
                {aArrastar ? "Larga para anexar" : "Anexar documento"}
              </>
            )}
          </Botao>
        </>
      )}
    </section>
  );
}

function LinhaDocumento({
  anexo,
  aoRemover,
}: {
  anexo: AnexoTarefa;
  aoRemover: () => void;
}) {
  const confirmacao = useConfirmacao();
  const [ocupado, definirOcupado] = React.useState(false);

  async function remover() {
    definirOcupado(true);
    try {
      await escrever.removerAnexo(anexo.id);
      aoRemover();
    } catch (erro) {
      avisar.falhou(
        "Não foi possível remover o documento.",
        erro instanceof Error ? erro.message : undefined,
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <li className="group flex items-center gap-2 rounded-md border border-borda px-2 py-1.5">
      <FileText className="size-4 shrink-0 text-texto-tenue" aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-texto">
          {anexo.nome_ficheiro}
        </span>
        <span className="block text-xs text-texto-tenue">
          <span data-numerico>{formatarTamanho(anexo.tamanho_bytes)}</span>
          {" · "}
          <time dateTime={anexo.criado_em} title={dataCompleta(anexo.criado_em)}>
            {haQuantoTempo(anexo.criado_em)}
          </time>
        </span>
      </span>

      {/*
        Uma ligação e não um botão: descarregar é navegar para um sítio, e é o
        que faz o clique do meio e o «guardar como» do menu de contexto
        funcionarem como toda a gente espera.
      */}
      <a
        href={`/api/tarefas/anexos/${anexo.id}?descarregar`}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
          "text-texto-suave transition-colors duration-[var(--duracao-rapida)]",
          "hover:bg-superficie-2 hover:text-texto",
        )}
        aria-label={`Descarregar ${anexo.nome_ficheiro}`}
        title="Descarregar"
      >
        <Download className="size-4" aria-hidden />
      </a>

      <Botao
        variante="fantasma"
        tamanho="iconePequeno"
        onClick={confirmacao.abrir}
        ocupado={ocupado}
        aria-label={`Remover ${anexo.nome_ficheiro}`}
        title="Remover"
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 />
      </Botao>

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo="Remover este documento?"
        descricao={`«${anexo.nome_ficheiro}» é apagado do armazenamento e isto não se desfaz.`}
        rotuloAcao="Remover documento"
        perigoso
        aoConfirmar={remover}
      />
    </li>
  );
}

/** Ícone da secção, para quem a quiser anunciar noutro sítio. */
export const IconeDocumentos = Paperclip;
