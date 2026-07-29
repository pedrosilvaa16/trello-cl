import { timingSafeEqual } from "node:crypto";

import { sincronizarTudo } from "@/lib/redes/sincronizar";

/**
 * A passagem diária do cron.
 *
 * É esta rota que cumpre a decisão da secção 11: a base de dados é a fonte de
 * verdade, não a API. A Meta só devolve cerca de trinta dias de histórico, e o
 * que não for gravado hoje perde-se para sempre — um mês sem esta rota correr
 * é um mês que nenhum cliente volta a ver.
 *
 * Agendada em `vercel.json`. A Vercel chama-a com o `CRON_SECRET` no cabeçalho
 * `Authorization`, e é a única coisa que a autentica: não há sessão nenhuma por
 * trás de um cron.
 */

/*
  Sincronizar vinte e cinco ligações contra APIs externas não cabe nos dez
  segundos por omissão. Cinco minutos é o tecto do plano Pro da Vercel, e é
  folgado — a maioria das passagens acaba em menos de um minuto.
*/
export const maxDuration = 300;

/** Nunca em cache. Uma sincronização servida de cache não sincronizou nada. */
export const dynamic = "force-dynamic";

function autorizado(pedido: Request): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;

  const cabecalho = pedido.headers.get("authorization") ?? "";
  const recebido = cabecalho.replace(/^Bearer\s+/i, "");

  // Comparação em tempo constante, como em `cifra.ts` e pela mesma razão: um
  // `===` deixa medir quantos caracteres estavam certos.
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(pedido: Request) {
  return correr(pedido);
}

/** A Vercel usa GET; POST fica para quem preferir chamar isto à mão. */
export async function POST(pedido: Request) {
  return correr(pedido);
}

async function correr(pedido: Request) {
  if (!autorizado(pedido)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  const resultados = await sincronizarTudo();

  const falhadas = resultados.filter((r) => r.estado === "falhou");

  /*
    O log é o que se lê às oito da manhã quando um cliente pergunta porque é que
    os números estão parados. Vale a pena ser explícito: sem isto, uma falha de
    token fica só numa coluna de uma tabela que ninguém abre.
  */
  if (falhadas.length) {
    console.error(
      `Sincronização de redes: ${falhadas.length} de ${resultados.length} falharam.`,
      falhadas.map((f) => `${f.rede}/${f.conta}: ${f.erro}`),
    );
  }

  return Response.json({
    ligacoes: resultados.length,
    concluidas: resultados.length - falhadas.length,
    falhadas: falhadas.length,
    segundos: Math.round((Date.now() - inicio) / 1000),
    detalhe: resultados,
  });
}
