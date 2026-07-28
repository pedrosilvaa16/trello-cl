/**
 * Traz da Trello todos os ficheiros anexados e põe-nos no Cloudflare R2.
 *
 * Vai à Trello e não ao Supabase Storage de propósito: é a fonte original, e é
 * a única que tem também os vídeos e os documentos que a primeira importação
 * deixou de fora por causa do limite de 25 MB e do filtro de tipos.
 *
 * Depois de cada ficheiro chegar ao R2, a linha de `attachments` é atualizada
 * para apontar lá — `caminho_storage` com a chave do objeto e `url` a nulo.
 * Os 7 anexos que sempre foram só ligações (Canva, Drive, Instagram) ficam
 * como estão: não há ficheiro nenhum para trazer.
 *
 * É repetível: o que já está no R2 com o tamanho certo é saltado.
 *
 * Uso:
 *   npm run anexos:r2
 *   npm run anexos:r2 -- --ver        (não escreve nada, só diz o que faria)
 */

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SO_VER = process.argv.includes("--ver");
const ORIGEM = path.resolve("dados-trello");

const {
  NEXT_PUBLIC_SUPABASE_URL: URL_SUPABASE,
  SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO,
  TRELLO_API_KEY: CHAVE_TRELLO,
  TRELLO_TOKEN: TOKEN_TRELLO,
  R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
} = process.env;

for (const [nome, valor] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: URL_SUPABASE,
  SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO,
  TRELLO_API_KEY: CHAVE_TRELLO,
  TRELLO_TOKEN: TOKEN_TRELLO,
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

/** 200 MB, o mesmo limite da restrição na tabela. */
const LIMITE = 209715200;

const nomeSeguro = (nome) =>
  String(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80) || "anexo";

/* ------------------------------------------------------ o que há na Trello -- */

console.log("→ A ler dados-trello/");
const ficheiros = (await readdir(ORIGEM)).filter(
  (f) => f.endsWith(".json") && !["inventario.json", "mapa-pessoas.json"].includes(f),
);

const porIdTrello = new Map();
for (const f of ficheiros) {
  const { cartoes } = JSON.parse(await readFile(path.join(ORIGEM, f), "utf8"));
  for (const c of cartoes) {
    for (const a of c.attachments ?? []) porIdTrello.set(a.id, a);
  }
}
console.log(`  ${porIdTrello.size} anexos conhecidos da Trello`);

/* ------------------------------------------------- o que há na base de dados -- */

console.log("→ A ler os anexos importados");

/**
 * Lê uma tabela inteira, aos pedaços.
 *
 * O PostgREST corta as respostas às 1000 linhas. Sem isto, `cards` (1195
 * linhas) vinha truncada e os anexos dos cartões em falta passavam por "sem
 * origem" — silenciosamente, que é o pior tipo de erro numa migração.
 *
 * A ordenação também não é decorativa: sem ela, duas páginas seguidas podem
 * repetir e saltar linhas, porque o Postgres não garante ordem sem `order by`.
 */
async function lerTudo(tabela, colunas, ordem, afinar = (q) => q) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await afinar(
      bd.from(tabela).select(colunas).order(ordem).range(de, de + 999),
    );
    if (error) {
      console.error(`\n✗ Não consegui ler ${tabela}.\n  ${error.message}\n`);
      process.exit(1);
    }
    linhas.push(...data);
    if (data.length < 1000) break;
  }
  return linhas;
}

const anexos = await lerTudo(
  "attachments",
  "id, card_id, nome_ficheiro, caminho_storage, tamanho_bytes, tipo_mime, url",
  "id",
);

// O quadro de cada cartão, para montar a chave do objeto.
const cartoes = await lerTudo("cards", "id, list_id", "id");
const listas = await lerTudo("lists", "id, board_id", "id");
const quadroDaLista = new Map(listas.map((l) => [l.id, l.board_id]));
const quadroDoCartao = new Map(
  cartoes.map((c) => [c.id, quadroDaLista.get(c.list_id)]),
);

// O id da Trello de cada anexo, pelo rasto da importação.
const rasto = await lerTudo(
  "importacoes_trello",
  "id_trello, id_local",
  "id_trello",
  (q) => q.eq("tipo", "anexo"),
);
const trelloDoAnexo = new Map(rasto.map((r) => [r.id_local, r.id_trello]));

console.log(`  ${cartoes.length} cartões, ${rasto.length} anexos com rasto`);
console.log(`  ${anexos.length} anexos na base de dados`);

/* ------------------------------------------------------------------ trabalho -- */

const conta = {
  jaNoR2: 0, copiados: 0, bytes: 0, ligacoesVerdadeiras: 0,
  semOrigem: 0, grandesDemais: 0, falhas: [],
};

const porFazer = [];
for (const anexo of anexos) {
  const idTrello = trelloDoAnexo.get(anexo.id);
  const naTrello = idTrello ? porIdTrello.get(idTrello) : null;

  // Sempre foi só uma ligação: não há ficheiro para trazer.
  if (naTrello && !naTrello.isUpload) {
    conta.ligacoesVerdadeiras += 1;
    continue;
  }
  if (!naTrello) {
    // Anexado na plataforma depois da migração, ou sem rasto. Fica como está.
    conta.semOrigem += 1;
    continue;
  }
  if ((naTrello.bytes ?? 0) > LIMITE) {
    conta.grandesDemais += 1;
    continue;
  }

  const quadro = quadroDoCartao.get(anexo.card_id);
  if (!quadro) {
    conta.semOrigem += 1;
    continue;
  }

  porFazer.push({
    anexo,
    naTrello,
    chave: `boards/${quadro}/cards/${anexo.card_id}/${anexo.id}-${nomeSeguro(anexo.nome_ficheiro)}`,
  });
}

console.log(`
  ${porFazer.length} ficheiros para o R2
  ${conta.ligacoesVerdadeiras} ligações verdadeiras (ficam como estão)
  ${conta.semOrigem} sem origem na Trello
  ${conta.grandesDemais} acima de 200 MB
`);

if (SO_VER) {
  const total = porFazer.reduce((s, t) => s + (t.naTrello.bytes ?? 0), 0);
  console.log(`(--ver) seriam ${(total / 1024 / 1024).toFixed(0)} MB. Nada foi escrito.\n`);
  process.exit(0);
}

for (const [i, tarefa] of porFazer.entries()) {
  const { anexo, naTrello, chave } = tarefa;

  try {
    // Já lá está com o tamanho certo? Então salta — isto é para poder retomar.
    if (anexo.caminho_storage === chave) {
      const cabeca = await r2
        .send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: chave }))
        .catch(() => null);
      if (cabeca && cabeca.ContentLength === naTrello.bytes) {
        conta.jaNoR2 += 1;
        continue;
      }
    }

    const ficheiro = await descarregarDaTrello(naTrello.url);

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: chave,
        Body: ficheiro,
        ContentType: naTrello.mimeType || "application/octet-stream",
      }),
    );

    const { error } = await bd
      .from("attachments")
      .update({
        caminho_storage: chave,
        tamanho_bytes: ficheiro.byteLength,
        tipo_mime: naTrello.mimeType || anexo.tipo_mime,
        url: null,
      })
      .eq("id", anexo.id);
    if (error) throw new Error(error.message);

    conta.copiados += 1;
    conta.bytes += ficheiro.byteLength;
  } catch (erro) {
    conta.falhas.push(`${anexo.nome_ficheiro}: ${erro.message}`);
  }

  if ((i + 1) % 25 === 0 || i === porFazer.length - 1) {
    process.stdout.write(
      `\r  ${i + 1}/${porFazer.length} — ${conta.copiados} copiados, ` +
        `${conta.jaNoR2} já lá estavam, ${conta.falhas.length} falhas   `,
    );
  }
}

console.log(`

────────────────────────────────────────────────────────
Anexos no R2

  Copiados agora     ${conta.copiados} (${(conta.bytes / 1024 / 1024).toFixed(0)} MB)
  Já estavam lá      ${conta.jaNoR2}
  Ligações           ${conta.ligacoesVerdadeiras}
${conta.falhas.length ? `\n  ${conta.falhas.length} falharam:\n` + conta.falhas.slice(0, 8).map((f) => `    ${f}`).join("\n") : ""}
────────────────────────────────────────────────────────
`);

/**
 * Os anexos de um quadro privado não se descarregam sem credenciais — o URL da
 * Trello devolve 401 a quem não se identifica.
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
