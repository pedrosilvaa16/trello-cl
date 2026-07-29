import "server-only";

import { criarClienteAdmin } from "@/lib/supabase/servidor";
import type { EstadoLigacao, LigacaoRede } from "@/lib/supabase/tipos";

import { decifrar } from "./cifra";
import { ErroDeRede, dia, type Recolha } from "./fornecedor";
import { fornecedorDe } from "./fornecedores";

/**
 * O motor de sincronização.
 *
 * É aqui que se cumpre a decisão que manda em tudo o resto: **a base de dados é
 * a fonte de verdade, não a API**. A Meta só devolve cerca de trinta dias de
 * histórico, e o que não for gravado hoje perde-se para sempre. Um cron diário
 * grava o retrato; o painel lê sempre da nossa tabela e nunca chama a Meta.
 *
 * A consequência a assumir, e que está escrita no painel para o cliente ver: o
 * histórico começa no dia em que a conta é ligada. Em troca, ao fim de um ano há
 * histórico que o plano gratuito do Metricool não dá.
 *
 * Corre com a `service_role`, e é o único sítio do produto que escreve em
 * `metricas_redes`. Todas as outras portas estão revogadas na base de dados.
 */

/**
 * Quantos dias para trás na primeira sincronização.
 *
 * Trinta é o que a Meta dá; pedir mais devolve vazio e gasta quota. É uma vez
 * por ligação, e é o que enche o painel logo no primeiro dia em vez de o deixar
 * a dizer "volta amanhã" a quem acabou de ligar a conta.
 */
const DIAS_DE_RECUPERACAO = 30;

/**
 * Quantos dias para trás nas seguintes.
 *
 * Três, e não um. As redes fecham os números de um dia com atraso — o alcance
 * de ontem ainda sobe durante horas — e voltar a pedir os últimos três dias
 * corrige o que ficou por fechar. Como a escrita é `on conflict do update`,
 * repetir não duplica nada.
 */
const DIAS_DE_SOBREPOSICAO = 3;

/** Quantas ligações por execução, para não estourar a quota de nenhuma app. */
const LIMITE_POR_EXECUCAO = 25;

export type ResultadoSincronizacao = {
  ligacao: string;
  rede: string;
  quadro: string;
  conta: string;
  estado: "concluida" | "falhou";
  linhas: number;
  erro?: string;
  avisos: string[];
};

/**
 * Sincroniza uma ligação.
 *
 * Devolve o resultado em vez de o atirar: uma ligação partida não pode levar
 * atrás as outras vinte e quatro que estavam à espera na mesma execução do cron.
 */
export async function sincronizarLigacao(
  ligacao: LigacaoRede,
): Promise<ResultadoSincronizacao> {
  const admin = criarClienteAdmin();
  const base: Omit<ResultadoSincronizacao, "estado" | "linhas"> = {
    ligacao: ligacao.id,
    rede: ligacao.rede,
    quadro: ligacao.board_id,
    conta: ligacao.nome_conta,
    avisos: [],
  };

  const { data: registo } = await admin
    .from("sincronizacoes")
    .insert({ ligacao_id: ligacao.id })
    .select("id")
    .single<{ id: number }>();

  const fechar = async (
    estado: "concluida" | "falhou",
    linhas: number,
    erro?: string,
  ) => {
    if (registo) {
      await admin
        .from("sincronizacoes")
        .update({ terminada_em: new Date().toISOString(), estado, linhas, erro })
        .eq("id", registo.id);
    }
  };

  try {
    const { data: segredo } = await admin
      .from("ligacoes_segredos")
      .select("token_cifrado")
      .eq("ligacao_id", ligacao.id)
      .maybeSingle<{ token_cifrado: string }>();

    if (!segredo) {
      throw new ErroDeRede(
        "Esta ligação não tem token guardado. Volta a ligar a conta.",
        true,
      );
    }

    const ate = new Date();
    const desde = new Date(ate);
    /*
      A primeira sincronização recupera o que a rede ainda tem; as seguintes só
      voltam aos últimos dias. `primeiro_dia` a nulo é o que distingue uma da
      outra — e é ele, e não `sincronizada_em`, porque uma sincronização que
      falhou a meio deixou a segunda preenchida e a primeira não.
    */
    desde.setUTCDate(
      desde.getUTCDate() -
        (ligacao.primeiro_dia ? DIAS_DE_SOBREPOSICAO : DIAS_DE_RECUPERACAO),
    );

    const recolha = await fornecedorDe(ligacao.rede).recolher({
      token: decifrar(segredo.token_cifrado),
      contaId: ligacao.conta_externa_id,
      desde,
      ate,
    });

    const linhas = await gravar(ligacao, recolha);

    /*
      `primeiro_dia` é o dia mais antigo que ficou mesmo gravado, e não a data
      em que se ligou a conta: é ele que sustenta o aviso "os dados começam em
      X" no topo do painel, e prometer mais do que se tem seria mentir num
      ecrã que existe para o cliente confiar.
    */
    const maisAntigo = recolha.metricas
      .map((m) => m.dia)
      .sort()
      .at(0);

    await admin
      .from("ligacoes_redes")
      .update({
        sincronizada_em: new Date().toISOString(),
        estado: "activa" satisfies EstadoLigacao,
        erro: null,
        primeiro_dia:
          ligacao.primeiro_dia && ligacao.primeiro_dia <= (maisAntigo ?? "9999")
            ? ligacao.primeiro_dia
            : (maisAntigo ?? ligacao.primeiro_dia ?? dia(ate)),
      })
      .eq("id", ligacao.id);

    await fechar("concluida", linhas);
    return { ...base, estado: "concluida", linhas, avisos: recolha.avisos };
  } catch (erro) {
    const mensagem =
      erro instanceof Error ? erro.message : "Falha desconhecida.";
    const expirado = erro instanceof ErroDeRede && erro.expirado;

    /*
      A distinção que evita os dois piores desfechos: incomodar o cliente por
      causa de um 500 passageiro, ou deixar um painel a mostrar números velhos
      durante semanas sem se queixar. `expirada` chama o gestor; `erro` fica em
      silêncio e tenta outra vez amanhã.
    */
    await admin.rpc("marcar_estado_ligacao", {
      p_ligacao: ligacao.id,
      p_estado: expirado ? "expirada" : "erro",
      p_erro: expirado
        ? "A autorização caducou ou foi retirada. Volta a ligar a conta para o painel voltar a atualizar-se."
        : mensagem,
    });

    await fechar("falhou", 0, mensagem);
    return { ...base, estado: "falhou", linhas: 0, erro: mensagem };
  }
}

/**
 * Grava o que a recolha trouxe.
 *
 * Tudo por `upsert` sobre as chaves únicas da migração: correr o cron duas
 * vezes no mesmo dia dá exatamente o mesmo resultado que correr uma. É o que
 * torna seguro repetir uma sincronização que falhou a meio.
 *
 * `board_id` e `rede` não vão aqui de propósito — é o trigger da base de dados
 * que os põe a partir da ligação, e é isso que garante que nunca divergem.
 */
async function gravar(ligacao: LigacaoRede, recolha: Recolha): Promise<number> {
  const admin = criarClienteAdmin();
  let linhas = 0;

  if (recolha.metricas.length) {
    const { error } = await admin.from("metricas_redes").upsert(
      recolha.metricas.map((m) => ({ ligacao_id: ligacao.id, ...m })),
      { onConflict: "ligacao_id,dia,metrica" },
    );
    if (error) throw new Error(`Não foi possível gravar as métricas: ${error.message}`);
    linhas += recolha.metricas.length;
  }

  if (recolha.demografia.length) {
    const { error } = await admin.from("demografia_redes").upsert(
      recolha.demografia.map((d) => ({ ligacao_id: ligacao.id, ...d })),
      { onConflict: "ligacao_id,dia,dimensao,grupo" },
    );
    if (error) throw new Error(`Não foi possível gravar a demografia: ${error.message}`);
    linhas += recolha.demografia.length;
  }

  if (recolha.publicacoes.length) {
    const { error } = await admin.from("publicacoes_redes").upsert(
      recolha.publicacoes.map((p) => ({
        ligacao_id: ligacao.id,
        ...p,
        atualizado_em: new Date().toISOString(),
      })),
      { onConflict: "ligacao_id,id_externo" },
    );
    if (error)
      throw new Error(`Não foi possível gravar as publicações: ${error.message}`);
    linhas += recolha.publicacoes.length;
  }

  return linhas;
}

/**
 * As ligações que estão à espera, da mais atrasada para a menos.
 *
 * Ordenar por `sincronizada_em` com os nulos à frente é o que faz uma ligação
 * acabada de criar ser servida primeiro — quem liga uma conta quer ver o painel
 * a encher-se, não a dizer "volta amanhã".
 */
export async function ligacoesASincronizar(
  limite = LIMITE_POR_EXECUCAO,
): Promise<LigacaoRede[]> {
  const admin = criarClienteAdmin();

  /*
    `expirada` fica de fora: insistir num token caducado é gastar quota para
    receber o mesmo erro todos os dias. Volta à fila quando o gestor voltar a
    ligar a conta, e é para isso que serve o aviso no painel.
  */
  const { data } = await admin
    .from("ligacoes_redes")
    .select("*")
    .in("estado", ["activa", "erro"])
    .order("sincronizada_em", { ascending: true, nullsFirst: true })
    .limit(limite);

  return (data ?? []) as LigacaoRede[];
}

/** Uma passagem do cron. Sequencial de propósito: as APIs têm quota por app. */
export async function sincronizarTudo(): Promise<ResultadoSincronizacao[]> {
  const resultados: ResultadoSincronizacao[] = [];
  for (const ligacao of await ligacoesASincronizar()) {
    resultados.push(await sincronizarLigacao(ligacao));
  }
  return resultados;
}
