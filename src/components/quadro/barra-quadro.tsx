"use client";

import {
  Archive,
  ArchiveRestore,
  Image as ImageIcon,
  Keyboard,
  MoreHorizontal,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { FilaAvatares } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
  SeparadorMenu,
} from "@/components/ui/menu";
import { corQuadro } from "@/lib/cores";
import type { AccaoQuadro, EstadoQuadro } from "@/lib/quadro/estado";
import type { Filtros } from "@/lib/quadro/filtros";
import * as mutar from "@/lib/quadro/mutacoes";
import { eGestor, podeEditar } from "@/lib/quadro/tipos";
import type { PapelQuadro, Perfil } from "@/lib/supabase/tipos";

import { Arquivo } from "./arquivo";
import { ATALHOS } from "./atalhos";
import { Compositor } from "./compositor";
import { GestorEtiquetas } from "./etiquetas";
import { ImagemDoQuadro } from "./imagem-quadro";
import { BarraFiltros } from "./filtros";
import { GestorMembros } from "./membros";

export function BarraQuadro({
  estado,
  papel,
  utilizador,
  filtros,
  aoMudarFiltros,
  despachar,
}: {
  estado: EstadoQuadro;
  papel: PapelQuadro;
  utilizador: Perfil;
  filtros: Filtros;
  aoMudarFiltros: (filtros: Filtros) => void;
  despachar: React.Dispatch<AccaoQuadro>;
}) {
  const router = useRouter();
  const editavel = podeEditar(papel);
  const gestor = eGestor(papel);
  const [imagemAberta, definirImagemAberta] = React.useState(false);

  const [aRenomear, definirARenomear] = React.useState(false);
  const [membrosAberto, definirMembrosAberto] = React.useState(false);
  const [etiquetasAberto, definirEtiquetasAberto] = React.useState(false);
  const [arquivoAberto, definirArquivoAberto] = React.useState(false);
  const [ajudaAberta, definirAjudaAberta] = React.useState(false);
  const confirmacao = useConfirmacao();

  async function renomear(nome: string) {
    const anterior = estado.quadro.nome;
    despachar({ tipo: "quadro:alterar", campos: { nome } });
    try {
      await mutar.alterarQuadro(estado.quadro.id, { nome });
      router.refresh();
    } catch (erro) {
      despachar({ tipo: "quadro:alterar", campos: { nome: anterior } });
      avisar.falhou(msg(erro));
    }
  }

  async function alternarArquivo() {
    const arquivado = !estado.quadro.arquivado;
    despachar({ tipo: "quadro:alterar", campos: { arquivado } });
    try {
      await mutar.alterarQuadro(estado.quadro.id, { arquivado });
      avisar.feito(arquivado ? "Quadro arquivado." : "Quadro reposto.");
      router.refresh();
    } catch (erro) {
      despachar({ tipo: "quadro:alterar", campos: { arquivado: !arquivado } });
      avisar.falhou(msg(erro));
    }
  }

  async function apagar() {
    try {
      await mutar.apagarQuadro(estado.quadro.id);
      router.push("/");
    } catch (erro) {
      avisar.falhou(msg(erro));
    }
  }

  return (
    <>
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: corQuadro(estado.quadro.cor) }}
        aria-hidden
      />

      {/*
        Superfície sólida, e não translúcida sobre a imagem: o título, os
        filtros e as contagens têm de cumprir o contraste AA com qualquer
        fotografia por trás, e uma fotografia não dá garantias nenhumas.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borda bg-superficie px-3 py-2 sm:px-4">
        <div className="min-w-0">
          {aRenomear ? (
            <div className="w-64">
              <Compositor
                valorInicial={estado.quadro.nome}
                placeholder="Nome do quadro"
                rotuloGuardar="Guardar nome"
                multiplasLinhas={false}
                aoGuardar={renomear}
                aoFechar={() => definirARenomear(false)}
              />
            </div>
          ) : (
            <h1 className="truncate text-base font-semibold tracking-tight text-texto">
              <button
                type="button"
                onClick={() => editavel && definirARenomear(true)}
                disabled={!editavel}
                className="max-w-full truncate disabled:cursor-default"
                title={editavel ? "Mudar o nome do quadro" : estado.quadro.nome}
              >
                {estado.quadro.nome}
              </button>
              {estado.quadro.arquivado && (
                <span className="ml-2 rounded bg-superficie-3 px-1.5 py-0.5 align-middle text-[11px] font-medium text-texto-suave">
                  Arquivado
                </span>
              )}
            </h1>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <BarraFiltros
            filtros={filtros}
            aoMudar={aoMudarFiltros}
            etiquetas={estado.etiquetas}
            membros={estado.membros}
          />

          <button
            type="button"
            onClick={() => definirMembrosAberto(true)}
            className="rounded-full p-0.5"
            aria-label={`Membros do quadro (${estado.membros.length})`}
            title={estado.membros.map((m) => m.perfil.nome).join(", ")}
          >
            <FilaAvatares
              perfis={estado.membros.map((m) => m.perfil)}
              maximo={3}
              tamanho="normal"
            />
          </button>

          <Menu>
            <AbrirMenu asChild>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label="Ações do quadro"
              >
                <MoreHorizontal />
              </Botao>
            </AbrirMenu>
            <ConteudoMenu>
              <ItemMenu onSelect={() => definirMembrosAberto(true)}>
                <Users /> Membros
              </ItemMenu>
              {editavel && (
                <ItemMenu onSelect={() => definirEtiquetasAberto(true)}>
                  <Tag /> Etiquetas
                </ItemMenu>
              )}
              <ItemMenu onSelect={() => definirArquivoAberto(true)}>
                <Archive /> Arquivo
              </ItemMenu>
              <SeparadorMenu />
              <ItemMenu onSelect={() => definirAjudaAberta(true)}>
                <Keyboard /> Atalhos de teclado
              </ItemMenu>
              {gestor && (
                <>
                  <SeparadorMenu />
                  <ItemMenu onSelect={() => definirImagemAberta(true)}>
                    <ImageIcon /> Imagem do quadro
                  </ItemMenu>
                  <ItemMenu onSelect={alternarArquivo}>
                    {estado.quadro.arquivado ? <ArchiveRestore /> : <Archive />}
                    {estado.quadro.arquivado
                      ? "Repor o quadro"
                      : "Arquivar quadro"}
                  </ItemMenu>
                  <ItemMenu perigoso onSelect={confirmacao.abrir}>
                    <Trash2 /> Apagar quadro
                  </ItemMenu>
                </>
              )}
            </ConteudoMenu>
          </Menu>
        </div>
      </div>

      <ImagemDoQuadro
        aberto={imagemAberta}
        aoMudarAberto={definirImagemAberta}
        idQuadro={estado.quadro.id}
        nomeQuadro={estado.quadro.nome}
        cor={estado.quadro.cor}
        imagemAtual={estado.quadro.imagem}
      />

      <GestorMembros
        aberto={membrosAberto}
        aoMudarAberto={definirMembrosAberto}
        idQuadro={estado.quadro.id}
        nomeQuadro={estado.quadro.nome}
        membros={estado.membros}
        utilizador={utilizador}
        despachar={despachar}
      />

      <GestorEtiquetas
        aberto={etiquetasAberto}
        aoMudarAberto={definirEtiquetasAberto}
        idQuadro={estado.quadro.id}
        etiquetas={estado.etiquetas}
        despachar={despachar}
      />

      <Arquivo
        aberto={arquivoAberto}
        aoMudarAberto={definirArquivoAberto}
        estado={estado}
        editavel={editavel}
        despachar={despachar}
      />

      <AjudaAtalhos aberta={ajudaAberta} aoMudarAberta={definirAjudaAberta} />

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo={`Apagar «${estado.quadro.nome}»?`}
        descricao="Todas as listas, cartões, comentários e anexos deste quadro são apagados para todos os membros, e não há como os recuperar. Para o tirar da lista sem perder nada, arquiva-o."
        rotuloAcao="Apagar quadro"
        perigoso
        aoConfirmar={apagar}
      />
    </>
  );
}

export function AjudaAtalhos({
  aberta,
  aoMudarAberta,
}: {
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
}) {
  return (
    <Dialogo open={aberta} onOpenChange={aoMudarAberta}>
      <CaixaDialogo
        titulo="Atalhos de teclado"
        descricao="Funcionam sempre que não estiveres a escrever num campo."
      >
        <dl className="divide-y divide-[var(--cor-borda)]">
          {ATALHOS.map((atalho) => (
            <div
              key={atalho.descricao}
              className="flex items-center justify-between gap-4 py-2"
            >
              <dt className="text-sm text-texto">{atalho.descricao}</dt>
              <dd className="flex gap-1">
                {atalho.teclas.map((tecla) => (
                  <kbd
                    key={tecla}
                    className="rounded border border-borda bg-superficie-2 px-1.5 py-0.5 font-mono text-xs text-texto-suave"
                  >
                    {tecla}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </CaixaDialogo>
    </Dialogo>
  );
}

function msg(erro: unknown) {
  return erro instanceof Error ? erro.message : "Não foi possível guardar.";
}
