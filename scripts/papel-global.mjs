/**
 * Define o papel global de uma conta — o eixo A.
 *
 * A aplicação faz isto no painel /pessoas, e só um super_admin lá chega. Este
 * script existe para o caso em que não há nenhum super_admin: um projeto novo,
 * um ambiente local, ou a conta que devia sê-lo ainda não existia quando a
 * migração correu. É a porta dos fundos, e é por isso que corre fora da
 * aplicação, com a service_role, na linha de comandos de quem tem as chaves.
 *
 * Substitui o `dar-admin`, que dava `admin` de quadro em quadro por não haver
 * papel global nenhum que os apanhasse a todos.
 *
 * Uso:
 *   npm run papel-global -- pessoa@empresa.pt super_admin
 *   npm run papel-global -- pessoa@empresa.pt admin
 *   npm run papel-global -- pessoa@empresa.pt externo
 *   npm run papel-global -- --listar
 */

import { createClient } from "@supabase/supabase-js";

const PAPEIS = ["super_admin", "admin", "externo"];

const argumentos = process.argv.slice(2);
const LISTAR = argumentos.includes("--listar");
const [email, papel] = argumentos.filter((a) => !a.startsWith("--"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !chave) {
  falhar(
    "Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    "Confirma que o .env.local existe e está preenchido (ver .env.example).",
  );
}

const bd = createClient(url, chave, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (LISTAR) {
  await listar();
  process.exit(0);
}

if (!email || !papel) {
  falhar(
    "Faltam argumentos.",
    "Uso: npm run papel-global -- pessoa@empresa.pt super_admin",
    "     npm run papel-global -- --listar",
  );
}

if (!PAPEIS.includes(papel)) {
  falhar(
    `"${papel}" não é um papel global.`,
    `Os que existem são: ${PAPEIS.join(", ")}.`,
  );
}

const conta = await procurarConta(email);
if (!conta) {
  falhar(
    `Não existe conta com o email ${email}.`,
    `Cria-a primeiro: npm run primeiro-admin -- ${email} "Nome"`,
  );
}

const { data: antes } = await bd
  .from("profiles")
  .select("nome, papel_global, ativo")
  .eq("id", conta.id)
  .single();

if (antes.papel_global === papel) {
  console.log(`\n${antes.nome} já é ${papel}. Nada a fazer.\n`);
  process.exit(0);
}

/*
  A mesma regra que a aplicação impõe: a plataforma não pode ficar sem
  super_admin. Aqui é uma verificação e não uma restrição da base de dados,
  porque quem corre isto pode estar precisamente a recuperar de um engano —
  mas passar-lhe por cima em silêncio seria mau.
*/
if (antes.papel_global === "super_admin" && antes.ativo) {
  const { count } = await bd
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("papel_global", "super_admin")
    .eq("ativo", true);

  if ((count ?? 0) <= 1) {
    falhar(
      `${antes.nome} é a última conta super_admin ativa.`,
      "Promove outra pessoa antes de a despromover, senão fica-se sem ninguém",
      "que possa voltar a promover alguém pela aplicação.",
    );
  }
}

const { error } = await bd
  .from("profiles")
  .update({ papel_global: papel })
  .eq("id", conta.id);

if (error) {
  falhar("Não consegui alterar o papel.", error.message);
}

console.log(`
✓ ${antes.nome} <${email}>
  ${antes.papel_global} → ${papel}
`);

/* ------------------------------------------------------------------------- */

async function procurarConta(alvo) {
  for (let pagina = 1; ; pagina += 1) {
    const { data, error } = await bd.auth.admin.listUsers({
      page: pagina,
      perPage: 200,
    });
    if (error) falhar("Não consegui listar as contas.", error.message);

    const encontrada = data.users.find(
      (u) => u.email?.toLowerCase() === alvo.toLowerCase(),
    );
    if (encontrada) return encontrada;
    if (data.users.length < 200) return null;
  }
}

async function listar() {
  const { data, error } = await bd
    .from("profiles")
    .select("id, nome, papel_global, ativo")
    .order("papel_global")
    .order("nome");

  if (error) falhar("Não consegui ler os perfis.", error.message);

  const emails = new Map();
  for (let pagina = 1; ; pagina += 1) {
    const { data: contas } = await bd.auth.admin.listUsers({
      page: pagina,
      perPage: 200,
    });
    for (const conta of contas.users) emails.set(conta.id, conta.email);
    if (contas.users.length < 200) break;
  }

  console.log();
  for (const papelAtual of PAPEIS) {
    const doPapel = data.filter((p) => p.papel_global === papelAtual);
    if (!doPapel.length) continue;
    console.log(`${papelAtual}`);
    for (const pessoa of doPapel) {
      console.log(
        `  ${pessoa.ativo ? " " : "×"} ${pessoa.nome}  <${emails.get(pessoa.id) ?? "?"}>`,
      );
    }
    console.log();
  }
  console.log("  × = conta desativada\n");
}

function falhar(...linhas) {
  console.error(`\n✗ ${linhas.join("\n  ")}\n`);
  process.exit(1);
}
