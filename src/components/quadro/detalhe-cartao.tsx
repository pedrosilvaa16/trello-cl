"use client";

import {
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  KeyRound,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import * as React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Avatar } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { Dialogo, PainelLateral } from "@/components/ui/dialogo";
import { EmblemaData, EmblemaEtiqueta } from "@/components/ui/emblema";
import {
  AbrirPopover,
  ConteudoPopover,
  Popover,
} from "@/components/ui/popover";
import { estadoData, paraCampoLocal, deCampoLocal } from "@/lib/datas";
import type { AccaoQuadro, EstadoQuadro } from "@/lib/quadro/estado";
import * as mutar from "@/lib/quadro/mutacoes";
import { podeComentar, podeEditar, type CartaoCompleto } from "@/lib/quadro/tipos";
import type { PapelQuadro, Perfil } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

import { Anexos } from "./anexos";
import { IconeImagem, PainelCapa, estiloDaCapa, temCapa } from "./capa-cartao";
import { Comentarios } from "./comentarios";
import { Compositor } from "./compositor";
import { AcessosCartao } from "./acessos-cartao";
import { GestorEtiquetas, SeletorEtiquetas } from "./etiquetas";

export function DetalheCartao({
  cartao,
  estado,
  papel,
  utilizador,
  despachar,
  aoFechar,
}: {
  cartao: CartaoCompleto;
  estado: EstadoQuadro;
  papel: PapelQuadro;
  utilizador: Perfil;
  despachar: React.Dispatch<AccaoQuadro>;
  aoFechar: () => void;
}) {
  const editavel = podeEditar(papel);
  /*
    O comentador é o caso próprio do modelo: lê tudo, comenta, e não mexe em
    mais nada. Sem esta distinção, um cliente abria o cartão dele e não tinha
    onde responder — que é precisamente a única coisa que se lhe pede.
  */
  const comentavel = podeComentar(papel);
  const [aEditarTitulo, definirAEditarTitulo] = React.useState(false);
  const [aEditarDescricao, definirAEditarDescricao] = React.useState(false);
  const [gerirEtiquetas, definirGerirEtiquetas] = React.useState(false);
  const [gerirAcessos, definirGerirAcessos] = React.useState(false);
  const [aCapa, definirACapa] = React.useState(false);
  const confirmacao = useConfirmacao();

  const lista = estado.listas.find((l) => l.id === cartao.list_id);
  const etiquetasDoCartao = estado.etiquetas.filter((e) =>
    cartao.etiquetas.includes(e.id),
  );
  const pessoas = estado.membros.filter((m) => cartao.membros.includes(m.user_id));
  const estadoDoPrazo = estadoData(cartao.data_limite, cartao.concluido);

  /*
    As contagens que o cartão mostra no quadro vêm de quem as carregou. Estáveis
    de propósito: são dependência dos efeitos que carregam anexos e comentários,
    e uma função nova a cada render punha esses efeitos a correr em ciclo.
  */
  const idCartao = cartao.id;
  const anotarAnexos = React.useCallback(
    (nAnexos: number) =>
      despachar({ tipo: "cartao:alterar", id: idCartao, campos: { nAnexos } }),
    [despachar, idCartao],
  );
  const anotarComentarios = React.useCallback(
    (nComentarios: number) =>
      despachar({
        tipo: "cartao:alterar",
        id: idCartao,
        campos: { nComentarios },
      }),
    [despachar, idCartao],
  );

  /**
   * Guarda um campo do cartão, com recuo se o servidor recusar.
   *
   * O tipo é o do UPDATE e não `Partial<CartaoCompleto>`: `nComentarios` e
   * `nAnexos` vivem só em memória e não são colunas — enviá-las daria erro.
   */
  async function guardar(campos: mutar.AtualizarCartao) {
    const anterior = Object.fromEntries(
      Object.keys(campos).map((chave) => [
        chave,
        cartao[chave as keyof CartaoCompleto],
      ]),
    ) as Partial<CartaoCompleto>;

    despachar({ tipo: "cartao:alterar", id: cartao.id, campos });
    try {
      await mutar.alterarCartao(cartao.id, campos);
    } catch (erro) {
      despachar({ tipo: "cartao:alterar", id: cartao.id, campos: anterior });
      avisar.falhou(msg(erro));
    }
  }

  async function alternarEtiqueta(idEtiqueta: string, ligar: boolean) {
    despachar({
      tipo: "cartao:etiqueta",
      cartao: cartao.id,
      etiqueta: idEtiqueta,
      ligar,
    });
    try {
      if (ligar) await mutar.ligarEtiqueta(cartao.id, idEtiqueta);
      else await mutar.desligarEtiqueta(cartao.id, idEtiqueta);
    } catch (erro) {
      despachar({
        tipo: "cartao:etiqueta",
        cartao: cartao.id,
        etiqueta: idEtiqueta,
        ligar: !ligar,
      });
      avisar.falhou(msg(erro));
    }
  }

  async function alternarMembro(idUtilizador: string, ligar: boolean) {
    despachar({
      tipo: "cartao:membro",
      cartao: cartao.id,
      utilizador: idUtilizador,
      ligar,
    });
    try {
      if (ligar) await mutar.ligarMembro(cartao.id, idUtilizador);
      else await mutar.desligarMembro(cartao.id, idUtilizador);
    } catch (erro) {
      despachar({
        tipo: "cartao:membro",
        cartao: cartao.id,
        utilizador: idUtilizador,
        ligar: !ligar,
      });
      avisar.falhou(msg(erro));
    }
  }

  async function apagar() {
    try {
      await mutar.apagarCartao(cartao.id);
      despachar({ tipo: "cartao:remover", id: cartao.id });
      aoFechar();
    } catch (erro) {
      avisar.falhou(msg(erro));
    }
  }

  return (
    <Dialogo open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <PainelLateral titulo={cartao.titulo}>
        {/* Cabeçalho */}
        <header className="flex items-start gap-2 border-b border-borda px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-texto-tenue">
              {estado.quadro.nome}
              {lista && <> · {lista.nome}</>}
            </p>
          </div>
          {/*
            A capa é de quem gere o quadro, e não de quem edita o cartão — é
            identidade visual, e a decisão está registada na migração
            20260728190000. Quem não gere vê a capa e não vê este botão.
          */}
          {papel === "gestor" && (
            <Popover open={aCapa} onOpenChange={definirACapa}>
              <AbrirPopover asChild>
                <Botao
                  variante="fantasma"
                  tamanho="iconePequeno"
                  aria-label="Capa do cartão"
                >
                  <IconeImagem />
                </Botao>
              </AbrirPopover>
              <ConteudoPopover align="end">
                <PainelCapa
                  idCartao={cartao.id}
                  capa={cartao}
                  utilizadorId={utilizador.id}
                  aoAnexar={() =>
                    despachar({
                      tipo: "cartao:alterar",
                      id: cartao.id,
                      campos: { nAnexos: cartao.nAnexos + 1 },
                    })
                  }
                  aoMudar={(capa) =>
                    despachar({
                      tipo: "cartao:alterar",
                      id: cartao.id,
                      campos: capa,
                    })
                  }
                  aoFechar={() => definirACapa(false)}
                />
              </ConteudoPopover>
            </Popover>
          )}

          <Botao
            variante="fantasma"
            tamanho="iconePequeno"
            onClick={aoFechar}
            aria-label="Fechar o cartão"
          >
            <X />
          </Botao>
        </header>

        {/* A capa, à cabeça do painel: é o que ela é no quadro, e é onde se
            espera vê-la ao abrir o cartão. */}
        {temCapa(cartao) && (
          <div
            className="h-32 shrink-0 overflow-hidden bg-superficie-2"
            style={estiloDaCapa(cartao)}
          >
            {cartao.capa_anexo_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/anexos/${cartao.capa_anexo_id}`}
                alt="Capa do cartão"
                className="size-full object-cover"
              />
            )}
          </div>
        )}

        <div className="barra-fina min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {/* Título */}
          <div className="flex items-start gap-2">
            {editavel && (
              <button
                type="button"
                onClick={() => guardar({ concluido: !cartao.concluido })}
                aria-pressed={cartao.concluido}
                className={cn(
                  "mt-1 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                  cartao.concluido
                    ? "border-sucesso bg-[var(--cor-sucesso)] text-white"
                    : "border-borda-forte hover:border-[var(--cor-texto-tenue)]",
                )}
              >
                {cartao.concluido && <Check className="size-3.5" aria-hidden />}
                <span className="sr-only">
                  {cartao.concluido
                    ? "Marcar como por fazer"
                    : "Marcar como concluído"}
                </span>
              </button>
            )}

            <div className="min-w-0 flex-1">
              {aEditarTitulo ? (
                <Compositor
                  valorInicial={cartao.titulo}
                  placeholder="Título do cartão"
                  rotuloGuardar="Guardar título"
                  aoGuardar={(titulo) => guardar({ titulo })}
                  aoFechar={() => definirAEditarTitulo(false)}
                />
              ) : (
                <h2
                  className={cn(
                    "text-lg leading-snug font-semibold text-texto",
                    cartao.concluido && "line-through decoration-texto-tenue",
                  )}
                >
                  <button
                    type="button"
                    className="max-w-full text-left break-words disabled:cursor-default"
                    onClick={() => editavel && definirAEditarTitulo(true)}
                    disabled={!editavel}
                  >
                    {cartao.titulo}
                  </button>
                </h2>
              )}
            </div>
          </div>

          {/* Etiquetas, data e membros */}
          <div className="flex flex-wrap items-start gap-4">
            <Campo titulo="Etiquetas">
              <div className="flex flex-wrap items-center gap-1">
                {etiquetasDoCartao.map((etiqueta) => (
                  <EmblemaEtiqueta key={etiqueta.id} etiqueta={etiqueta} />
                ))}
                {editavel && (
                  <Popover>
                    <AbrirPopover asChild>
                      <Botao
                        variante="secundario"
                        tamanho="iconePequeno"
                        aria-label="Escolher etiquetas"
                      >
                        <Tag />
                      </Botao>
                    </AbrirPopover>
                    <ConteudoPopover titulo="Etiquetas">
                      <SeletorEtiquetas
                        etiquetas={estado.etiquetas}
                        selecionadas={cartao.etiquetas}
                        aoAlternar={alternarEtiqueta}
                        aoGerir={() => definirGerirEtiquetas(true)}
                      />
                    </ConteudoPopover>
                  </Popover>
                )}
                {etiquetasDoCartao.length === 0 && !editavel && (
                  <span className="text-sm text-texto-tenue">—</span>
                )}
              </div>
            </Campo>

            <Campo titulo="Data-limite">
              <div className="flex flex-wrap items-center gap-1">
                {cartao.data_limite && estadoDoPrazo && (
                  <EmblemaData
                    dataLimite={cartao.data_limite}
                    estado={estadoDoPrazo}
                  />
                )}
                {editavel && (
                  <Popover>
                    <AbrirPopover asChild>
                      <Botao
                        variante="secundario"
                        tamanho="iconePequeno"
                        aria-label="Definir data-limite"
                      >
                        <Calendar />
                      </Botao>
                    </AbrirPopover>
                    <ConteudoPopover titulo="Data-limite">
                      <SeletorData
                        valor={cartao.data_limite}
                        aoMudar={(data_limite) => guardar({ data_limite })}
                      />
                    </ConteudoPopover>
                  </Popover>
                )}
                {!cartao.data_limite && !editavel && (
                  <span className="text-sm text-texto-tenue">—</span>
                )}
              </div>
            </Campo>

            <Campo titulo="Membros">
              <div className="flex flex-wrap items-center gap-1">
                {pessoas.map((membro) => (
                  <button
                    key={membro.user_id}
                    type="button"
                    onClick={() =>
                      editavel && alternarMembro(membro.user_id, false)
                    }
                    disabled={!editavel}
                    title={
                      editavel
                        ? `Retirar ${membro.perfil.nome} do cartão`
                        : membro.perfil.nome
                    }
                  >
                    <Avatar perfil={membro.perfil} />
                  </button>
                ))}
                {editavel && (
                  <Popover>
                    <AbrirPopover asChild>
                      <Botao
                        variante="secundario"
                        tamanho="iconePequeno"
                        aria-label="Atribuir o cartão"
                      >
                        <UserPlus />
                      </Botao>
                    </AbrirPopover>
                    <ConteudoPopover titulo="Membros do cartão">
                      <div className="space-y-0.5">
                        {estado.membros.map((membro) => {
                          const ativo = cartao.membros.includes(membro.user_id);
                          return (
                            <button
                              key={membro.user_id}
                              type="button"
                              onClick={() =>
                                alternarMembro(membro.user_id, !ativo)
                              }
                              aria-pressed={ativo}
                              className="flex w-full items-center gap-2 rounded p-1 text-left text-sm hover:bg-superficie-2"
                            >
                              <span
                                className="grid size-4 shrink-0 place-items-center"
                                aria-hidden
                              >
                                <Check
                                  className={cn("size-4", !ativo && "invisible")}
                                />
                              </span>
                              <Avatar perfil={membro.perfil} tamanho="pequeno" />
                              <span className="truncate">
                                {membro.perfil.nome}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </ConteudoPopover>
                  </Popover>
                )}
                {pessoas.length === 0 && !editavel && (
                  <span className="text-sm text-texto-tenue">—</span>
                )}
              </div>
            </Campo>
          </div>

          {/* Descrição */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-texto">Descrição</h3>
            {aEditarDescricao ? (
              <Compositor
                valorInicial={cartao.descricao ?? ""}
                placeholder="Escreve a descrição. Aceita markdown simples."
                rotuloGuardar="Guardar descrição"
                aoGuardar={(descricao) => guardar({ descricao })}
                aoFechar={() => definirAEditarDescricao(false)}
              />
            ) : cartao.descricao ? (
              <div
                className={cn(
                  "prosa rounded-md",
                  editavel &&
                    "-mx-2 cursor-text px-2 py-1 hover:bg-superficie-2",
                )}
                onClick={() => editavel && definirAEditarDescricao(true)}
              >
                <Markdown remarkPlugins={[remarkGfm]}>
                  {cartao.descricao}
                </Markdown>
              </div>
            ) : editavel ? (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                className="w-full justify-start font-normal text-texto-suave"
                onClick={() => definirAEditarDescricao(true)}
              >
                Adicionar uma descrição…
              </Botao>
            ) : (
              <p className="text-sm text-texto-tenue">Sem descrição.</p>
            )}
          </section>

          {/* `key`: mudar de cartão traz instâncias novas, com o estado de
              carregamento no princípio em vez de mostrar o cartão anterior. */}
          <Anexos
            key={cartao.id}
            idCartao={cartao.id}
            utilizador={utilizador}
            editavel={editavel}
            aoMudarTotal={anotarAnexos}
          />

          <Comentarios
            key={cartao.id}
            idCartao={cartao.id}
            utilizador={utilizador}
            editavel={comentavel}
            aoMudarTotal={anotarComentarios}
          />
        </div>

        {/* Ações */}
        {editavel && (
          <footer className="flex flex-wrap gap-2 border-t border-borda px-4 py-3">
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={async () => {
                await guardar({ arquivado: !cartao.arquivado });
                if (!cartao.arquivado) aoFechar();
              }}
            >
              {cartao.arquivado ? <ArchiveRestore /> : <Archive />}
              {cartao.arquivado ? "Repor no quadro" : "Arquivar cartão"}
            </Botao>
            {papel === "gestor" && (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                onClick={() => definirGerirAcessos(true)}
              >
                <KeyRound /> Dar acesso a este cartão
              </Botao>
            )}
            <Botao
              variante="fantasma"
              tamanho="pequeno"
              className="text-perigo"
              onClick={confirmacao.abrir}
            >
              <Trash2 /> Apagar
            </Botao>
          </footer>
        )}

        <Confirmar
          aberto={confirmacao.aberto}
          aoMudarAberto={confirmacao.definirAberto}
          titulo={`Apagar «${cartao.titulo}»?`}
          descricao="O cartão, os comentários e os anexos são apagados e não há como os recuperar. Para o tirar da vista sem perder nada, arquiva-o."
          rotuloAcao="Apagar cartão"
          perigoso
          aoConfirmar={apagar}
        />
      </PainelLateral>

      <GestorEtiquetas
        aberto={gerirEtiquetas}
        aoMudarAberto={definirGerirEtiquetas}
        idQuadro={estado.quadro.id}
        etiquetas={estado.etiquetas}
        despachar={despachar}
      />

      <AcessosCartao
        aberto={gerirAcessos}
        aoMudarAberto={definirGerirAcessos}
        idCartao={cartao.id}
        tituloCartao={cartao.titulo}
      />
    </Dialogo>
  );
}

function Campo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-32 space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function SeletorData({
  valor,
  aoMudar,
}: {
  valor: string | null;
  aoMudar: (valor: string | null) => void;
}) {
  // O Radix desmonta o conteúdo do popover ao fechar: cada abertura traz o
  // valor atual sem precisar de o sincronizar por efeito.
  const [local, definirLocal] = React.useState(paraCampoLocal(valor));

  return (
    <div className="space-y-2 p-1">
      <input
        type="datetime-local"
        value={local}
        onChange={(evento) => definirLocal(evento.target.value)}
        aria-label="Data e hora limite"
        className="w-full rounded-md border border-borda-forte bg-superficie px-2 py-1.5 text-sm text-texto"
      />
      <div className="flex gap-2">
        <Botao
          variante="principal"
          tamanho="pequeno"
          onClick={() => aoMudar(deCampoLocal(local))}
        >
          Guardar data
        </Botao>
        {valor && (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            onClick={() => aoMudar(null)}
          >
            Retirar
          </Botao>
        )}
      </div>
    </div>
  );
}

function msg(erro: unknown) {
  return erro instanceof Error ? erro.message : "Não foi possível guardar.";
}
