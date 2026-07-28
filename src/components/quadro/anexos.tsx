"use client";

import {
  Download,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { dataCompleta, haQuantoTempo } from "@/lib/datas";
import * as mutar from "@/lib/quadro/mutacoes";
import type { AnexoComAutor } from "@/lib/quadro/tipos";
import type { Perfil } from "@/lib/supabase/tipos";
import { formatarTamanho } from "@/lib/utils";

/** 200 MB — o mesmo limite que a restrição da tabela impõe. */
const LIMITE_BYTES = 200 * 1024 * 1024;

export function Anexos({
  idCartao,
  utilizador,
  editavel,
  aoMudarTotal,
}: {
  idCartao: string;
  utilizador: Perfil;
  editavel: boolean;
  aoMudarTotal: (total: number) => void;
}) {
  const [anexos, definirAnexos] = React.useState<AnexoComAutor[]>([]);
  const [aCarregar, definirACarregar] = React.useState(true);
  const [aEnviar, definirAEnviar] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);

  // Ver a nota em comentarios.tsx: a instância é nova a cada cartão.
  React.useEffect(() => {
    let vivo = true;
    mutar
      .listarAnexos(idCartao)
      .then((lista) => {
        if (!vivo) return;
        definirAnexos(lista);
        aoMudarTotal(lista.length);
      })
      .catch(() => avisar.falhou("Não foi possível ler os anexos."))
      .finally(() => vivo && definirACarregar(false));
    return () => {
      vivo = false;
    };
  }, [idCartao, aoMudarTotal]);

  /**
   * O ficheiro vai do browser direto para o R2.
   *
   * O servidor não vê o ficheiro: confirma a permissão, decide a chave do
   * objeto e devolve um URL de escrita. É o que permite anexar 200 MB sem
   * esbarrar no limite de corpo de pedido de uma função serverless — e as
   * credenciais do R2 nunca saem do servidor.
   */
  async function enviar(ficheiro: File) {
    if (ficheiro.size > LIMITE_BYTES) {
      avisar.falhou(
        `«${ficheiro.name}» tem ${formatarTamanho(ficheiro.size)}.`,
        `O limite por ficheiro é ${formatarTamanho(LIMITE_BYTES)}.`,
      );
      return;
    }

    definirAEnviar(true);
    const tipoMime = ficheiro.type || "application/octet-stream";

    try {
      const autorizacao = await fetch("/api/anexos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartao: idCartao,
          nomeFicheiro: ficheiro.name.slice(0, 255),
          tamanho: ficheiro.size,
          tipoMime,
        }),
      });

      if (!autorizacao.ok) {
        const corpo = await autorizacao.json().catch(() => ({}));
        throw new Error(
          corpo.erro ??
            "O envio foi recusado. Confirma que ainda tens permissão de escrita neste quadro.",
        );
      }

      const { id, chave, url } = await autorizacao.json();

      const envio = await fetch(url, {
        method: "PUT",
        body: ficheiro,
        headers: { "Content-Type": tipoMime },
      });
      if (!envio.ok) {
        throw new Error("O ficheiro não chegou ao armazenamento. Tenta outra vez.");
      }

      const anexo = await mutar.registarAnexo({
        id,
        card_id: idCartao,
        nome_ficheiro: ficheiro.name.slice(0, 255),
        caminho_storage: chave,
        tamanho_bytes: ficheiro.size,
        tipo_mime: tipoMime,
        carregado_por: utilizador.id,
      });

      definirAnexos((atuais) => {
        const novos = [anexo, ...atuais];
        aoMudarTotal(novos.length);
        return novos;
      });
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível anexar.",
      );
    } finally {
      definirAEnviar(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover(anexo: AnexoComAutor) {
    try {
      // A rota apaga a linha (que passa por RLS) e só depois o objeto no R2.
      // As credenciais do R2 não existem do lado do cliente.
      const resposta = await fetch(`/api/anexos/${anexo.id}`, { method: "DELETE" });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro ?? "Não foi possível remover.");
      }
      definirAnexos((atuais) => {
        const novos = atuais.filter((a) => a.id !== anexo.id);
        aoMudarTotal(novos.length);
        return novos;
      });
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível remover.",
      );
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-texto">
        <Paperclip className="size-4 text-texto-tenue" aria-hidden />
        Anexos
        {anexos.length > 0 && (
          <span className="text-texto-tenue" data-numerico>
            {anexos.length}
          </span>
        )}
      </h3>

      {editavel && (
        <>
          <input
            ref={entrada}
            type="file"
            className="sr-only"
            onChange={(evento) => {
              const ficheiro = evento.target.files?.[0];
              if (ficheiro) void enviar(ficheiro);
            }}
          />
          <Botao
            variante="secundario"
            tamanho="pequeno"
            ocupado={aEnviar}
            onClick={() => entrada.current?.click()}
          >
            <Upload /> {aEnviar ? "A enviar…" : "Anexar ficheiro"}
          </Botao>
        </>
      )}

      {aCarregar ? (
        <p className="text-sm text-texto-tenue">A carregar…</p>
      ) : anexos.length === 0 ? (
        <p className="text-sm text-texto-tenue">Sem anexos.</p>
      ) : (
        <ul className="space-y-2">
          {anexos.map((anexo) => (
            <LinhaAnexo
              key={anexo.id}
              anexo={anexo}
              editavel={editavel}
              aoRemover={() => remover(anexo)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaAnexo({
  anexo,
  editavel,
  aoRemover,
}: {
  anexo: AnexoComAutor;
  editavel: boolean;
  aoRemover: () => void;
}) {
  const confirmacao = useConfirmacao();

  // Um anexo é ficheiro no bucket ou ligação para fora — nunca os dois.
  // A ligação aponta direto ao destino; só o ficheiro passa pela rota que
  // assina o URL depois de confirmar a permissão.
  const eLigacao = !!anexo.url;
  const eImagem = !eLigacao && anexo.tipo_mime.startsWith("image/");
  const destino = eLigacao ? anexo.url! : `/api/anexos/${anexo.id}`;
  const quem = anexo.autor?.nome ?? anexo.carregado_por_externo;

  return (
    <li className="flex items-center gap-3 rounded-md border border-borda p-2">
      <a
        href={destino}
        target="_blank"
        rel={eLigacao ? "noreferrer noopener" : "noreferrer"}
        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded bg-superficie-2"
        aria-label={`Abrir ${anexo.nome_ficheiro}`}
      >
        {eImagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/anexos/${anexo.id}`}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : eLigacao ? (
          <LinkIcon className="size-5 text-texto-tenue" aria-hidden />
        ) : (
          <FileText className="size-5 text-texto-tenue" aria-hidden />
        )}
      </a>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-texto">
          {anexo.nome_ficheiro}
        </p>
        <p className="truncate text-xs text-texto-tenue">
          {eLigacao ? (
            <span title={anexo.url!}>{anfitriao(anexo.url!)}</span>
          ) : (
            <span data-numerico>{formatarTamanho(anexo.tamanho_bytes ?? 0)}</span>
          )}
          {" · "}
          <time
            dateTime={anexo.criado_em}
            title={dataCompleta(anexo.criado_em)}
          >
            {haQuantoTempo(anexo.criado_em)}
          </time>
          {quem && ` · ${quem}`}
        </p>
      </div>

      {!eLigacao && (
        <Botao
          comoFilho
          variante="fantasma"
          tamanho="iconePequeno"
          aria-label={`Descarregar ${anexo.nome_ficheiro}`}
        >
          <a href={`/api/anexos/${anexo.id}?descarregar`}>
            <Download />
          </a>
        </Botao>
      )}

      {editavel && (
        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          onClick={confirmacao.abrir}
          aria-label={`Remover ${anexo.nome_ficheiro}`}
        >
          <Trash2 />
        </Botao>
      )}

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo={`Remover «${anexo.nome_ficheiro}»?`}
        descricao={
          eLigacao
            ? "A ligação é retirada do cartão. O que está do outro lado não é tocado."
            : "O ficheiro é apagado do armazenamento e não há como o recuperar."
        }
        rotuloAcao="Remover anexo"
        perigoso
        aoConfirmar={aoRemover}
      />
    </li>
  );
}

/** "www.canva.com/design/..." → "canva.com". O destino em duas palavras. */
function anfitriao(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
