import "server-only";

/**
 * O email de convite.
 *
 * Escrito à mão em HTML de tabela, e não com um motor de templates: os
 * clientes de email não sabem flexbox nem grid, o Outlook ignora metade do CSS
 * moderno, e um `<div>` com `display:flex` chega ao Outlook como uma coluna
 * empilhada. Tabelas e estilos inline é o que funciona em todo o lado.
 *
 * O texto segue a mesma regra do resto da interface: verbos ativos, e o botão
 * diz o que acontece. "Definir a minha palavra-passe", não "Clique aqui".
 */

export type AcessoNoConvite = {
  tipo: "quadro" | "cartao";
  nome: string;
};

export function assuntoDoConvite(quemConvida: string | null): string {
  return quemConvida
    ? `${quemConvida} convidou-te para a plataforma de quadros`
    : "Foste convidado para a plataforma de quadros";
}

/**
 * A versão em texto simples. Não é um acessório: sem ela, os filtros de spam
 * ficam desconfiados, e há quem leia o email num cliente que não mostra HTML.
 */
export function textoDoConvite({
  ligacao,
  quemConvida,
  acessos,
  expiraEm,
}: {
  ligacao: string;
  quemConvida: string | null;
  acessos: AcessoNoConvite[];
  expiraEm: string;
}): string {
  const linhas = [
    quemConvida
      ? `${quemConvida} convidou-te para a plataforma de quadros da Creative Line.`
      : "Foste convidado para a plataforma de quadros da Creative Line.",
    "",
    "Para entrares, define a tua palavra-passe aqui:",
    ligacao,
    "",
  ];

  if (acessos.length) {
    linhas.push("Vais ter acesso a:");
    for (const a of acessos) {
      linhas.push(`  - ${a.nome}${a.tipo === "cartao" ? " (um cartão)" : ""}`);
    }
    linhas.push("");
  }

  linhas.push(
    `Este link é válido até ${data(expiraEm)} e só pode ser usado uma vez.`,
    "",
    "Se não estavas à espera deste convite, ignora este email — sem o link,",
    "não há nada a fazer com ele.",
  );

  return linhas.join("\n");
}

export function htmlDoConvite({
  ligacao,
  quemConvida,
  acessos,
  expiraEm,
}: {
  ligacao: string;
  quemConvida: string | null;
  acessos: AcessoNoConvite[];
  expiraEm: string;
}): string {
  const abertura = quemConvida
    ? `<strong>${escapar(quemConvida)}</strong> convidou-te para a plataforma de quadros da Creative Line.`
    : "Foste convidado para a plataforma de quadros da Creative Line.";

  // Uma linha da tabela exterior, para encaixar entre o botão e o rodapé.
  const listaAcessos = acessos.length
    ? `
      <tr>
        <td style="padding:0 32px 24px">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Vais ter acesso a:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${acessos
              .map(
                (a) => `
            <tr>
              <td style="padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;color:#111827">
                ${escapar(a.nome)}${
                  a.tipo === "cartao"
                    ? ' <span style="color:#6b7280;font-size:12px">— um cartão</span>'
                    : ""
                }
              </td>
            </tr>
            <tr><td style="height:6px;line-height:6px">&nbsp;</td></tr>`,
              )
              .join("")}
          </table>
        </td>
      </tr>`
    : "";

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Convite</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <!-- Pré-visualização na caixa de entrada, antes de o email ser aberto. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    Define a tua palavra-passe e entra. O link é válido 7 dias.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
          <tr>
            <td style="padding:32px 32px 0">
              <p style="margin:0 0 24px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">
                Creative Line
              </p>

              <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827">
                Tens acesso à plataforma de quadros
              </h1>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151">
                ${abertura}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#111827;border-radius:8px">
                    <a href="${escapar(ligacao)}"
                       style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none">
                      Definir a minha palavra-passe
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 24px;font-size:12px;line-height:1.5;color:#6b7280">
                Ou copia este endereço para o teu navegador:<br>
                <span style="color:#374151;word-break:break-all">${escapar(ligacao)}</span>
              </p>
            </td>
          </tr>

          ${listaAcessos}

          <tr>
            <td style="padding:0 32px 32px">
              <p style="margin:0;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">
                O link é válido até <strong style="color:#374151">${escapar(data(expiraEm))}</strong>
                e só pode ser usado uma vez.<br>
                Se não estavas à espera deste convite, ignora este email — sem o
                link não há nada a fazer com ele.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Escapa o que vem de fora. O nome de um quadro e o nome de quem convida são
 * escritos por pessoas, e vão parar dentro de HTML — sem isto, um quadro
 * chamado `<script>` ou com aspas partia a mensagem.
 */
function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function data(valor: string): string {
  return new Date(valor).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
