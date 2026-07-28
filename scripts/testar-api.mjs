/**
 * Testes de aceitação ao nível do HTTP.
 *
 * Os testes em SQL (supabase/tests/, `npm run bd:testar`) cobrem as políticas e
 * as funções. Estes cobrem o que fica por cima delas: as rotas. É a única forma
 * de fazer o teste 2 da especificação como ele está escrito — "não obtém URL
 * assinado de um anexo do quadro B, mesmo chamando a rota diretamente com o id
 * do anexo" — porque isso é um handler, não é uma tabela.
 *
 * SESSÕES REAIS, NUNCA A service_role. As contas fazem login a sério e o que
 * vai em cada pedido é o cookie de sessão delas, montado pelo mesmo
 * `@supabase/ssr` que a aplicação usa — replicar o formato à mão seria uma
 * cópia a divergir da original à primeira atualização.
 *
 * A service_role aparece só para montar e desmontar o cenário (criar contas,
 * quadros e cartões, e apagá-los no fim). Nenhuma asserção passa por ela.
 *
 * Uso:
 *   1. Levanta um Supabase local:  supabase start
 *   2. Levanta a aplicação:        npm run build && npm run start
 *   3. npm run testar:api
 *
 * Contra o projeto remoto é preciso dizê-lo à letra:
 *   npm run testar:api -- --mesmo-em-producao
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EM_PRODUCAO = process.argv.includes("--mesmo-em-producao");

if (!URL_SUPABASE || !CHAVE_PUBLICA || !CHAVE_SERVICO) {
  falhar("Faltam as variáveis do Supabase. Ver .env.example.");
}

/*
  Estes testes criam e apagam contas. Num Supabase local isso não custa nada;
  no projeto que está em uso, custa. Por isso o remoto exige um sinal explícito
  — e não basta ter as variáveis certas no ambiente.
*/
const eLocal = /(127\.0\.0\.1|localhost)/.test(URL_SUPABASE);
if (!eLocal && !EM_PRODUCAO) {
  falhar(
    `NEXT_PUBLIC_SUPABASE_URL aponta para ${URL_SUPABASE}, que não é local.`,
    "Levanta um Supabase local com `supabase start`, ou repete com",
    "--mesmo-em-producao se souberes bem o que estás a fazer.",
  );
}

const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* --------------------------------------------------------------- asserções */

let passados = 0;
const falhados = [];

function verificar(descricao, condicao, detalhe = "") {
  if (condicao) {
    passados += 1;
    console.log(`  ok  ${descricao}`);
  } else {
    falhados.push(descricao);
    console.log(`  ✗   ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function falhar(...linhas) {
  console.error(`\n✗ ${linhas.join("\n  ")}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ sessões */

/**
 * Faz login e devolve algo que sabe pedir à aplicação como aquela pessoa.
 *
 * O frasco de cookies é preenchido pelo próprio `@supabase/ssr`: o formato do
 * cookie de sessão (nome, base64, divisão em pedaços) é um detalhe da
 * biblioteca, e é ela que o escreve aqui exatamente como o escreveria no
 * browser.
 */
async function entrarComo(email, palavraPasse) {
  const frasco = new Map();

  const cliente = createServerClient(URL_SUPABASE, CHAVE_PUBLICA, {
    cookies: {
      getAll: () => [...frasco.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) frasco.set(name, value);
      },
    },
  });

  const { error } = await cliente.auth.signInWithPassword({
    email,
    password: palavraPasse,
  });

  const cabecalho = [...frasco.entries()]
    .map(([nome, valor]) => `${nome}=${encodeURIComponent(valor)}`)
    .join("; ");

  return {
    email,
    erroDeEntrada: error,
    conseguiuEntrar: !error && frasco.size > 0,
    async pedir(caminho, opcoes = {}) {
      const resposta = await fetch(`${APP}${caminho}`, {
        ...opcoes,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          Cookie: cabecalho,
          ...(opcoes.headers ?? {}),
        },
      });
      let corpo = null;
      try {
        corpo = await resposta.clone().json();
      } catch {
        corpo = null;
      }
      return { estado: resposta.status, corpo, resposta };
    },
  };
}

/** Sem cookie nenhum: o caso de quem não tem sessão. */
const anonimo = {
  async pedir(caminho, opcoes = {}) {
    const resposta = await fetch(`${APP}${caminho}`, {
      ...opcoes,
      redirect: "manual",
      headers: { "Content-Type": "application/json", ...(opcoes.headers ?? {}) },
    });
    let corpo = null;
    try {
      corpo = await resposta.clone().json();
    } catch {
      corpo = null;
    }
    return { estado: resposta.status, corpo, resposta };
  },
};

/* ------------------------------------------------------------------ cenário */

const MARCA = `teste-api-${Date.now()}`;
const PALAVRA_PASSE = "palavra-passe-de-teste-123";
const criadas = [];

async function criarConta(alcunha, papelGlobal, dominio) {
  const email = `${MARCA}-${alcunha}@${dominio}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PALAVRA_PASSE,
    email_confirm: true,
    user_metadata: { nome: `Teste ${alcunha}` },
  });
  if (error) falhar(`Não consegui criar a conta ${email}: ${error.message}`);

  criadas.push(data.user.id);
  await admin
    .from("profiles")
    .update({ papel_global: papelGlobal })
    .eq("id", data.user.id);

  return { id: data.user.id, email };
}

async function montarCenario() {
  // O trigger em auth.users recusa emails fora dos domínios da empresa. Se a
  // lista estiver preenchida, os emails de teste têm de caber lá.
  const { data: dominios } = await admin
    .from("dominios_permitidos")
    .select("dominio")
    .limit(1);
  const dominio = dominios?.[0]?.dominio ?? "exemplo.pt";

  const sofia = await criarConta("sofia", "super_admin", dominio);
  const marta = await criarConta("marta", "admin", dominio);
  const rui = await criarConta("rui", "admin", dominio);
  const clienteA = await criarConta("cliente-a", "externo", dominio);
  const clienteB = await criarConta("cliente-b", "externo", dominio);
  const nuno = await criarConta("nuno", "externo", dominio);
  const velho = await criarConta("velho", "externo", dominio);

  const quadroA = await criarQuadro(`${MARCA} Cliente A`, marta.id);
  const quadroB = await criarQuadro(`${MARCA} Cliente B`, rui.id);

  const cartaoX = await criarCartao(quadroA, "Cartão X");
  const cartaoY = await criarCartao(quadroA, "Cartão Y");
  const cartaoZ = await criarCartao(quadroB, "Cartão Z");

  const anexoA = await criarAnexo(cartaoX, quadroA, marta.id, "briefing-a.pdf");
  const anexoB = await criarAnexo(cartaoZ, quadroB, rui.id, "orcamento-b.pdf");

  await admin.from("board_members").insert([
    { board_id: quadroA, user_id: clienteA.id, papel: "comentador" },
    { board_id: quadroA, user_id: velho.id, papel: "editor" },
    { board_id: quadroB, user_id: clienteB.id, papel: "comentador" },
  ]);

  await admin.from("card_access").insert({
    card_id: cartaoX,
    user_id: nuno.id,
    papel: "editor",
    concedido_por: marta.id,
  });

  return {
    sofia, marta, rui, clienteA, clienteB, nuno, velho,
    quadroA, quadroB, cartaoX, cartaoY, cartaoZ, anexoA, anexoB,
  };
}

async function criarQuadro(nome, dono) {
  const { data, error } = await admin
    .from("boards")
    .insert({ nome, criado_por: dono })
    .select("id")
    .single();
  if (error) falhar(`Não consegui criar o quadro: ${error.message}`);
  await admin
    .from("board_members")
    .insert({ board_id: data.id, user_id: dono, papel: "gestor" });
  return data.id;
}

async function criarCartao(quadro, titulo) {
  const { data: lista } = await admin
    .from("lists")
    .upsert({ board_id: quadro, nome: "Em curso", posicao: 1 })
    .select("id")
    .single();
  const { data, error } = await admin
    .from("cards")
    .insert({ list_id: lista.id, titulo, posicao: 1 })
    .select("id")
    .single();
  if (error) falhar(`Não consegui criar o cartão: ${error.message}`);
  return data.id;
}

async function criarAnexo(cartao, quadro, autor, nome) {
  const { data, error } = await admin
    .from("attachments")
    .insert({
      card_id: cartao,
      nome_ficheiro: nome,
      caminho_storage: `boards/${quadro}/cards/${cartao}/${crypto.randomUUID()}-${nome}`,
      tamanho_bytes: 1024,
      tipo_mime: "application/pdf",
      carregado_por: autor,
    })
    .select("id")
    .single();
  if (error) falhar(`Não consegui criar o anexo: ${error.message}`);
  return data.id;
}

/**
 * Desmonta tudo. As contas vão em último e levam à frente, em cascata, tudo o
 * que lhes está pendurado.
 */
async function desmontarCenario(cenario) {
  for (const quadro of [cenario?.quadroA, cenario?.quadroB].filter(Boolean)) {
    await admin.from("boards").delete().eq("id", quadro);
  }
  for (const id of criadas) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

/* -------------------------------------------------------------------- testes */

async function correr() {
  console.log(`\n→ Aplicação em ${APP}`);
  console.log(`→ Supabase em ${URL_SUPABASE}${eLocal ? " (local)" : " (REMOTO)"}\n`);

  const resposta = await fetch(APP, { redirect: "manual" }).catch(() => null);
  if (!resposta) {
    falhar(
      `A aplicação não responde em ${APP}.`,
      "Levanta-a com `npm run build && npm run start` antes de correr isto.",
    );
  }

  const c = await montarCenario();

  const sofia = await entrarComo(c.sofia.email, PALAVRA_PASSE);
  const marta = await entrarComo(c.marta.email, PALAVRA_PASSE);
  const clienteA = await entrarComo(c.clienteA.email, PALAVRA_PASSE);
  const nuno = await entrarComo(c.nuno.email, PALAVRA_PASSE);

  for (const sessao of [sofia, marta, clienteA, nuno]) {
    if (!sessao.conseguiuEntrar) {
      falhar(
        `Não consegui iniciar sessão como ${sessao.email}.`,
        sessao.erroDeEntrada?.message ?? "",
      );
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n== 2. O anexo do quadro alheio, pedido à rota diretamente ==");

  {
    const r = await clienteA.pedir(`/api/anexos/${c.anexoB}`);
    verificar(
      "o cliente A leva 404 no anexo do quadro B",
      r.estado === 404,
      `devolveu ${r.estado}`,
    );
    verificar(
      "e a resposta não traz o URL assinado nem o caminho no storage",
      !JSON.stringify(r.corpo ?? {}).includes("http") &&
        !JSON.stringify(r.corpo ?? {}).includes("boards/"),
    );

    const location = r.resposta.headers.get("location");
    verificar("nem um redirecionamento para o R2", !location);
  }

  {
    // Controlo positivo: sem isto, um 404 por a rota estar partida passava por
    // segurança. O anexo do quadro dele TEM de funcionar.
    const r = await clienteA.pedir(`/api/anexos/${c.anexoA}`);
    verificar(
      "mas o anexo do quadro dele devolve um URL assinado",
      r.estado === 307 || r.estado === 302,
      `devolveu ${r.estado}`,
    );
  }

  {
    const r = await anonimo.pedir(`/api/anexos/${c.anexoA}`);
    verificar(
      "sem sessão, a rota dos anexos responde 401 ou manda entrar",
      r.estado === 401 || r.estado === 307,
      `devolveu ${r.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== 3. O freelancer, pela rota dos anexos ==");

  {
    const doSeu = await nuno.pedir(`/api/anexos/${c.anexoA}`);
    verificar(
      "chega ao anexo do cartão que lhe deram",
      doSeu.estado === 307 || doSeu.estado === 302,
      `devolveu ${doSeu.estado}`,
    );

    const doOutro = await nuno.pedir(`/api/anexos/${c.anexoB}`);
    verificar(
      "e não chega ao anexo de um quadro onde não tem nada",
      doOutro.estado === 404,
      `devolveu ${doOutro.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== 5. O admin não altera papéis globais pelo API ==");

  {
    const r = await marta.pedir(`/api/pessoas/${c.nuno.id}`, {
      method: "PATCH",
      body: JSON.stringify({ papelGlobal: "admin" }),
    });
    verificar("PATCH /api/pessoas/[id] devolve 403", r.estado === 403, `devolveu ${r.estado}`);

    const { data } = await admin
      .from("profiles")
      .select("papel_global")
      .eq("id", c.nuno.id)
      .single();
    verificar("e o papel não mudou na base de dados", data.papel_global === "externo");
  }

  {
    const r = await marta.pedir(`/api/pessoas/${c.rui.id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    verificar(
      "PATCH /api/pessoas/[id]/estado devolve 403",
      r.estado === 403,
      `devolveu ${r.estado}`,
    );
  }

  {
    const r = await marta.pedir("/api/pessoas/convidar", {
      method: "POST",
      body: JSON.stringify({
        email: `${MARCA}-intruso@exemplo.pt`,
        papelGlobal: "super_admin",
        acessos: [],
      }),
    });
    verificar(
      "e não convida ninguém para super_admin",
      r.estado === 403,
      `devolveu ${r.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== 6. O admin não mexe em quadros alheios ==");

  {
    const r = await marta.pedir(`/api/quadros/${c.quadroB}/membros`, {
      method: "POST",
      body: JSON.stringify({ utilizador: c.marta.id, papel: "gestor" }),
    });
    verificar(
      "não se acrescenta ao quadro do rui",
      r.estado === 403,
      `devolveu ${r.estado}`,
    );

    const { count } = await admin
      .from("board_members")
      .select("board_id", { count: "exact", head: true })
      .eq("board_id", c.quadroB)
      .eq("user_id", c.marta.id);
    verificar("e não ficou lá nenhuma linha", count === 0);
  }

  {
    const r = await marta.pedir(`/api/cartoes/${c.cartaoZ}/acessos`, {
      method: "POST",
      body: JSON.stringify({ utilizador: c.nuno.id, papel: "editor" }),
    });
    verificar(
      "nem dá um cartão do rui a um freelancer",
      r.estado === 403,
      `devolveu ${r.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== Âmbito do painel de pessoas ==");

  {
    const r = await nuno.pedir("/api/pessoas");
    verificar(
      "um externo não chega à lista de pessoas",
      r.estado === 403,
      `devolveu ${r.estado}`,
    );
  }

  {
    const r = await sofia.pedir("/api/pessoas");
    verificar("o super_admin chega", r.estado === 200, `devolveu ${r.estado}`);
    verificar(
      "e vê as contas todas do cenário",
      (r.corpo?.pessoas ?? []).filter((p) => p.email.startsWith(MARCA)).length === 7,
    );
  }

  {
    const r = await marta.pedir("/api/pessoas");
    const emails = (r.corpo?.pessoas ?? []).map((p) => p.email);
    verificar("o admin chega", r.estado === 200, `devolveu ${r.estado}`);
    verificar(
      "mas só vê quem partilha quadros consigo",
      !emails.includes(c.rui.email),
      `viu ${c.rui.email}`,
    );
  }

  {
    const r = await anonimo.pedir("/api/pessoas");
    verificar(
      "sem sessão, 401 ou desvio para /entrar",
      r.estado === 401 || r.estado === 307,
      `devolveu ${r.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== 9 e 10. Contas desativadas e a última super_admin ==");

  {
    const r = await sofia.pedir(`/api/pessoas/${c.velho.id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    verificar("o super_admin desativa uma conta", r.estado === 200, `devolveu ${r.estado}`);

    const velho = await entrarComo(c.velho.email, PALAVRA_PASSE);
    verificar(
      "e a partir daí ela nem consegue autenticar-se",
      !velho.conseguiuEntrar,
      "o login passou",
    );
  }

  {
    const r = await sofia.pedir(`/api/pessoas/${c.sofia.id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
    verificar(
      "a última conta super_admin não se desativa",
      r.estado === 400,
      `devolveu ${r.estado}`,
    );

    const r2 = await sofia.pedir(`/api/pessoas/${c.sofia.id}`, {
      method: "PATCH",
      body: JSON.stringify({ papelGlobal: "admin" }),
    });
    verificar(
      "nem se despromove",
      r2.estado === 400,
      `devolveu ${r2.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== Os ecrãs abrem, e cada um aterra onde deve ==");

  /*
    As rotas acima provam as permissões; isto prova que há produto por cima
    delas. Um componente de servidor que rebente devolve 500 — e um modelo de
    acesso impecável atrás de um ecrã partido não serve a ninguém.
  */
  const clienteB = await entrarComo(c.clienteB.email, PALAVRA_PASSE);

  {
    const r = await sofia.pedir("/pessoas");
    const html = await r.resposta.text();
    verificar("/pessoas abre para o super_admin", r.estado === 200, `devolveu ${r.estado}`);
    verificar(
      "e diz-lhe que vê todas as contas",
      html.includes("todas as contas"),
    );
  }

  {
    const r = await sofia.pedir(`/pessoas/${c.nuno.id}`);
    const html = await r.resposta.text();
    verificar(
      "o detalhe de uma pessoa abre",
      r.estado === 200,
      `devolveu ${r.estado}`,
    );
    verificar(
      "e mostra o cartão que lhe foi concedido",
      html.includes("Cartão X"),
    );
  }

  {
    const r = await nuno.pedir("/pessoas");
    const html = await r.resposta.text();
    verificar(
      "um externo abre /pessoas e é mandado embora com uma explicação",
      r.estado === 200 && html.includes("para quem gere pessoas"),
      `devolveu ${r.estado}`,
    );
    verificar(
      "e não vê o email de mais ninguém pelo caminho",
      !html.includes(c.rui.email),
    );
  }

  {
    const r = await nuno.pedir("/os-meus-trabalhos");
    const html = await r.resposta.text();
    verificar(
      "o freelancer abre Os meus trabalhos",
      r.estado === 200,
      `devolveu ${r.estado}`,
    );
    verificar("e lá está o cartão dele", html.includes("Cartão X"));
    verificar(
      "agrupado pelo nome do cliente",
      html.includes(`${MARCA} Cliente A`),
    );
    verificar("sem o cartão do lado", !html.includes("Cartão Y"));
  }

  {
    const bom = await nuno.pedir(`/cartao/${c.cartaoX}`);
    verificar(
      "abre o cartão que lhe deram, fora do quadro",
      bom.estado === 200,
      `devolveu ${bom.estado}`,
    );

    const mau = await nuno.pedir(`/cartao/${c.cartaoY}`);
    verificar(
      "e o do lado dá 404",
      mau.estado === 404,
      `devolveu ${mau.estado}`,
    );
  }

  {
    // Um cliente tem um quadro só: a lista de um elemento é um clique a mais.
    const r = await clienteB.pedir("/");
    const destino = r.resposta.headers.get("location") ?? "";
    verificar(
      "o cliente entra e vai direto ao quadro dele",
      r.estado === 307 && destino.includes(`/quadro/${c.quadroB}`),
      `devolveu ${r.estado} para ${destino || "(sem destino)"}`,
    );
  }

  {
    const r = await nuno.pedir("/");
    const destino = r.resposta.headers.get("location") ?? "";
    verificar(
      "o freelancer entra e vai direto aos trabalhos dele",
      r.estado === 307 && destino.includes("/os-meus-trabalhos"),
      `devolveu ${r.estado} para ${destino || "(sem destino)"}`,
    );
  }

  {
    const r = await sofia.pedir("/");
    verificar(
      "e quem gere quadros continua a ver a lista",
      r.estado === 200,
      `devolveu ${r.estado}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n== O quadro continua a ser um quadro ==");

  /*
    As políticas de `cards`, `comments` e `attachments` foram substituídas. É
    aqui que se vê se alguém partiu o produto a caminho de o proteger: um
    modelo de acesso perfeito num quadro que não abre não vale nada.
  */
  {
    const r = await marta.pedir(`/quadro/${c.quadroA}`);
    const html = await r.resposta.text();
    verificar(
      "a gestora abre o quadro dela",
      r.estado === 200,
      `devolveu ${r.estado}`,
    );
    verificar("com os dois cartões lá dentro", html.includes("Cartão X") && html.includes("Cartão Y"));
  }

  {
    const r = await clienteA.pedir(`/quadro/${c.quadroA}`);
    const html = await r.resposta.text();
    verificar(
      "o comentador abre o quadro do cliente dele",
      r.estado === 200,
      `devolveu ${r.estado}`,
    );
    verificar("e vê os cartões", html.includes("Cartão X"));
  }

  {
    const r = await clienteA.pedir(`/quadro/${c.quadroB}`);
    verificar(
      "e o quadro do concorrente dá 404, não «sem permissão»",
      r.estado === 404,
      `devolveu ${r.estado}`,
    );
  }

  {
    const r = await sofia.pedir(`/quadro/${c.quadroB}`);
    verificar(
      "o super_admin abre um quadro de que não é membro",
      r.estado === 200,
      `devolveu ${r.estado}`,
    );
  }

  return c;
}

/* -------------------------------------------------------------------- saída */

let cenario;
try {
  cenario = await correr();
} catch (erro) {
  console.error("\n✗ Rebentou a meio:", erro);
  falhados.push("execução");
} finally {
  await desmontarCenario(cenario);
}

console.log(
  `\n${falhados.length ? "✗" : "✓"} ${passados} passaram, ${falhados.length} falharam.\n`,
);
if (falhados.length) {
  for (const f of falhados) console.log(`  ✗ ${f}`);
  console.log();
  process.exit(1);
}
