/**
 * Preparação de imagens do lado do browser.
 *
 * Uma capa de cartão é vista num retângulo de 260px na coluna e de 600px no
 * detalhe. Enviar para lá os 6 MB que uma câmara de telemóvel produz é mandar
 * megabytes para não se verem: custa a quem envia, custa a quem abre o quadro,
 * e custa no R2 todos os meses.
 *
 * O redimensionamento é feito aqui e não no servidor porque o ficheiro nunca
 * passa pelo servidor — vai do browser direto para o R2. Fazê-lo antes do
 * envio é a única altura em que há onde lhe mexer.
 */

/** Chega para ecrãs de alta densidade sem ser um desperdício. */
const LARGURA_MAXIMA = 1600;
const ALTURA_MAXIMA = 1600;

/** WebP a 82% é indistinguível de JPEG a 90% e pesa perto de metade. */
const QUALIDADE = 0.82;

export type ImagemPreparada = {
  ficheiro: Blob;
  nomeFicheiro: string;
  tipoMime: string;
};

/**
 * Reduz a imagem e devolve-a em WebP.
 *
 * Se alguma coisa correr mal — formato que o browser não descodifica, canvas
 * bloqueado — devolve o ficheiro original. Uma capa por comprimir é melhor do
 * que uma capa que não se consegue pôr.
 */
export async function prepararCapa(ficheiro: File): Promise<ImagemPreparada> {
  const original: ImagemPreparada = {
    ficheiro,
    nomeFicheiro: ficheiro.name,
    tipoMime: ficheiro.type || "image/jpeg",
  };

  // O AVIF pode não ser codificável pelo canvas em todos os browsers, e o
  // ficheiro já vem pequeno de origem. Passa como está.
  if (ficheiro.type === "image/avif") return original;

  try {
    const bitmap = await createImageBitmap(ficheiro);
    const escala = Math.min(
      1,
      LARGURA_MAXIMA / bitmap.width,
      ALTURA_MAXIMA / bitmap.height,
    );

    // Já é pequena: recodificar só a degradaria.
    if (escala === 1 && ficheiro.size <= 600 * 1024) {
      bitmap.close();
      return original;
    }

    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;

    const pincel = tela.getContext("2d");
    if (!pincel) {
      bitmap.close();
      return original;
    }

    pincel.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolver) =>
      tela.toBlob(resolver, "image/webp", QUALIDADE),
    );

    // Sem blob, ou maior do que o original: não houve ganho nenhum.
    if (!blob || blob.size >= ficheiro.size) return original;

    return {
      ficheiro: blob,
      nomeFicheiro: trocarExtensao(ficheiro.name, "webp"),
      tipoMime: "image/webp",
    };
  } catch {
    return original;
  }
}

function trocarExtensao(nome: string, extensao: string) {
  return `${nome.replace(/\.[^./\\]+$/, "")}.${extensao}`;
}

/* -------------------------------------------------- imagem do quadro -- */

/** O fundo do quadro é visto em ecrã inteiro; a miniatura num cartão de 280px. */
const LARGURA_FUNDO = 1920;
const LARGURA_MINIATURA = 640;

export type ImagemDoQuadro = {
  fundo: Blob;
  miniatura: Blob;
  nomeFicheiro: string;
  tipoMime: string;
  /** O que a imagem é, para a interface escolher o véu de contraste. */
  brilho: "claro" | "escuro";
};

/**
 * Prepara a imagem de um quadro: duas versões e o brilho.
 *
 * Duas versões porque servir 1920px numa miniatura de 280px é mandar
 * megabytes para não se verem — e a lista de quadros mostra-as todas de uma
 * vez. O brilho sai daqui porque é aqui que os píxeis existem: pedir a quem
 * carrega a imagem que classifique a própria fotografia seria pedir trabalho
 * que a máquina faz melhor.
 */
export async function prepararImagemDoQuadro(
  ficheiro: File,
): Promise<ImagemDoQuadro> {
  const bitmap = await createImageBitmap(ficheiro);

  try {
    const fundo = await redimensionar(bitmap, LARGURA_FUNDO);
    const miniatura = await redimensionar(bitmap, LARGURA_MINIATURA);

    return {
      fundo: fundo ?? ficheiro,
      miniatura: miniatura ?? fundo ?? ficheiro,
      nomeFicheiro: trocarExtensao(ficheiro.name, "webp"),
      tipoMime: fundo ? "image/webp" : ficheiro.type || "image/jpeg",
      brilho: medirBrilho(bitmap),
    };
  } finally {
    bitmap.close();
  }
}

function desenhar(bitmap: ImageBitmap, largura: number) {
  const escala = Math.min(1, largura / bitmap.width);
  const tela = document.createElement("canvas");
  tela.width = Math.round(bitmap.width * escala);
  tela.height = Math.round(bitmap.height * escala);

  const pincel = tela.getContext("2d", { willReadFrequently: true });
  if (!pincel) return null;

  pincel.drawImage(bitmap, 0, 0, tela.width, tela.height);
  return { tela, pincel };
}

async function redimensionar(bitmap: ImageBitmap, largura: number) {
  const desenhada = desenhar(bitmap, largura);
  if (!desenhada) return null;

  return new Promise<Blob | null>((resolver) =>
    desenhada.tela.toBlob(resolver, "image/webp", QUALIDADE),
  );
}

/**
 * Clara ou escura, pela luminância média.
 *
 * A amostra é uma versão minúscula da imagem: 32px de largura chegam para a
 * média e poupam ler milhões de píxeis. A fórmula é a da luminância percebida
 * — o verde pesa mais do que o azul porque o olho o vê mais.
 */
function medirBrilho(bitmap: ImageBitmap): "claro" | "escuro" {
  const desenhada = desenhar(bitmap, 32);
  if (!desenhada) return "escuro";

  const { tela, pincel } = desenhada;
  try {
    const { data } = pincel.getImageData(0, 0, tela.width, tela.height);
    let total = 0;
    let contados = 0;

    for (let i = 0; i < data.length; i += 4) {
      // Píxeis quase transparentes não dizem nada sobre o que se vai ver.
      if (data[i + 3] < 16) continue;
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      contados++;
    }

    if (!contados) return "escuro";
    return total / contados > 140 ? "claro" : "escuro";
  } catch {
    // Canvas «sujo» por uma imagem de outra origem. Não acontece com ficheiros
    // escolhidos pelo utilizador, mas falhar por isto seria absurdo.
    return "escuro";
  }
}
