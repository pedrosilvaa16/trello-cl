/**
 * Traz da Trello a imagem de destaque de cada quadro e põe-na no R2.
 *
 * Guarda duas escalas por quadro: uma pequena para o cartão na lista e uma
 * grande para o fundo. A Trello oferece até dez tamanhos da mesma fotografia —
 * escolher os certos aqui evita mandar 1600px para um cartão de 280px.
 *
 * É repetível: as chaves são derivadas do id do quadro, por isso correr outra
 * vez substitui em vez de duplicar.
 *
 * Uso:
 *   npm run fundos:r2
 *   npm run fundos:r2 -- --ver
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SO_VER = process.argv.includes("--ver");
const ORIGEM = path.resolve("dados-trello");

const {
  NEXT_PUBLIC_SUPABASE_URL: URL_SUPABASE,
  SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO,
  R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
} = process.env;

for (const [nome, valor] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: URL_SUPABASE,
  SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO,
  R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
})) {
  if (!valor) {
    console.error(`\n✗ Falta ${nome} no .env.local.\n`);
    process.exit(1);
  }
}

const bd = createClient(URL_SUPABASE, CHAVE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * A escala mais pequena que ainda chega para a largura pedida.
 *
 * Ordenar e apanhar a primeira acima do alvo dá nitidez suficiente sem trazer
 * o ficheiro de 1365px para um cartão. Se nenhuma chegar, fica a maior.
 */
function escalaPara(escalas, larguraAlvo) {
  const ordenadas = [...escalas].sort((a, b) => a.width - b.width);
  return ordenadas.find((e) => e.width >= larguraAlvo) ?? ordenadas.at(-1);
}

console.log("→ A ler dados-trello/");
const ficheiros = (await readdir(ORIGEM)).filter(
  (f) => f.endsWith(".json") && !["inventario.json", "mapa-pessoas.json"].includes(f),
);

const quadrosTrello = new Map();
for (const f of ficheiros) {
  const { quadro } = JSON.parse(await readFile(path.join(ORIGEM, f), "utf8"));
  quadrosTrello.set(quadro.id, quadro);
}

// O id local de cada quadro, pelo rasto da importação.
const { data: rasto } = await bd
  .from("importacoes_trello")
  .select("id_trello, id_local")
  .eq("tipo", "quadro");

console.log(`  ${quadrosTrello.size} quadros na extração, ${rasto?.length ?? 0} importados`);

const tarefas = [];
for (const { id_trello, id_local } of rasto ?? []) {
  const quadro = quadrosTrello.get(id_trello);
  const prefs = quadro?.prefs;
  if (!prefs?.backgroundImage) continue;

  const escalas = prefs.backgroundImageScaled ?? [];
  // Sem escalas (fundos de gradiente), a original serve para as duas.
  const grande = escalas.length
    ? escalaPara(escalas, 1600).url
    : prefs.backgroundImage;
  const pequena = escalas.length
    ? escalaPara(escalas, 640).url
    : prefs.backgroundImage;

  tarefas.push({
    id_local,
    nome: quadro.name,
    grande,
    pequena,
    brilho: prefs.backgroundBrightness === "dark" ? "escuro" : "claro",
  });
}

console.log(`  ${tarefas.length} quadros com imagem de destaque\n`);

if (SO_VER) {
  for (const t of tarefas) console.log(`  ${t.nome.padEnd(26).slice(0,26)} ${t.brilho}`);
  console.log("\n(--ver) nada foi escrito.\n");
  process.exit(0);
}

let feitos = 0;
const falhas = [];

for (const t of tarefas) {
  try {
    const [grande, pequena] = await Promise.all([
      descarregar(t.grande),
      descarregar(t.pequena),
    ]);

    // Um dos quadros usa gradiente em vez de fotografia, e vem em SVG. A
    // extensão segue o tipo devolvido para o browser não se enganar.
    const extensao = grande.tipo === "image/svg+xml" ? "svg" : "jpg";
    const chaveGrande = `quadros/${t.id_local}/fundo.${extensao}`;
    const chavePequena = `quadros/${t.id_local}/miniatura.${extensao}`;

    await Promise.all([
      r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: chaveGrande, Body: grande.corpo, ContentType: grande.tipo,
      })),
      r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: chavePequena, Body: pequena.corpo, ContentType: pequena.tipo,
      })),
    ]);

    const { error } = await bd
      .from("boards")
      .update({
        imagem_fundo: chaveGrande,
        imagem_miniatura: chavePequena,
        brilho_fundo: t.brilho,
      })
      .eq("id", t.id_local);
    if (error) throw new Error(error.message);

    feitos += 1;
    console.log(
      `  ✓ ${t.nome.padEnd(26).slice(0, 26)} ${(grande.corpo.byteLength / 1024).toFixed(1)} kB + ${(pequena.corpo.byteLength / 1024).toFixed(1)} kB`,
    );
  } catch (erro) {
    falhas.push(`${t.nome}: ${erro.message}`);
    console.log(`  ✗ ${t.nome} — ${erro.message}`);
  }
}

console.log(`
────────────────────────────────────────────────────────
  ${feitos} quadros com imagem no R2${falhas.length ? `\n  ${falhas.length} falharam` : ""}
────────────────────────────────────────────────────────
`);

/**
 * As imagens de fundo não estão na API da Trello: estão num bucket S3 e numa
 * CloudFront, ambos públicos. Mandar-lhes o cabeçalho `Authorization: OAuth`
 * faz o S3 tentar lê-lo como assinatura AWS e responder 400 — foi exatamente
 * isso que aconteceu à primeira tentativa.
 */
async function descarregar(endereco) {
  const resposta = await fetch(endereco, { redirect: "follow" });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

  const corpo = new Uint8Array(await resposta.arrayBuffer());
  if (corpo.byteLength === 0) throw new Error("ficheiro vazio");

  return {
    corpo,
    tipo: resposta.headers.get("content-type")?.split(";")[0] || "image/jpeg",
  };
}
