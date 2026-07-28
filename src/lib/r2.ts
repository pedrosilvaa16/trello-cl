import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2, onde vivem os anexos.
 *
 * O R2 não tem RLS nem nada parecido: quem tiver a chave do objeto e as
 * credenciais lê o bucket inteiro. A permissão é imposta *antes*, no servidor —
 * confirma-se que o utilizador pode ver o cartão e só então se assina um URL de
 * validade curta para aquele objeto. As credenciais nunca saem daqui.
 *
 * Por isso este ficheiro é `server-only`: importá-lo num componente de cliente
 * dá erro de build em vez de mandar as chaves para o browser.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} em falta. Ver .env.example e criar .env.local.`,
    );
  }
  return valor;
}

let cliente: S3Client | null = null;

function r2() {
  cliente ??= new S3Client({
    // O R2 não tem regiões no sentido da AWS; "auto" é o que a Cloudflare pede.
    region: "auto",
    endpoint: obrigatoria("R2_ENDPOINT", process.env.R2_ENDPOINT),
    credentials: {
      accessKeyId: obrigatoria("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID),
      secretAccessKey: obrigatoria(
        "R2_SECRET_ACCESS_KEY",
        process.env.R2_SECRET_ACCESS_KEY,
      ),
    },
  });
  return cliente;
}

const bucket = () => obrigatoria("R2_BUCKET", process.env.R2_BUCKET);

/** Uma hora, como a especificação manda para o acesso a anexos (secção 3.4). */
export const VALIDADE_LEITURA = 60 * 60;

/** Quinze minutos chegam para começar um envio; o upload em si pode demorar mais. */
export const VALIDADE_ESCRITA = 15 * 60;

/** 200 MB — o mesmo limite que a restrição da tabela impõe. */
export const LIMITE_BYTES = 209715200;

/**
 * O instante da assinatura, arredondado para baixo em janelas de 15 minutos.
 *
 * Sem isto, cada render produzia um URL diferente para a mesma imagem e o
 * browser voltava a descarregar as vinte miniaturas da lista de quadros a cada
 * visita. Com a assinatura estável dentro da janela, o URL é byte a byte o
 * mesmo e a cache do browser funciona.
 *
 * O preço é a validade efetiva ficar entre 45 e 60 minutos em vez de 60 certos
 * — continua a ser o "validade curta" que a especificação pede.
 */
function instanteDaAssinatura() {
  const janela = 15 * 60 * 1000;
  return new Date(Math.floor(Date.now() / janela) * janela);
}

/**
 * URL de leitura, válido uma hora.
 *
 * Com `nomeParaDescarregar`, o R2 devolve o `Content-Disposition` que faz o
 * browser gravar o ficheiro com o nome original em vez do da chave.
 */
export async function urlDeLeitura(
  chave: string,
  nomeParaDescarregar?: string,
) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: chave,
      ResponseContentDisposition: nomeParaDescarregar
        ? `attachment; filename="${nomeParaDescarregar.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: VALIDADE_LEITURA, signingDate: instanteDaAssinatura() },
  );
}

/**
 * URL de escrita para um objeto concreto.
 *
 * O cliente envia o ficheiro direto para o R2 com este URL, sem passar pelo
 * servidor — que é o que permite anexos de 200 MB sem esbarrar no limite de
 * corpo de pedido de uma função serverless. A chave é decidida aqui, nunca
 * pelo cliente: senão qualquer pessoa escrevia por cima do anexo de outro.
 */
export async function urlDeEscrita(chave: string, tipoMime: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: chave,
      ContentType: tipoMime,
    }),
    { expiresIn: VALIDADE_ESCRITA },
  );
}

export async function apagarObjeto(chave: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: chave }));
}

/**
 * A chave de um anexo no bucket.
 *
 * Mesmo formato que o caminho usado no Supabase Storage, para a migração poder
 * reaproveitar as chaves já existentes. O id do anexo lá dentro garante que
 * dois ficheiros com o mesmo nome no mesmo cartão não se pisam.
 */
export function chaveDoAnexo(
  idQuadro: string,
  idCartao: string,
  idAnexo: string,
  nomeFicheiro: string,
) {
  return `boards/${idQuadro}/cards/${idCartao}/${idAnexo}-${nomeSeguro(nomeFicheiro)}`;
}

/**
 * A chave da imagem de destaque de um cartão.
 *
 * Vive ao lado dos anexos do cartão, mas com prefixo próprio: assim a capa
 * nunca é confundida com um anexo, e apagar um anexo nunca lhe toca. O `uuid`
 * lá dentro é o que faz cada substituição escrever num objeto novo em vez de
 * por cima do antigo — sem isso, o URL assinado que já está no browser de
 * outra pessoa passava a servir a imagem nova a meio de uma sessão.
 */
export function chaveDaCapa(
  idQuadro: string,
  idCartao: string,
  idImagem: string,
  nomeFicheiro: string,
) {
  return `boards/${idQuadro}/cards/${idCartao}/capa/${idImagem}-${nomeSeguro(nomeFicheiro)}`;
}

/** Tira do nome o que não deve ir para uma chave de objeto. */
export function nomeSeguro(nome: string) {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(-80) || "anexo"
  );
}
