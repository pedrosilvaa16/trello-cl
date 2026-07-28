"use client";

import { LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo, Grupo } from "@/components/ui/campo";
import {
  AcoesDialogo,
  CaixaDialogo,
  Dialogo,
  FecharDialogo,
} from "@/components/ui/dialogo";
import { Emblema } from "@/components/ui/emblema";
import { Vazio } from "@/components/ui/vazio";
import { CORES_QUADRO, corQuadro } from "@/lib/cores";
import * as mutar from "@/lib/quadro/mutacoes";
import { NOMES_PAPEL } from "@/lib/quadro/tipos";
import type { PapelQuadro, Quadro } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

type QuadroComPapel = Quadro & { papel: PapelQuadro; imagem: string | null };

export function ListaQuadros({ quadros }: { quadros: QuadroComPapel[] }) {
  const [novoAberto, definirNovoAberto] = React.useState(false);
  const [mostrarArquivados, definirMostrarArquivados] = React.useState(false);

  const ativos = quadros.filter((q) => !q.arquivado);
  const arquivados = quadros.filter((q) => q.arquivado);

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-texto">
          Os meus quadros
        </h1>
        <Botao
          variante="principal"
          className="ml-auto"
          onClick={() => definirNovoAberto(true)}
        >
          <Plus /> Novo quadro
        </Botao>
      </div>

      {ativos.length === 0 ? (
        <Vazio
          icone={LayoutGrid}
          titulo="Ainda não tens quadros"
          descricao="Um quadro é onde vive um projeto: listas ao lado umas das outras, cartões a passar de uma para a outra."
          acao={
            <Botao variante="principal" onClick={() => definirNovoAberto(true)}>
              <Plus /> Criar o primeiro quadro
            </Botao>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ativos.map((quadro) => (
            <CartaoQuadro key={quadro.id} quadro={quadro} />
          ))}
        </ul>
      )}

      {arquivados.length > 0 && (
        <section className="mt-8">
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            onClick={() => definirMostrarArquivados((v) => !v)}
            aria-expanded={mostrarArquivados}
          >
            {mostrarArquivados ? "Esconder" : "Mostrar"} arquivados (
            {arquivados.length})
          </Botao>

          {mostrarArquivados && (
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {arquivados.map((quadro) => (
                <CartaoQuadro key={quadro.id} quadro={quadro} />
              ))}
            </ul>
          )}
        </section>
      )}

      <DialogoNovoQuadro aberto={novoAberto} aoMudarAberto={definirNovoAberto} />
    </>
  );
}

function CartaoQuadro({ quadro }: { quadro: QuadroComPapel }) {
  return (
    <li>
      <Link
        href={`/quadro/${quadro.id}`}
        className={cn(
          "group/quadro flex h-full flex-col overflow-hidden rounded-lg border border-borda bg-superficie",
          "transition-[border-color,box-shadow] duration-[var(--duracao-rapida)]",
          "hover:border-borda-forte hover:shadow-sm",
          quadro.arquivado && "opacity-70",
        )}
      >
        {/*
          A imagem de destaque de cada cliente. Numa lista de dezanove, é ela
          que encontra o quadro certo antes de o nome ser lido — e é por isso
          que ocupa o topo do cartão em vez de ser um pormenor ao lado.
        */}
        <span
          className="relative block h-24 w-full shrink-0 overflow-hidden bg-superficie-2"
          style={
            quadro.imagem ? undefined : { backgroundColor: corQuadro(quadro.cor) }
          }
        >
          {quadro.imagem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={quadro.imagem}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-[var(--duracao-arrasto)] ease-[var(--curva)] group-hover/quadro:scale-[1.03]"
            />
          )}
        </span>

        <span className="flex flex-1 flex-col p-3">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 font-medium text-texto">
              {quadro.nome}
            </span>
            {quadro.papel !== "editor" && (
              <Emblema>{NOMES_PAPEL[quadro.papel]}</Emblema>
            )}
          </span>
          {quadro.descricao && (
            <span className="mt-1 line-clamp-2 text-sm text-texto-suave">
              {quadro.descricao}
            </span>
          )}
          {quadro.arquivado && (
            <span className="mt-2 text-xs text-texto-tenue">Arquivado</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function DialogoNovoQuadro({
  aberto,
  aoMudarAberto,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
}) {
  const router = useRouter();
  const [nome, definirNome] = React.useState("");
  const [cor, definirCor] = React.useState<string>(CORES_QUADRO[0].nome);
  const [ocupado, definirOcupado] = React.useState(false);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    const limpo = nome.trim();
    if (!limpo) return;

    definirOcupado(true);
    try {
      const quadro = await mutar.criarQuadro(limpo, cor);
      router.push(`/quadro/${quadro.id}`);
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível criar o quadro.",
      );
      definirOcupado(false);
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Novo quadro"
        descricao="Ficas admin dele e podes convidar a equipa a seguir."
      >
        <form onSubmit={criar} className="space-y-4">
          <Grupo rotulo="Nome do quadro">
            {(props) => (
              <Campo
                {...props}
                value={nome}
                onChange={(evento) => definirNome(evento.target.value)}
                placeholder="Ex.: Lançamento do site"
                maxLength={120}
                autoFocus
                required
              />
            )}
          </Grupo>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-texto-suave">
              Cor
            </legend>
            <div className="flex flex-wrap gap-2">
              {CORES_QUADRO.map((opcao) => (
                <label
                  key={opcao.nome}
                  className="cursor-pointer"
                  title={opcao.rotulo}
                >
                  <input
                    type="radio"
                    name="cor"
                    value={opcao.nome}
                    checked={cor === opcao.nome}
                    onChange={() => definirCor(opcao.nome)}
                    className="sr-only peer"
                  />
                  <span
                    className="block size-8 rounded-md ring-offset-2 ring-offset-[var(--cor-superficie)] peer-checked:ring-2 peer-checked:ring-[var(--cor-texto)] peer-focus-visible:ring-2"
                    style={{ backgroundColor: corQuadro(opcao.nome) }}
                  />
                  <span className="sr-only">{opcao.rotulo}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <AcoesDialogo>
            <FecharDialogo asChild>
              <Botao variante="fantasma" type="button">
                Cancelar
              </Botao>
            </FecharDialogo>
            <Botao type="submit" variante="principal" ocupado={ocupado}>
              Criar quadro
            </Botao>
          </AcoesDialogo>
        </form>
      </CaixaDialogo>
    </Dialogo>
  );
}
