/**
 * Importa para a plataforma o que `trello-extrair.mjs` guardou em dados-trello/.
 *
 * Corre com a service_role, e tem de ser assim: as políticas de RLS exigem
 * `autor_id = auth.uid()` num comentário: a regra certa para o produto e
 * exatamente aquilo que uma migração tem de contornar, porque está a escrever
 * em nome de dezassete pessoas ao mesmo tempo.
 *
 * É repetível. Cada objeto criado fica registado em `importacoes_trello`, por
 * isso correr duas vezes não duplica nada e uma corrida interrompida a meio
 * retoma de onde ficou — com 800 ficheiros a transferir, isso vai acontecer.
 *
 * Uso:
 *   npm run trello:importar -- --admin=ana@empresa.pt
 *   npm run trello:importar -- --admin=ana@empresa.pt --so-metadados
 *   npm run trello:importar -- --admin=ana@empresa.pt --quadro="Fero"
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  LIMITES,
  PAPEIS,
  corEtiqueta,
  corQuadro,
  criadoEm,
  cortar,
  descricaoCompleta,
  nomeSeguro,
  vaiParaBucket,
} from "./trello-conversao.mjs";

const ORIGEM = path.resolve("dados-trello");
const MAPA_PESSOAS = path.join(ORIGEM, "mapa-pessoas.json");

const argumentos = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [nome, ...resto] = a.replace(/^--/, "").split("=");
    return [nome, resto.length ? resto.join("=") : true];
  }),
);

const EMAIL_ADMIN = argumentos.admin;
const SO_METADADOS = !!argumentos["so-metadados"];
const SO_QUADRO = argumentos.quadro;

if (!EMAIL_ADMIN) {
  falhar(
    "Falta --admin.",
    'Uso: npm run trello:importar -- --admin=ana@empresa.pt\n' +
      "  É a conta que fica admin de todos os quadros importados, e tem de já existir.",
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAVE_TRELLO = process.env.TRELLO_API_KEY;
const TOKEN_TRELLO = process.env.TRELLO_TOKEN;

if (!url || !chaveServico) falhar("Faltam as variáveis do Supabase.", "Ver .env.example.");

const bd = createClient(url, chaveServico, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ------------------------------------------------------------------ dados -- */

console.log("→ A ler dados-trello/");
if (!existsSync(ORIGEM)) {
  falhar("Não há dados extraídos.", "Corre primeiro: npm run trello:extrair");
}

const ficheiros = (await readdir(ORIGEM))
  .filter((f) => f.endsWith(".json") && !["inventario.json", "mapa-pessoas.json"].includes(f))
  .sort();

let quadros = [];
for (const f of ficheiros) {
  quadros.push(JSON.parse(await readFile(path.join(ORIGEM, f), "utf8")));
}

if (SO_QUADRO) {
  quadros = quadros.filter(
    (q) => q.quadro.name === SO_QUADRO || q.quadro.id === SO_QUADRO,
  );
  if (!quadros.length) falhar(`Não encontrei o quadro "${SO_QUADRO}".`, "Confirma o nome.");
}

console.log(`  ${quadros.length} quadros`);

/* ---------------------------------------------------------------- pessoas -- */

// O ficheiro de mapeamento nasce vazio na primeira corrida: a API da Trello não
// devolve emails de terceiros, e sem email não há forma de saber quem é quem.
if (!existsSync(MAPA_PESSOAS)) {
  const pessoas = new Map();
  for (const q of quadros) {
    for (const m of q.membros) pessoas.set(m.id, { username: m.username, nome: m.fullName });
    for (const c of q.comentarios) {
      const a = c.memberCreator;
      if (a && !pessoas.has(a.id)) {
        pessoas.set(a.id, { username: a.username, nome: a.fullName ?? a.username });
      }
    }
  }

  const modelo = Object.fromEntries(
    [...pessoas.entries()].map(([id, p]) => [id, { ...p, email: "" }]),
  );

  await writeFile(
    MAPA_PESSOAS,
    JSON.stringify(
      {
        _instrucoes:
          "Escreve o email da conta da plataforma em cada pessoa que deva ficar ligada. " +
          "Quem ficar com email vazio entra como autor externo: o nome é preservado nos " +
          "comentários, mas não fica ligado a nenhuma conta nem recebe cartões atribuídos.",
        pessoas: modelo,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`
✗ Falta dizer quem é quem.

  Criei ${path.relative(process.cwd(), MAPA_PESSOAS)} com ${pessoas.size} pessoas.
  Preenche o "email" de quem já tem conta na plataforma e volta a correr.
  Quem ficar em branco entra como autor externo — nada se perde, mas fica
  sem ligação a uma conta.
`);
  process.exit(1);
}

const mapa = JSON.parse(await readFile(MAPA_PESSOAS, "utf8"));

console.log("→ A resolver pessoas");

// Lista todas as contas para casar emails. São poucas; a paginação é por
// segurança e não por necessidade.
const contas = [];
for (let pagina = 1; ; pagina += 1) {
  const { data, error } = await bd.auth.admin.listUsers({ page: pagina, perPage: 200 });
  if (error) falhar("Não consegui listar as contas.", error.message);
  contas.push(...data.users);
  if (data.users.length < 200) break;
}

const porEmail = new Map(
  contas.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]),
);

const admin = porEmail.get(String(EMAIL_ADMIN).toLowerCase());
if (!admin) {
  falhar(
    `Não existe conta com o email ${EMAIL_ADMIN}.`,
    "Cria-a primeiro: npm run primeiro-admin -- " + EMAIL_ADMIN + ' "Nome"',
  );
}

/** idTrello → { perfil: uuid|null, nome } */
const pessoas = new Map();
for (const [idTrello, p] of Object.entries(mapa.pessoas ?? {})) {
  const perfil = p.email ? porEmail.get(String(p.email).toLowerCase()) ?? null : null;
  if (p.email && !perfil) {
    console.log(`  ! ${p.email} não corresponde a nenhuma conta — fica como externo`);
  }
  pessoas.set(idTrello, { perfil, nome: p.nome || p.username });
}

const ligadas = [...pessoas.values()].filter((p) => p.perfil).length;
console.log(`  ${ligadas} de ${pessoas.size} pessoas ligadas a contas`);

/*
  O elenco vai para a base de dados, não fica só no ficheiro. É o que permite
  corrigir a atribuição mais tarde pela interface: cada comentário e cada anexo
  importado guarda o id da pessoa na Trello, e associar passa a ser um UPDATE
  sobre essas linhas.
*/
{
  const elenco = [...pessoas.entries()].map(([idTrello, p]) => ({
    id_trello: idTrello,
    username: mapa.pessoas[idTrello]?.username ?? "?",
    nome: p.nome,
    perfil_id: p.perfil,
    associado_em: p.perfil ? new Date().toISOString() : null,
  }));
  const { error } = await bd
    .from("pessoas_trello")
    .upsert(elenco, { onConflict: "id_trello" });
  if (error) falhar("Não consegui gravar o elenco da Trello.", error.message);
  console.log(`  ${elenco.length} pessoas registadas em pessoas_trello`);
}

/* -------------------------------------------------------------- registo -- */

console.log("→ A ler o que já foi importado");
const jaFeito = new Map();
for (let de = 0; ; de += 1000) {
  const { data, error } = await bd
    .from("importacoes_trello")
    .select("tipo, id_trello, id_local")
    .range(de, de + 999);
  if (error) {
    falhar(
      "Não consegui ler importacoes_trello.",
      error.message + "\n  As migrações já foram aplicadas? (supabase db push)",
    );
  }
  for (const r of data) jaFeito.set(`${r.tipo}:${r.id_trello}`, r.id_local);
  if (data.length < 1000) break;
}
console.log(`  ${jaFeito.size} objetos já importados`);

const novosRegistos = [];
function idPara(tipo, idTrello) {
  const chave = `${tipo}:${idTrello}`;
  const existente = jaFeito.get(chave);
  if (existente) return { id: existente, novo: false };
  const id = randomUUID();
  jaFeito.set(chave, id);
  novosRegistos.push({ tipo, id_trello: idTrello, id_local: id });
  return { id, novo: true };
}

/**
 * Grava o rasto do que acabou de entrar.
 *
 * Tem de correr logo a seguir a cada inserção, e não no fim do quadro: se a
 * transferência de um anexo rebentar a meio, tudo o que já entrou sem rasto
 * seria reinserido na corrida seguinte — com ids novos, e portanto duplicado.
 */
async function gravarRegistos() {
  const pendentes = novosRegistos.splice(0);
  if (!pendentes.length) return;
  for (let i = 0; i < pendentes.length; i += 500) {
    const { error } = await bd
      .from("importacoes_trello")
      .upsert(pendentes.slice(i, i + 500), {
        onConflict: "tipo,id_trello",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`importacoes_trello: ${error.message}`);
  }
}

async function inserir(tabela, linhas, aoConflito) {
  if (!linhas.length) return;
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    const consulta = aoConflito
      ? bd.from(tabela).upsert(lote, { onConflict: aoConflito, ignoreDuplicates: true })
      : bd.from(tabela).insert(lote);
    const { error } = await consulta;
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
}

/* ------------------------------------------------------------ importação -- */

const contagem = {
  quadros: 0, listas: 0, cartoes: 0, etiquetas: 0, comentarios: 0,
  anexosFicheiro: 0, anexosLigacao: 0, bytes: 0,
  atribuicoesPendentes: 0, falhas: [],
};

for (const [n, dados] of quadros.entries()) {
  const { quadro, listas, cartoes, etiquetas, membros, associacoes, comentarios } = dados;
  console.log(`\n[${n + 1}/${quadros.length}] ${quadro.name}`);

  const q = idPara("quadro", quadro.id);
  if (q.novo) {
    await inserir("boards", [{
      id: q.id,
      nome: cortar(quadro.name, LIMITES.quadroNome) ?? "(sem nome)",
      descricao: cortar(quadro.desc, LIMITES.quadroDescricao),
      cor: corQuadro(quadro.id),
      arquivado: !!quadro.closed,
      criado_por: admin,
      criado_em: criadoEm(quadro.id),
    }]);
    contagem.quadros += 1;
  }
  await gravarRegistos();

  // Quem importa fica sempre admin: sem isto, um quadro cujos membros não
  // estejam mapeados ficaria sem ninguém que lhe pudesse tocar.
  const papelDe = new Map(associacoes.map((a) => [a.idMember, PAPEIS[a.memberType] ?? "editor"]));
  const membrosQuadro = [{ board_id: q.id, user_id: admin, papel: "admin" }];
  for (const m of membros) {
    const p = pessoas.get(m.id);
    if (p?.perfil && p.perfil !== admin) {
      membrosQuadro.push({ board_id: q.id, user_id: p.perfil, papel: papelDe.get(m.id) ?? "editor" });
    }
  }
  await inserir("board_members", membrosQuadro, "board_id,user_id");

  // Quem ainda não tem conta fica em espera, com o papel que tinha na Trello.
  await inserir(
    "membros_trello",
    membros
      .filter((m) => !pessoas.get(m.id)?.perfil)
      .map((m) => ({
        board_id: q.id,
        id_trello: m.id,
        papel: papelDe.get(m.id) ?? "editor",
      })),
    "board_id,id_trello",
  );

  const etiquetasNovas = [];
  for (const e of etiquetas) {
    const r = idPara("etiqueta", e.id);
    if (r.novo) {
      etiquetasNovas.push({
        id: r.id, board_id: q.id,
        nome: cortar(e.name, LIMITES.etiquetaNome) ?? "",
        cor: corEtiqueta(e.color),
        criado_em: criadoEm(e.id),
      });
    }
  }
  await inserir("labels", etiquetasNovas);
  await gravarRegistos();
  contagem.etiquetas += etiquetasNovas.length;

  const listasNovas = [];
  for (const l of listas) {
    const r = idPara("lista", l.id);
    if (r.novo) {
      listasNovas.push({
        id: r.id, board_id: q.id,
        nome: cortar(l.name, LIMITES.listaNome) ?? "(sem nome)",
        posicao: l.pos,
        arquivada: !!l.closed,
        criado_em: criadoEm(l.id),
      });
    }
  }
  await inserir("lists", listasNovas);
  await gravarRegistos();
  contagem.listas += listasNovas.length;

  const cartoesNovos = [];
  const ligacoesEtiqueta = [];
  const ligacoesMembro = [];
  const atribuicoesPendentes = [];

  for (const c of cartoes) {
    const idLista = jaFeito.get(`lista:${c.idList}`);
    if (!idLista) continue; // lista fora deste export

    const r = idPara("cartao", c.id);
    if (r.novo) {
      const autor = pessoas.get(c.idMemberCreator)?.perfil ?? admin;
      cartoesNovos.push({
        id: r.id, list_id: idLista,
        titulo: cortar(c.name, LIMITES.cartaoTitulo) ?? "(sem título)",
        descricao: descricaoCompleta(c),
        posicao: c.pos,
        data_limite: c.due ?? null,
        concluido: !!c.dueComplete,
        arquivado: !!c.closed,
        criado_por: autor,
        criado_em: criadoEm(c.id),
      });
    }

    for (const idEtiqueta of c.idLabels ?? []) {
      const e = jaFeito.get(`etiqueta:${idEtiqueta}`);
      if (e) ligacoesEtiqueta.push({ card_id: r.id, label_id: e });
    }

    for (const idMembro of c.idMembers ?? []) {
      const p = pessoas.get(idMembro);
      // Só entra quem está mapeado: `card_members.user_id` aponta para um
      // perfil real, e não há como atribuir um cartão a quem não tem conta.
      if (p?.perfil) ligacoesMembro.push({ card_id: r.id, user_id: p.perfil });
      else if (pessoas.has(idMembro)) {
        atribuicoesPendentes.push({ card_id: r.id, id_trello: idMembro });
      }
    }
  }

  await inserir("cards", cartoesNovos);
  await gravarRegistos();
  contagem.cartoes += cartoesNovos.length;

  // Só se atribui a quem é membro do quadro — a política de RLS exige-o e o
  // service_role não a aplica, mas a chave estrangeira aplica-se sempre.
  const noQuadro = new Set(membrosQuadro.map((m) => m.user_id));
  await inserir("card_labels", ligacoesEtiqueta, "card_id,label_id");
  await inserir(
    "card_members",
    ligacoesMembro.filter((l) => noQuadro.has(l.user_id)),
    "card_id,user_id",
  );
  await inserir("atribuicoes_trello", atribuicoesPendentes, "card_id,id_trello");
  contagem.atribuicoesPendentes += atribuicoesPendentes.length;

  const comentariosNovos = [];
  for (const c of comentarios) {
    const idCartao = jaFeito.get(`cartao:${c.data?.idCard}`);
    const texto = (c.data?.text ?? "").trim();
    if (!idCartao || !texto) continue;

    const r = idPara("comentario", c.id);
    if (!r.novo) continue;

    const p = pessoas.get(c.idMemberCreator);
    comentariosNovos.push({
      id: r.id, card_id: idCartao,
      // Sem conta ligada, `autor_id` fica nulo em vez de apontar a quem
      // importou: pôr lá o admin era inventar autoria, e tornava a associação
      // impossível de desfazer. O nome vive em autor_externo e a ligação à
      // pessoa da Trello em autor_trello.
      autor_id: p?.perfil ?? null,
      autor_externo: p?.perfil
        ? null
        : (p?.nome ?? c.memberCreator?.fullName ?? "Alguém na Trello").slice(0, LIMITES.autorExterno),
      autor_trello: pessoas.has(c.idMemberCreator) ? c.idMemberCreator : null,
      corpo: texto.slice(0, LIMITES.comentarioCorpo),
      criado_em: c.date,
    });
  }
  await inserir("comments", comentariosNovos);
  await gravarRegistos();
  contagem.comentarios += comentariosNovos.length;

  /* ------------------------------------------------------------- anexos -- */

  const anexos = [];
  for (const c of cartoes) {
    const idCartao = jaFeito.get(`cartao:${c.id}`);
    if (!idCartao) continue;
    for (const a of c.attachments ?? []) anexos.push({ ...a, idCartao });
  }

  const linhasAnexo = [];
  for (const a of anexos) {
    const r = idPara("anexo", a.id);
    if (!r.novo) continue;

    const p = pessoas.get(a.idMember);
    const comum = {
      id: r.id,
      card_id: a.idCartao,
      nome_ficheiro: cortar(a.name, LIMITES.anexoNome) ?? "anexo",
      tipo_mime: a.mimeType || "application/octet-stream",
      carregado_por: p?.perfil ?? null,
      carregado_por_externo: p?.perfil ? null : (p?.nome ?? null),
      autor_trello: pessoas.has(a.idMember) ? a.idMember : null,
      criado_em: a.date ?? criadoEm(a.id),
    };

    if (!vaiParaBucket(a) || SO_METADADOS) {
      linhasAnexo.push({ ...comum, url: a.url });
      contagem.anexosLigacao += 1;
      continue;
    }

    const caminho = `boards/${q.id}/cards/${a.idCartao}/${r.id}-${nomeSeguro(a.name)}`;
    try {
      const ficheiro = await descarregarDaTrello(a.url);
      const { error } = await bd.storage
        .from("anexos")
        .upload(caminho, ficheiro, { contentType: comum.tipo_mime, upsert: true });
      if (error) throw new Error(error.message);

      linhasAnexo.push({
        ...comum,
        caminho_storage: caminho,
        tamanho_bytes: ficheiro.byteLength,
      });
      contagem.anexosFicheiro += 1;
      contagem.bytes += ficheiro.byteLength;
    } catch (erro) {
      // Um ficheiro que não veio não pode levar o resto do quadro atrás:
      // fica como ligação para a Trello e é relatado no fim.
      contagem.falhas.push(`${a.name}: ${erro.message}`);
      linhasAnexo.push({ ...comum, url: a.url });
      contagem.anexosLigacao += 1;
    }

    if ((contagem.anexosFicheiro + contagem.anexosLigacao) % 25 === 0) {
      process.stdout.write(
        `\r  anexos: ${contagem.anexosFicheiro} ficheiros, ${contagem.anexosLigacao} ligações   `,
      );
      // Meia hora de transferência não pode ficar refém do próximo ficheiro.
      await inserir("attachments", linhasAnexo.splice(0));
      await gravarRegistos();
    }
  }

  await inserir("attachments", linhasAnexo);
  await gravarRegistos();

  console.log(
    `\r  ${listasNovas.length} listas · ${cartoesNovos.length} cartões · ` +
      `${comentariosNovos.length} comentários · ${linhasAnexo.length} anexos      `,
  );
}

/* -------------------------------------------------------------- relatório -- */

console.log(`
────────────────────────────────────────────────────────
Importação concluída${SO_METADADOS ? " (só metadados)" : ""}

  Quadros            ${contagem.quadros}
  Listas             ${contagem.listas}
  Cartões            ${contagem.cartoes}
  Etiquetas          ${contagem.etiquetas}
  Comentários        ${contagem.comentarios}
  Anexos ficheiro    ${contagem.anexosFicheiro} (${(contagem.bytes / 1024 / 1024).toFixed(0)} MB)
  Anexos ligação     ${contagem.anexosLigacao}
${
  contagem.atribuicoesPendentes
    ? `\n  ${contagem.atribuicoesPendentes} atribuições de cartão ficaram pendentes.\n  Resolvem-se em /pessoas, associando cada pessoa da Trello a uma conta.`
    : ""
}${
  contagem.falhas.length
    ? `\n  ${contagem.falhas.length} ficheiros não vieram e ficaram como ligação:\n` +
      contagem.falhas.slice(0, 5).map((f) => `    ${f}`).join("\n") +
      (contagem.falhas.length > 5 ? `\n    (e mais ${contagem.falhas.length - 5})` : "")
    : ""
}

Correr outra vez é seguro: o que já entrou não volta a entrar.
────────────────────────────────────────────────────────
`);

/* ----------------------------------------------------------------- apoio -- */

/**
 * Os anexos de um quadro privado não se descarregam sem credenciais — o URL da
 * Trello devolve 401 a quem não se identifica. O cabeçalho tem de ser este.
 */
async function descarregarDaTrello(endereco) {
  const resposta = await fetch(endereco, {
    headers: {
      Authorization: `OAuth oauth_consumer_key="${CHAVE_TRELLO}", oauth_token="${TOKEN_TRELLO}"`,
    },
    redirect: "follow",
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return new Uint8Array(await resposta.arrayBuffer());
}

function falhar(titulo, detalhe) {
  console.error(`\n✗ ${titulo}\n  ${detalhe}\n`);
  process.exit(1);
}
