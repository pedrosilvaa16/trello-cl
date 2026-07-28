/**
 * Cria a primeira conta da plataforma.
 *
 * O registo é fechado e só se entra por convite — mas os convites só podem ser
 * criados por quem já é admin de algum quadro. Alguém tem de ser o primeiro, e
 * esse alguém nasce aqui, com a service_role, fora da aplicação.
 *
 * Depois de entrar, esta conta cria um quadro (fica admin dele) e a partir daí
 * convida o resto da equipa pela interface.
 *
 * Uso:
 *   npm run primeiro-admin -- ana@empresa.pt "Ana Ferreira"
 *   npm run primeiro-admin -- ana@empresa.pt "Ana Ferreira" palavra-passe-a-escolha
 */

import { randomBytes } from "node:crypto";

const [email, nome, palavraPasseDada] = process.argv.slice(2);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !chave) {
  falhar(
    "Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    "Confirma que o .env.local existe e está preenchido (ver .env.example).",
  );
}

if (!email || !nome) {
  falhar(
    "Faltam argumentos.",
    'Uso: npm run primeiro-admin -- ana@empresa.pt "Ana Ferreira"',
  );
}

// 18 bytes em base64url dão 24 caracteres — acima do mínimo que o formulário
// de convite exige, e sem caracteres que a linha de comandos coma.
const palavraPasse = palavraPasseDada || randomBytes(18).toString("base64url");

const resposta = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: chave,
    Authorization: `Bearer ${chave}`,
  },
  body: JSON.stringify({
    email,
    password: palavraPasse,
    email_confirm: true,
    user_metadata: { nome },
  }),
});

const corpo = await resposta.json().catch(() => ({}));

if (!resposta.ok) {
  const mensagem = corpo.msg || corpo.message || corpo.error_description || "";

  if (/already|registered|exists/i.test(mensagem)) {
    falhar(
      `Já existe uma conta com o email ${email}.`,
      "Entra com ela, ou usa outro email.",
    );
  }
  if (/domínio|dominio|autorizado/i.test(mensagem)) {
    falhar(
      mensagem,
      "O trigger de domínios permitidos recusou este email. Vê a tabela public.dominios_permitidos.",
    );
  }
  if (resposta.status === 404 || /relation|does not exist/i.test(mensagem)) {
    falhar(
      "O esquema ainda não foi aplicado a este projeto.",
      "Corre primeiro: supabase link --project-ref <ref> && supabase db push",
    );
  }

  falhar(
    `O Supabase recusou a criação da conta (HTTP ${resposta.status}).`,
    mensagem || JSON.stringify(corpo),
  );
}

console.log(`
✓ Conta criada.

  Email          ${email}
  Nome           ${nome}
  Palavra-passe  ${palavraPasse}
${
  palavraPasseDada
    ? ""
    : "\n  Guarda-a agora — não volta a ser mostrada.\n"
}
Passo seguinte: entra em /entrar, cria um quadro (ficas admin dele) e convida
a equipa pelo botão de membros.
`);

function falhar(titulo, detalhe) {
  console.error(`\n✗ ${titulo}\n  ${detalhe}\n`);
  process.exit(1);
}
