/**
 * Dá a alguém o papel de admin em todos os quadros.
 *
 * O modelo de permissões é por quadro — não existe "super admin" global, e é
 * de propósito: quem entra num quadro tem de lá estar escrito. Isto é a forma
 * operacional de ter acesso a tudo, e tem de voltar a correr quando aparecerem
 * quadros novos.
 *
 * Uso:
 *   npm run dar-admin -- cozinharte.pt@gmail.com
 *   npm run dar-admin -- cozinharte.pt@gmail.com --ver     (não altera nada)
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
const emFalta = quadros.filter((q) => papelAtual.get(q.id) !== "admin");

console.log(`
${email}
  ${quadros.length} quadros no total
  ${quadros.length - emFalta.length} onde já é admin
  ${emFalta.length} por acrescentar
`);

if (!emFalta.length) {
  console.log("Nada a fazer.\n");
  process.exit(0);
}

emFalta.forEach((q) =>
  console.log(`  ${papelAtual.has(q.id) ? "sobe a admin" : "entra como admin"}  ${q.nome}`),
);

if (SO_VER) {
  console.log("\n(--ver: não foi alterado nada)\n");
  process.exit(0);
}

// upsert e não insert: quem já lá está como editor sobe a admin em vez de
// rebentar contra a chave primária.
const { error } = await bd.from("board_members").upsert(
  emFalta.map((q) => ({ board_id: q.id, user_id: conta.id, papel: "admin" })),
  { onConflict: "board_id,user_id" },
);

if (error) {
  console.error(`\n✗ Não consegui dar o acesso.\n  ${error.message}\n`);
  process.exit(1);
}

console.log(`\n✓ Admin em ${quadros.length} quadros.

  Volta a correr isto quando aparecerem quadros novos — o acesso é por quadro,
  não há papel global que os apanhe sozinho.
`);
