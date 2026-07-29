import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
  createHmac,
} from "node:crypto";

/**
 * Cifra dos tokens das redes sociais.
 *
 * Um token da Meta vive sessenta dias e dá acesso à conta do cliente. É o
 * segredo mais valioso que este produto guarda — mais do que a palavra-passe de
 * qualquer utilizador, que pelo menos está em hash e só serve aqui dentro.
 *
 * Por isso não segue o precedente de `convites.token`, que está em texto
 * simples: aquele vive sete dias, dá acesso a esta plataforma e tem de ser
 * legível para ser copiado para um email. Este não tem de ser legível por
 * ninguém, nunca.
 *
 * AES-256-GCM, com a chave a viver só no ambiente do servidor. A base de dados
 * guarda o resultado sem o saber ler: `ligacoes_segredos` tem RLS ativa e
 * política nenhuma, e mesmo que alguém chegasse à tabela levava daqui bytes.
 *
 * GCM e não CBC porque é autenticado — uma linha adulterada na base de dados
 * falha a decifra em vez de devolver lixo que o resto do código trataria como
 * um token.
 */

const VERSAO = "v1";
const ALGORITMO = "aes-256-gcm";
/** 96 bits é o que o GCM foi desenhado para levar. */
const BYTES_IV = 12;

function chave(): Buffer {
  const bruta = process.env.CHAVE_CIFRA_REDES;
  if (!bruta) {
    throw new Error(
      "Variável de ambiente CHAVE_CIFRA_REDES em falta. " +
        "Gera uma com: openssl rand -base64 32",
    );
  }

  // Aceita base64 (44 caracteres) ou hex (64). Qualquer uma dá 32 bytes, que é
  // o que o AES-256 pede — uma chave mais curta seria silenciosamente aceite
  // pelo Buffer.from e daria uma cifra mais fraca do que o nome promete.
  const bytes = /^[0-9a-fA-F]{64}$/.test(bruta.trim())
    ? Buffer.from(bruta.trim(), "hex")
    : Buffer.from(bruta.trim(), "base64");

  if (bytes.length !== 32) {
    throw new Error(
      `CHAVE_CIFRA_REDES tem de ter 32 bytes (tem ${bytes.length}). ` +
        "Gera uma com: openssl rand -base64 32",
    );
  }
  return bytes;
}

/**
 * Cifra um token.
 *
 * O resultado é `v1.iv.tag.conteudo`, tudo em base64url. O prefixo de versão
 * existe para o dia em que a chave for trocada: quem decifra sabe com que
 * esquema o valor foi escrito, em vez de ter de adivinhar pelo comprimento.
 */
export function cifrar(texto: string): string {
  const iv = randomBytes(BYTES_IV);
  const cifra = createCipheriv(ALGORITMO, chave(), iv);
  const conteudo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();

  return [
    VERSAO,
    iv.toString("base64url"),
    tag.toString("base64url"),
    conteudo.toString("base64url"),
  ].join(".");
}

/**
 * Decifra um token.
 *
 * Rebenta se o valor tiver sido adulterado ou se a chave já não for a mesma —
 * e é suposto rebentar. Um token que não decifra é uma ligação que tem de ser
 * refeita, não um caso a contornar com um valor por omissão.
 */
export function decifrar(guardado: string): string {
  const partes = guardado.split(".");
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new Error("Token guardado num formato que não se reconhece.");
  }

  const [, iv, tag, conteudo] = partes;
  const decifra = createDecipheriv(
    ALGORITMO,
    chave(),
    Buffer.from(iv, "base64url"),
  );
  decifra.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decifra.update(Buffer.from(conteudo, "base64url")),
    decifra.final(),
  ]).toString("utf8");
}

/**
 * Assina um valor com a mesma chave.
 *
 * Serve o `state` do OAuth, que não é segredo — vai e volta pela barra de
 * endereço — mas tem de ser impossível de forjar. Sem isto, qualquer pessoa
 * mandava um utilizador para o nosso callback com um `board_id` à escolha e
 * ligava a conta dela ao quadro de outro cliente.
 */
export function assinar(valor: string): string {
  return createHmac("sha256", chave()).update(valor).digest("base64url");
}

/**
 * Confirma uma assinatura em tempo constante.
 *
 * `timingSafeEqual` e não `===`: comparar strings byte a byte com paragem no
 * primeiro que difere deixa medir quantos bytes estavam certos, e com isso
 * forjar a assinatura um byte de cada vez.
 */
export function assinaturaValida(valor: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinar(valor));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}
