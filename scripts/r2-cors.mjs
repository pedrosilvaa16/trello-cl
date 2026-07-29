/*
  CORS do bucket R2 — aplicar e confirmar.

  PORQUE É QUE ISTO EXISTE. Os ficheiros vão do browser direto para o R2, sem
  passarem pelo servidor — é o que permite anexos de 200 MB sem esbarrar no
  limite de corpo de pedido da Vercel. Só que um PUT do browser para outro
  domínio começa por um pedido OPTIONS de preflight, e sem uma política de CORS
  no bucket o R2 responde 403 sem cabeçalhos Access-Control-*. O browser
  bloqueia o envio e nada chega a sair.

  O Supabase Storage trazia CORS configurado de origem; o R2 não. Ao migrar,
  esse passo ficou por fazer — e como o Node ignora CORS, um teste feito fora
  do browser passa sem apanhar nada. Daí este script fazer as duas coisas:
  aplicar a política e depois simular o preflight, que é a única verificação
  que prova mesmo alguma coisa.

  CREDENCIAIS. Aplicar uma política de bucket é uma permissão diferente de
  ler e escrever objetos. A chave que a aplicação usa (`R2_ACCESS_KEY_ID`) é
  de objetos de propósito, e não chega. Para isto é preciso um token R2 com
  «Admin Read & Write», posto em `R2_ADMIN_ACCESS_KEY_ID` e
  `R2_ADMIN_SECRET_ACCESS_KEY` — separado, para a aplicação continuar a correr
  com o mínimo de poder de que precisa. Depois de aplicado, o token de
  administração pode ser revogado: isto faz-se uma vez.

  Uso:
    npm run r2:cors            aplica (se houver credenciais) e confirma
    npm run r2:cors -- --ver   só confirma, não escreve nada
*/
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const soVerificar = process.argv.includes("--ver");

const Bucket = obrigatoria("R2_BUCKET");
const endpoint = obrigatoria("R2_ENDPOINT");

/*
  As origens que podem enviar ficheiros. `APP_URL` é a de produção; os
  `localhost` são para o desenvolvimento. Uma origem a mais aqui não dá acesso
  a nada — só diz ao browser de que páginas aceita um envio, e o URL assinado
  continua a ser preciso.
*/
const origens = [
  ...new Set(
    [
      process.env.R2_CORS_ORIGENS?.split(",").map((o) => o.trim()),
      process.env.APP_URL?.trim(),
      "http://localhost:3000",
    ]
      .flat()
      .filter(Boolean),
  ),
];

const REGRAS = [
  {
    AllowedOrigins: origens,
    // Nada de DELETE: apagar objetos é do servidor, com credenciais que nunca
    // saem de lá. Abrir aqui o que o browser não usa era dar-lhe poder a mais.
    AllowedMethods: ["PUT", "GET"],
    AllowedHeaders: ["content-type"],
    ExposeHeaders: ["etag"],
    MaxAgeSeconds: 3600,
  },
];

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`Falta ${nome} no ambiente. Ver .env.example.`);
    process.exit(1);
  }
  return valor;
}

function cliente(acesso, segredo) {
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: acesso, secretAccessKey: segredo },
  });
}

console.log(`bucket   ${Bucket}`);
console.log(`origens  ${origens.join("\n         ")}\n`);

/* ------------------------------------------------------------- aplicar -- */

const acessoAdmin = process.env.R2_ADMIN_ACCESS_KEY_ID;
const segredoAdmin = process.env.R2_ADMIN_SECRET_ACCESS_KEY;

if (!soVerificar) {
  if (!acessoAdmin || !segredoAdmin) {
    console.log(
      "Sem R2_ADMIN_ACCESS_KEY_ID / R2_ADMIN_SECRET_ACCESS_KEY — nada aplicado.\n" +
        "Cola esta política no painel da Cloudflare (R2 → bucket → Settings →\n" +
        "CORS Policy), ou põe um token «Admin Read & Write» no ambiente:\n",
    );
    console.log(JSON.stringify(REGRAS, null, 2), "\n");
  } else {
    try {
      await cliente(acessoAdmin, segredoAdmin).send(
        new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: REGRAS } }),
      );
      console.log("Política aplicada ao bucket.\n");
    } catch (erro) {
      console.error(`Não foi possível aplicar — ${erro.name}: ${erro.message}`);
      console.error(
        "«AccessDenied» costuma querer dizer que o token é de objetos e não de\n" +
          "administração. Ver o cabeçalho deste ficheiro.\n",
      );
      process.exitCode = 1;
    }
  }
}

/* -------------------------------------------------------------- ler ---- */

if (acessoAdmin && segredoAdmin) {
  try {
    const { CORSRules } = await cliente(acessoAdmin, segredoAdmin).send(
      new GetBucketCorsCommand({ Bucket }),
    );
    console.log("No bucket:");
    console.log(JSON.stringify(CORSRules, null, 2), "\n");
  } catch {
    // Sem permissão para ler não é impedimento: o preflight abaixo é que conta.
  }
}

/* ----------------------------------------------------------- confirmar -- */

/*
  A verificação que prova alguma coisa: o mesmo pedido OPTIONS que o browser
  faz antes do PUT. Ler a configuração pela API diria o que lá está escrito;
  isto diz o que o browser vai realmente conseguir fazer.
*/
const url = await getSignedUrl(
  cliente(obrigatoria("R2_ACCESS_KEY_ID"), obrigatoria("R2_SECRET_ACCESS_KEY")),
  new PutObjectCommand({
    Bucket,
    Key: `teste-cors/${crypto.randomUUID()}.txt`,
    ContentType: "text/plain",
  }),
  { expiresIn: 300 },
);

let falhou = false;

for (const origem of origens) {
  const resposta = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origem,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const permitida = resposta.headers.get("access-control-allow-origin");
  const passa = !!permitida;
  if (!passa) falhou = true;
  console.log(
    `${passa ? "ok    " : "FALHOU"} preflight de ${origem}` +
      `${passa ? "" : `  (HTTP ${resposta.status}, sem access-control-allow-origin)`}`,
  );
}

console.log(
  falhou
    ? "\nO browser continua a bloquear o envio de ficheiros."
    : "\nO browser consegue enviar ficheiros para o R2.",
);
if (falhou) process.exitCode = 1;
