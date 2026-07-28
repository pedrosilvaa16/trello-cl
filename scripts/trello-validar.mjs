/**
 * Ensaio da importação, sem tocar na base de dados.
 *
 * Corre a conversão sobre tudo o que foi extraído e verifica cada linha contra
 * as restrições reais das tabelas. Uma migração de 1195 cartões e 859 anexos
 * não deve descobrir a meio que uma coluna é curta de mais — e a meio é o pior
 * sítio para descobrir, porque metade dos quadros já lá está.
 *
 * Uso: npm run trello:validar
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  LIMITE_FICHEIRO,
  LIMITES,
  PAPEIS,
  corEtiqueta,
  corQuadro,
  criadoEm,
  cortar,
  descricaoCompleta,
  vaiParaBucket,
} from "./trello-conversao.mjs";

const ORIGEM = path.resolve("dados-trello");
const CORES_VALIDAS = new Set([
  "verde", "amarelo", "laranja", "vermelho", "roxo", "azul", "rosa", "cinza",
]);
const CORES_QUADRO_VALIDAS = new Set([
  "ardosia", "pinho", "ameixa", "ocre", "tijolo", "oceano",
]);

const problemas = [];
const avisos = [];
const reprovar = (o, porque) => problemas.push(`${o}: ${porque}`);

const ficheiros = (await readdir(ORIGEM)).filter(
  (f) => f.endsWith(".json") && !["inventario.json", "mapa-pessoas.json"].includes(f),
);

const quadros = [];
for (const f of ficheiros) {
  quadros.push(JSON.parse(await readFile(path.join(ORIGEM, f), "utf8")));
}

const conta = {
  quadros: 0, listas: 0, cartoes: 0, etiquetas: 0, comentarios: 0,
  ficheiros: 0, ligacoes: 0, bytes: 0, semLista: 0, semCartao: 0, checklists: 0,
};

for (const { quadro, listas, cartoes, etiquetas, comentarios, associacoes } of quadros) {
  conta.quadros += 1;

  const nome = cortar(quadro.name, LIMITES.quadroNome);
  if (!nome) reprovar(`quadro ${quadro.id}`, "ficaria sem nome");
  if (!CORES_QUADRO_VALIDAS.has(corQuadro(quadro.id))) {
    reprovar(`quadro ${quadro.name}`, "cor fora da paleta");
  }
  if (Number.isNaN(Date.parse(criadoEm(quadro.id)))) {
    reprovar(`quadro ${quadro.name}`, "data de criação inválida");
  }

  for (const a of associacoes) {
    if (!PAPEIS[a.memberType]) {
      avisos.push(`papel "${a.memberType}" desconhecido → entra como editor`);
    }
  }

  const idsLista = new Set();
  for (const l of listas) {
    conta.listas += 1;
    idsLista.add(l.id);
    if (!cortar(l.name, LIMITES.listaNome)) {
      reprovar(`lista ${l.id}`, "ficaria sem nome");
    }
    if (!Number.isFinite(l.pos)) reprovar(`lista ${l.name}`, `posição inválida (${l.pos})`);
  }

  const idsEtiqueta = new Set();
  for (const e of etiquetas) {
    conta.etiquetas += 1;
    idsEtiqueta.add(e.id);
    if (!CORES_VALIDAS.has(corEtiqueta(e.color))) {
      reprovar(`etiqueta ${e.id}`, `cor "${e.color}" não mapeia`);
    }
    if ((e.name ?? "").length > LIMITES.etiquetaNome) {
      reprovar(`etiqueta ${e.name}`, "nome acima do limite");
    }
  }

  const idsCartao = new Set();
  for (const c of cartoes) {
    conta.cartoes += 1;
    idsCartao.add(c.id);

    if (!idsLista.has(c.idList)) {
      conta.semLista += 1;
      continue; // o importador salta-o; contado, não reprovado
    }

    const titulo = cortar(c.name, LIMITES.cartaoTitulo);
    if (!titulo) avisos.push(`cartão ${c.id} sem título → "(sem título)"`);

    const descricao = descricaoCompleta(c);
    if (descricao && descricao.length > LIMITES.cartaoDescricao) {
      reprovar(`cartão ${c.name?.slice(0, 40)}`, "descrição acima do limite");
    }
    if ((c.checklists ?? []).length) conta.checklists += c.checklists.length;

    if (!Number.isFinite(c.pos)) reprovar(`cartão ${c.name}`, `posição inválida (${c.pos})`);
    if (c.due && Number.isNaN(Date.parse(c.due))) {
      reprovar(`cartão ${c.name}`, `data-limite inválida (${c.due})`);
    }

    for (const idEtiqueta of c.idLabels ?? []) {
      if (!idsEtiqueta.has(idEtiqueta)) {
        avisos.push(`cartão ${c.id} aponta a etiqueta ${idEtiqueta} que não veio`);
      }
    }

    for (const a of c.attachments ?? []) {
      if (!cortar(a.name, LIMITES.anexoNome)) {
        avisos.push(`anexo ${a.id} sem nome → "anexo"`);
      }

      if (vaiParaBucket(a)) {
        conta.ficheiros += 1;
        conta.bytes += a.bytes;
        if (a.bytes > LIMITE_FICHEIRO) {
          reprovar(`anexo ${a.name}`, "acima de 25 MB e mesmo assim marcado para o bucket");
        }
      } else {
        conta.ligacoes += 1;
        // Um anexo que não vai para o bucket tem de ter URL: o CHECK da tabela
        // exige exatamente uma das duas metades.
        if (!a.url) {
          reprovar(`anexo ${a.name}`, "sem ficheiro e sem URL — viola o CHECK");
        }
      }
    }
  }

  for (const c of comentarios) {
    const texto = (c.data?.text ?? "").trim();
    if (!texto) continue;
    if (!idsCartao.has(c.data?.idCard)) {
      conta.semCartao += 1;
      continue;
    }
    conta.comentarios += 1;
    if (texto.length > LIMITES.comentarioCorpo) {
      reprovar(`comentário ${c.id}`, `${texto.length} caracteres, acima do limite`);
    }
    if (Number.isNaN(Date.parse(c.date))) {
      reprovar(`comentário ${c.id}`, "data inválida");
    }
  }
}

/* --------------------------------------------------------------- relatório -- */

const unicos = [...new Set(avisos)];

console.log(`
Ensaio da importação
────────────────────────────────────────────────────────
  Quadros            ${conta.quadros}
  Listas             ${conta.listas}
  Cartões            ${conta.cartoes}
  Etiquetas          ${conta.etiquetas}
  Comentários        ${conta.comentarios}
  Checklists         ${conta.checklists} → dobradas na descrição
  Anexos ficheiro    ${conta.ficheiros} (${(conta.bytes / 1024 / 1024).toFixed(0)} MB para o bucket)
  Anexos ligação     ${conta.ligacoes}
${conta.semLista ? `  Cartões sem lista  ${conta.semLista} (saltados)\n` : ""}${
  conta.semCartao ? `  Comentários órfãos ${conta.semCartao} (saltados)\n` : ""
}`);

if (unicos.length) {
  console.log(`Avisos (${unicos.length}) — passam, mas com ajuste:`);
  unicos.slice(0, 10).forEach((a) => console.log(`  · ${a}`));
  if (unicos.length > 10) console.log(`  · (e mais ${unicos.length - 10})`);
  console.log();
}

if (problemas.length) {
  console.log(`✗ ${problemas.length} linhas seriam recusadas pela base de dados:`);
  problemas.slice(0, 20).forEach((p) => console.log(`  · ${p}`));
  if (problemas.length > 20) console.log(`  · (e mais ${problemas.length - 20})`);
  console.log();
  process.exit(1);
}

console.log(`✓ Tudo passa nas restrições das tabelas. A importação pode correr.
────────────────────────────────────────────────────────
`);
