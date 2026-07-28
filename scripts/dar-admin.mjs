/**
 * Dá a alguém o papel de gestor em todos os quadros.
 *
 * PROVAVELMENTE JÁ NÃO É ISTO QUE QUERES. Quando este script foi escrito não
 * havia papel global nenhum, e "acesso a tudo" tinha de ser construído quadro
 * a quadro — e voltar a correr sempre que aparecesse um quadro novo. Desde os
 * níveis de acesso existe `super_admin`, que acede a todos os quadros sem
 * precisar de convite e sem manutenção:
 *
 *   npm run papel-global -- pessoa@empresa.pt super_admin
 *
 * Isto continua a servir para o caso diferente de querer alguém escrito como
 * gestor em cada quadro — por exemplo, para aparecer na lista de membros.
 *
 * Uso:
 *   npm run dar-admin -- pessoa@empresa.pt
 *   npm run dar-admin -- pessoa@empresa.pt --ver     (não altera nada)
 */

import { createClient } from "@supabase/supabase-js";

const [email, ...restantes] = process.argv.slice(2);
const SO_VER = restantes.includes("--ver");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !url || !chave) {
  console.error(`
✗ ${!email ? "Falta o email." : "Faltam as variáveis do Supabase."}

  Uso: npm run dar-admin -- pessoa@empresa.pt [--ver]
`);
  process.exit(1);
}

const bd = createClient(url, chave, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const contas = [];
for (let pagina = 1; ; pagina += 1) {
  const { data, error } = await bd.auth.admin.listUsers({ page: pagina, perPage: 200 });
  if (error) {
    console.error(`\n✗ Não consegui listar as contas.\n  ${error.message}\n`);
    process.exit(1);
  }
  contas.push(...data.users);
  if (data.users.length < 200) break;
}

const conta = contas.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!conta) {
  console.error(`
✗ Não existe conta com o email ${email}.

  Cria-a primeiro: npm run primeiro-admin -- ${email} "Nome"
`);
  process.exit(1);
}

const { data: quadros, error: erroQuadros } = await bd
  .from("boards")
  .select("id, nome, arquivado")
  .order("nome");

if (erroQuadros) {
  console.error(`\n✗ Não consegui ler os quadros.\n  ${erroQuadros.message}\n`);
  process.exit(1);
}

const { data: atuais } = await bd
  .from("board_members")
  .select("board_id, papel")
  .eq("user_id", conta.id);

const papelAtual = new Map((atuais ?? []).map((m) => [m.board_id, m.papel]));
const emFalta = quadros.filter((q) => papelAtual.get(q.id) !== "gestor");

console.log(`
${email}
  ${quadros.length} quadros no total
  ${quadros.length - emFalta.length} onde já é gestor
  ${emFalta.length} por acrescentar
`);

if (!emFalta.length) {
  console.log("Nada a fazer.\n");
  process.exit(0);
}

emFalta.forEach((q) =>
  console.log(`  ${papelAtual.has(q.id) ? "sobe a gestor" : "entra como gestor"}  ${q.nome}`),
);

if (SO_VER) {
  console.log("\n(--ver: não foi alterado nada)\n");
  process.exit(0);
}

// upsert e não insert: quem já lá está como editor sobe a gestor em vez de
// rebentar contra a chave primária.
const { error } = await bd.from("board_members").upsert(
  emFalta.map((q) => ({ board_id: q.id, user_id: conta.id, papel: "gestor" })),
  { onConflict: "board_id,user_id" },
);

if (error) {
  console.error(`\n✗ Não consegui dar o acesso.\n  ${error.message}\n`);
  process.exit(1);
}

console.log(`\n✓ Gestor em ${quadros.length} quadros.

  Volta a correr isto quando aparecerem quadros novos — isto escreve linhas em
  board_members, uma por quadro, e quadros novos nascem sem elas. Para acesso a
  tudo sem manutenção, o caminho é outro:
    npm run papel-global -- ${email} super_admin
`);
