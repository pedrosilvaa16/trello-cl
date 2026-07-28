/**
 * Extrai tudo o que existe numa conta Trello para ficheiros JSON locais.
 *
 * Esta é a primeira metade da migração e não escreve nada na base de dados:
 * puxa os dados, guarda-os em bruto e faz o inventário do que lá está. Só
 * depois de sabermos o que existe é que faz sentido decidir o que o esquema
 * precisa de crescer — a especificação põe checklists e campos personalizados
 * fora de âmbito, e essa decisão só se revê perante dados a sério.
 *
 * Uso:
 *   npm run trello:extrair
 *
 * Precisa de TRELLO_API_KEY e TRELLO_TOKEN no .env.local.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CHAVE = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const DESTINO = path.resolve("dados-trello");

if (!CHAVE || !TOKEN) {
  console.error(`
✗ Faltam credenciais.

  Põe no .env.local:
    TRELLO_API_KEY=<a chave de 32 caracteres>
    TRELLO_TOKEN=<o token de 64 caracteres>

  O token não é o "Segredo" do painel da Trello (esse é o OAuth secret e não
  serve para a API REST). Gera-o abrindo este endereço no browser, já com a
  tua chave, e autorizando:

    https://trello.com/1/authorize?expiration=1day&scope=read&response_type=token&name=Importador%20Quadros&key=<A_TUA_CHAVE>
`);
  process.exit(1);
}

/* --------------------------------------------------------------- pedidos -- */

let pedidosFeitos = 0;

/**
 * Um pedido à API, com travão e reententativas.
 *
 * A Trello corta a 100 pedidos por 10 segundos por chave. O intervalo de 120 ms
 * mantém-nos por baixo disso sem tornar a extração lenta, e o 429 é respeitado
 * com espera crescente para o caso de haver outra coisa a usar a mesma chave.
 */
async function pedir(caminho, parametros = {}) {
  const url = new URL(`https://api.trello.com/1/${caminho}`);
  url.searchParams.set("key", CHAVE);
  url.searchParams.set("token", TOKEN);
  for (const [nome, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null) {
      url.searchParams.set(nome, String(valor));
    }
  }

  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    await dormir(120);
    pedidosFeitos += 1;

    const resposta = await fetch(url);

    if (resposta.status === 429) {
      const espera = 2000 * (tentativa + 1);
      console.log(`   (limite de pedidos atingido, a esperar ${espera / 1000}s)`);
      await dormir(espera);
      continue;
    }

    if (resposta.status === 401 || resposta.status === 400) {
      const detalhe = await resposta.text();
      throw new Error(
        `A Trello recusou as credenciais (HTTP ${resposta.status}: ${detalhe.trim()}).\n` +
          `  Confirma TRELLO_API_KEY e TRELLO_TOKEN. Atenção: o "Segredo" do painel\n` +
          `  é o OAuth secret e não serve como token.`,
      );
    }

    if (!resposta.ok) {
      throw new Error(
        `GET ${caminho} devolveu HTTP ${resposta.status}: ${(await resposta.text()).trim()}`,
      );
    }

    return resposta.json();
  }

  throw new Error(`GET ${caminho} falhou depois de 5 tentativas.`);
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Percorre um recurso paginado para trás no tempo.
 *
 * As `actions` (de onde vêm os comentários) devolvem no máximo 1000 de cada
 * vez. A paginação da Trello faz-se com `before`, apontado ao mais antigo que
 * já se leu — sem isto, um quadro com muita conversa perdia tudo o que passasse
 * das primeiras mil linhas, e em silêncio.
 */
async function pedirTudo(caminho, parametros = {}) {
  const juntos = [];
  let antesDe;

  for (;;) {
    const pagina = await pedir(caminho, {
      ...parametros,
      limit: 1000,
      before: antesDe,
    });
    if (!Array.isArray(pagina) || pagina.length === 0) break;

    juntos.push(...pagina);
    if (pagina.length < 1000) break;

    antesDe = pagina[pagina.length - 1].date ?? pagina[pagina.length - 1].id;
    if (!antesDe) break;
  }

  return juntos;
}

/* -------------------------------------------------------------- extração -- */

console.log("→ A confirmar as credenciais");
const eu = await pedir("members/me", {
  fields: "id,username,fullName,email,initials",
});
console.log(`  Ligado como ${eu.fullName} (@${eu.username})`);

console.log("→ Quadros");
const quadros = await pedir("members/me/boards", {
  // `filter=all` traz também os arquivados; a plataforma tem para onde os pôr.
  filter: "all",
  fields: "id,name,desc,closed,prefs,shortUrl,dateLastActivity,idOrganization",
});
console.log(`  ${quadros.length} quadros (incluindo arquivados)`);

await mkdir(DESTINO, { recursive: true });

const extraidos = [];

for (const [indice, quadro] of quadros.entries()) {
  console.log(
    `\n[${indice + 1}/${quadros.length}] ${quadro.name}${quadro.closed ? " (arquivado)" : ""}`,
  );

  const [listas, cartoes, etiquetas, membros, associacoes, camposPersonalizados] =
    await Promise.all([
      pedir(`boards/${quadro.id}/lists`, {
        filter: "all",
        fields: "id,name,pos,closed",
      }),
      pedir(`boards/${quadro.id}/cards`, {
        filter: "all",
        fields:
          "id,name,desc,pos,due,dueComplete,closed,idList,idMembers,idLabels,shortUrl,dateLastActivity",
        attachments: "true",
        attachment_fields: "id,name,url,bytes,mimeType,date,idMember,isUpload",
        checklists: "all",
        checklist_fields: "id,name,pos",
        customFieldItems: "true",
      }),
      pedir(`boards/${quadro.id}/labels`, {
        fields: "id,name,color",
        limit: 1000,
      }),
      pedir(`boards/${quadro.id}/members`, {
        fields: "id,username,fullName,initials",
      }),
      pedir(`boards/${quadro.id}/memberships`, { member: "false" }),
      pedir(`boards/${quadro.id}/customFields`).catch(() => []),
    ]);

  // Os comentários vivem no fluxo de atividade do quadro, não no cartão.
  const comentarios = await pedirTudo(`boards/${quadro.id}/actions`, {
    filter: "commentCard",
    memberCreator_fields: "id,username,fullName",
  });

  const completo = {
    quadro,
    listas,
    cartoes,
    etiquetas,
    membros,
    associacoes,
    camposPersonalizados,
    comentarios,
  };

  await writeFile(
    path.join(DESTINO, `${ficheiroSeguro(quadro.name)}-${quadro.id}.json`),
    JSON.stringify(completo, null, 2),
    "utf8",
  );

  const checklists = cartoes.flatMap((c) => c.checklists ?? []);
  const anexos = cartoes.flatMap((c) => c.attachments ?? []);

  console.log(
    `  ${listas.length} listas · ${cartoes.length} cartões · ` +
      `${comentarios.length} comentários · ${anexos.length} anexos · ` +
      `${checklists.length} checklists`,
  );

  extraidos.push(completo);
}

/* ------------------------------------------------------------ inventário -- */

const total = (fn) => extraidos.reduce((soma, q) => soma + fn(q), 0);
const todosCartoes = extraidos.flatMap((q) => q.cartoes);
const todosAnexos = todosCartoes.flatMap((c) => c.attachments ?? []);
const todasChecklists = todosCartoes.flatMap((c) => c.checklists ?? []);

const pessoas = new Map();
for (const q of extraidos) {
  for (const m of q.membros) pessoas.set(m.id, m);
}

const inventario = {
  extraidoEm: new Date().toISOString(),
  conta: { id: eu.id, username: eu.username, nome: eu.fullName, email: eu.email },
  totais: {
    quadros: extraidos.length,
    quadrosArquivados: extraidos.filter((q) => q.quadro.closed).length,
    listas: total((q) => q.listas.length),
    cartoes: todosCartoes.length,
    cartoesArquivados: todosCartoes.filter((c) => c.closed).length,
    etiquetas: total((q) => q.etiquetas.length),
    comentarios: total((q) => q.comentarios.length),
    anexos: todosAnexos.length,
    anexosCarregados: todosAnexos.filter((a) => a.isUpload).length,
    anexosPorLigacao: todosAnexos.filter((a) => !a.isUpload).length,
    checklists: todasChecklists.length,
    itensDeChecklist: todasChecklists.reduce(
      (soma, l) => soma + (l.checkItems?.length ?? 0),
      0,
    ),
    camposPersonalizados: total((q) => q.camposPersonalizados.length),
    pessoas: pessoas.size,
    cartoesComDataLimite: todosCartoes.filter((c) => c.due).length,
  },
  /*
    O que a Trello tem e a especificação pôs fora de âmbito (secção 5). Serve
    para decidir, com números à frente, o que vale a pena acrescentar ao
    esquema — e o que simplesmente não existe nestes quadros.
  */
  foraDoEsquemaAtual: {
    checklists: todasChecklists.length,
    camposPersonalizados: total((q) => q.camposPersonalizados.length),
    anexosQueSaoApenasLigacoes: todosAnexos.filter((a) => !a.isUpload).length,
    maiorAnexoBytes: Math.max(0, ...todosAnexos.map((a) => a.bytes ?? 0)),
    anexosAcimaDe25MB: todosAnexos.filter((a) => (a.bytes ?? 0) > 26214400).length,
  },
  /*
    A API da Trello não devolve o email de terceiros — só o da própria conta.
    Sem email não há forma automática de ligar cada pessoa da Trello a um perfil
    da plataforma, por isso esta lista é o que vai pedir uma decisão humana.
  */
  pessoasParaMapear: [...pessoas.values()].map((m) => ({
    idTrello: m.id,
    username: m.username,
    nome: m.fullName,
    email: m.id === eu.id ? eu.email : null,
  })),
  quadros: extraidos.map((q) => ({
    id: q.quadro.id,
    nome: q.quadro.name,
    arquivado: q.quadro.closed,
    listas: q.listas.length,
    cartoes: q.cartoes.length,
    comentarios: q.comentarios.length,
    anexos: q.cartoes.flatMap((c) => c.attachments ?? []).length,
    checklists: q.cartoes.flatMap((c) => c.checklists ?? []).length,
  })),
};

await writeFile(
  path.join(DESTINO, "inventario.json"),
  JSON.stringify(inventario, null, 2),
  "utf8",
);

console.log(`
────────────────────────────────────────────────────────
Inventário

  Quadros            ${inventario.totais.quadros} (${inventario.totais.quadrosArquivados} arquivados)
  Listas             ${inventario.totais.listas}
  Cartões            ${inventario.totais.cartoes} (${inventario.totais.cartoesArquivados} arquivados)
  Etiquetas          ${inventario.totais.etiquetas}
  Comentários        ${inventario.totais.comentarios}
  Anexos             ${inventario.totais.anexos} (${inventario.totais.anexosCarregados} ficheiros, ${inventario.totais.anexosPorLigacao} ligações)
  Checklists         ${inventario.totais.checklists} (${inventario.totais.itensDeChecklist} itens)
  Campos person.     ${inventario.totais.camposPersonalizados}
  Pessoas            ${inventario.totais.pessoas}

Fora do esquema atual
  Checklists                 ${inventario.foraDoEsquemaAtual.checklists}
  Campos personalizados      ${inventario.foraDoEsquemaAtual.camposPersonalizados}
  Anexos que são só links    ${inventario.foraDoEsquemaAtual.anexosQueSaoApenasLigacoes}
  Anexos acima de 25 MB      ${inventario.foraDoEsquemaAtual.anexosAcimaDe25MB}

${pedidosFeitos} pedidos à API. Dados em ${path.relative(process.cwd(), DESTINO)}/
────────────────────────────────────────────────────────
`);

function ficheiroSeguro(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}
