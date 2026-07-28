import "server-only";

/**
 * Envio de email, pelo Resend.
 *
 * Uma chamada HTTP e nenhuma dependência nova: o SDK do Resend é um invólucro
 * fino à volta disto, e o que aqui se faz cabe em quarenta linhas.
 *
 * Falhar a enviar nunca derruba a operação que o pediu. Um convite criado e
 * não enviado resolve-se com um botão de reenviar no painel; um convite que
 * não chegou a ser criado porque o servidor de email estava em baixo é uma
 * chatice sem razão de ser.
 */

const API = "https://api.resend.com/emails";

export type ResultadoEnvio =
  | { enviado: true; id: string }
  | { enviado: false; motivo: string };

function chave(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

/**
 * O remetente. Tem de ser um endereço num domínio verificado no Resend —
 * caso contrário o envio é recusado, e a mensagem de erro do Resend diz-lo
 * por extenso.
 */
function remetente(): string {
  return (
    process.env.EMAIL_REMETENTE?.trim() ||
    "Quadros <onboarding@resend.dev>"
  );
}

/** Se há sequer como enviar. A interface usa isto para explicar o que falta. */
export function emailConfigurado(): boolean {
  return chave() !== null;
}

export async function enviarEmail({
  para,
  assunto,
  html,
  texto,
  responderA,
}: {
  para: string;
  assunto: string;
  html: string;
  /** Alternativa em texto simples. Sem ela, muitos filtros marcam como spam. */
  texto: string;
  responderA?: string;
}): Promise<ResultadoEnvio> {
  const apiKey = chave();
  if (!apiKey) {
    return {
      enviado: false,
      motivo:
        "RESEND_API_KEY não está definida. O convite foi criado; envia o link à mão.",
    };
  }

  try {
    const resposta = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente(),
        to: [para],
        subject: assunto,
        html,
        text: texto,
        ...(responderA ? { reply_to: responderA } : {}),
      }),
    });

    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      // A mensagem do Resend é específica e útil ("domain is not verified",
      // "invalid api key"). Passá-la para a interface poupa uma ida aos logs.
      const motivo =
        (corpo as { message?: string } | null)?.message ??
        `O Resend recusou o envio (HTTP ${resposta.status}).`;
      return { enviado: false, motivo };
    }

    return { enviado: true, id: (corpo as { id: string }).id };
  } catch {
    return {
      enviado: false,
      motivo: "Não foi possível falar com o servidor de email.",
    };
  }
}
