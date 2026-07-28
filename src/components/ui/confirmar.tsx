"use client";

import * as React from "react";

import { Botao } from "./botao";
import { AcoesDialogo, CaixaDialogo, Dialogo, FecharDialogo } from "./dialogo";

/**
 * Confirmação para o que não se desfaz.
 *
 * O botão diz o que vai acontecer — "Apagar quadro", nunca "OK". O que se
 * desfaz (arquivar, remover etiqueta) não passa por aqui: passa por um aviso
 * com "Anular".
 */
export function Confirmar({
  aberto,
  aoMudarAberto,
  titulo,
  descricao,
  rotuloAcao,
  perigoso = false,
  aoConfirmar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  rotuloAcao: string;
  perigoso?: boolean;
  aoConfirmar: () => void | Promise<void>;
}) {
  const [ocupado, definirOcupado] = React.useState(false);

  async function confirmar() {
    definirOcupado(true);
    try {
      await aoConfirmar();
      aoMudarAberto(false);
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo titulo={titulo} descricao={descricao}>
        <AcoesDialogo>
          <FecharDialogo asChild>
            <Botao variante="fantasma" disabled={ocupado}>
              Cancelar
            </Botao>
          </FecharDialogo>
          <Botao
            variante={perigoso ? "perigo" : "principal"}
            onClick={confirmar}
            ocupado={ocupado}
          >
            {rotuloAcao}
          </Botao>
        </AcoesDialogo>
      </CaixaDialogo>
    </Dialogo>
  );
}

/** Estado de uma confirmação, para não repetir três useState por cada ação. */
export function useConfirmacao() {
  const [aberto, definirAberto] = React.useState(false);
  return { aberto, abrir: () => definirAberto(true), definirAberto };
}
