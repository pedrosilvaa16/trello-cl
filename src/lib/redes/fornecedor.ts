import "server-only";

import type { DimensaoDemografica, RedeSocial } from "@/lib/supabase/tipos";

/**
 * O contrato que cada rede social cumpre.
 *
 * Um fornecedor sabe três coisas: como pedir autorização, como trocar o código
 * por um token, e como transformar o que a API dele devolve no vocabulário da
 * casa (`src/lib/redes/vocabulario.ts`). Tudo o que está a jusante — o motor de
 * sincronização, a agregação, os gráficos — trabalha só sobre este contrato e
 * não sabe distinguir o Instagram do TikTok.
 *
 * Acrescentar uma rede é escrever um ficheiro que exporte um `Fornecedor` e
 * registá-lo em `fornecedores.ts`. Não é preciso tocar em mais nada.
 */

/** Uma linha de `metricas_redes`, antes de ter dono. */
export type MetricaRecolhida = {
  /** Data ISO `AAAA-MM-DD`. */
  dia: string;
  metrica: string;
  valor: number;
};

export type DemografiaRecolhida = {
  dia: string;
  dimensao: DimensaoDemografica;
  grupo: string;
  valor: number;
};

export type PublicacaoRecolhida = {
  id_externo: string;
  publicado_em: string;
  tipo: string | null;
  url: string | null;
  miniatura_url: string | null;
  legenda: string | null;
  metricas: Record<string, number>;
};

export type Recolha = {
  metricas: MetricaRecolhida[];
  demografia: DemografiaRecolhida[];
  publicacoes: PublicacaoRecolhida[];
  /**
   * O que não se conseguiu ir buscar, em português e pronto a mostrar.
   *
   * Uma conta com menos de cem seguidores não tem demografia, e isso não é uma
   * falha — é um facto sobre a conta. Uma recolha parcial guarda o que trouxe e
   * explica o que faltou, em vez de rebentar e não guardar nada.
   */
  avisos: string[];
};

/** A conta do outro lado, depois de a autorização estar dada. */
export type ContaLigada = {
  contaId: string;
  nome: string;
  avatar: string | null;
  token: string;
  refresh: string | null;
  expiraEm: Date | null;
  ambito: string | null;
};

export type Fornecedor = {
  rede: RedeSocial;
  /** Falso enquanto a API não estiver aprovada. Ver secção 11. */
  disponivel: boolean;
  /** Confirma que as variáveis de ambiente desta rede estão preenchidas. */
  configurado(): boolean;
  /** Para onde mandar o browser a pedir autorização. */
  urlAutorizacao(estado: string, redirecionamento: string): string;
  /** Troca o `code` do callback por um token de longa duração e pela conta. */
  trocarCodigo(codigo: string, redirecionamento: string): Promise<ContaLigada>;
  /** Vai buscar tudo o que houver entre `desde` e `ate`, inclusive. */
  recolher(entrada: {
    token: string;
    contaId: string;
    desde: Date;
    ate: Date;
  }): Promise<Recolha>;
};

/**
 * Uma falha do lado da rede social.
 *
 * `expirado` é o que interessa: distingue "o token caducou, o gestor tem de
 * voltar a ligar" de "a API está com soluços, tenta outra vez amanhã". Sem essa
 * distinção, ou se incomoda o cliente por causa de um 500 passageiro, ou se
 * deixa um painel a mostrar números velhos durante semanas.
 */
export class ErroDeRede extends Error {
  constructor(
    mensagem: string,
    readonly expirado = false,
  ) {
    super(mensagem);
    this.name = "ErroDeRede";
  }
}

/** Data em `AAAA-MM-DD`, que é o formato de `metricas_redes.dia`. */
export function dia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Os dias entre duas datas, inclusive. Usado para varrer janelas curtas. */
export function diasEntre(desde: Date, ate: Date): string[] {
  const dias: string[] = [];
  const cursor = new Date(
    Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()),
  );
  const fim = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate());

  while (cursor.getTime() <= fim) {
    dias.push(dia(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}
