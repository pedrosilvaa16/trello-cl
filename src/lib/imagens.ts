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
