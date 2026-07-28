import type { Metadata } from "next";
import { Rubik } from "next/font/google";

import { Marca } from "@/components/marca";

import "./estilo.css";
import { FormularioEntrada } from "./formulario";
import { ZonaInversao } from "./zona-inversao";

/*
  A Rubik existe aqui por uma razão só: o "//" do eyebrow, que no site é o
  acento da marca. Um peso, carregado apenas nesta página.
*/
const fonteAcento = Rubik({
  variable: "--fonte-acento",
  subsets: ["latin"],
  weight: ["300"],
  display: "swap",
});

export const metadata: Metadata = { title: "Entrar" };

/*
  O discurso aparece duas vezes no DOM (camada base + cópia recortada ao
  círculo), por isso vive numa função em vez de estar escrito à mão nos dois
  sítios: mudar o texto num lado e esquecer o outro partia o efeito.
*/
function Discurso() {
  return (
    <>
      <p className="eyebrow">
        <span className="acento">{"//"}</span>
        <span>Área de cliente</span>
      </p>

      <h1 className="titulo">
        <span className="seg seg-a">Vê, comenta e</span>{" "}
        <span className="seg seg-b azul">aprova</span>{" "}
        <span className="seg seg-c">os teus</span>{" "}
        <span className="seg seg-d">conteúdos.</span>
      </h1>

      <p className="subtitulo">
        É aqui que a Creative Line te mostra o que preparou para as tuas redes —
        e onde dizes o que muda, antes de ir para o ar.
      </p>
    </>
  );
}

const PASSOS = [
  {
    numero: "01",
    titulo: "Vês o que está proposto",
    texto:
      "Cada publicação com a imagem, o texto e a data prevista, num quadro só teu.",
  },
  {
    numero: "02",
    titulo: "Comentas o que muda",
    texto:
      "Escreves no próprio cartão. Sem trocas de email nem ficheiros perdidos pelo caminho.",
  },
  {
    numero: "03",
    titulo: "Aprovas e segue",
    texto:
      "Dás o cartão por concluído e a equipa sabe que pode publicar. Sem perguntar duas vezes.",
  },
];

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; motivo?: string }>;
}) {
  const { destino, motivo } = await searchParams;

  return (
    <main className={`entrada ${fonteAcento.variable}`}>
      {/* A Graphik do título é a primeira coisa que se lê — vale o preload. */}
      <link
        rel="preload"
        href="/fonts/GraphikRegular.woff2"
        as="font"
        type="font/woff2"
        crossOrigin=""
      />

      <div className="entrada-caixa">
        <section className="entrada-discurso" aria-label="Creative Line">
          {/* self-start: sem isto o painel (flex em coluna) estica a caixa da
              imagem à largura toda e o SVG centra-se lá dentro. */}
          <Marca className="h-[22px] w-auto self-start" />
          <ZonaInversao>
            <Discurso />
          </ZonaInversao>
        </section>

        <ol className="entrada-passos">
          {PASSOS.map((passo) => (
            <li key={passo.numero} className="passo">
              <span className="passo-numero">{passo.numero}</span>
              <p className="passo-titulo">{passo.titulo}</p>
              <p className="passo-texto">{passo.texto}</p>
            </li>
          ))}
        </ol>

        <section className="entrada-formulario" aria-labelledby="titulo-entrar">
          <p className="eyebrow" id="titulo-entrar">
            <span className="acento">{"//"}</span>
            <span>Entrar</span>
          </p>

          {/*
            Um erro explica o que falhou e como resolver. "Palavra-passe errada"
            mandava esta pessoa tentar outra vez para sempre — o problema não é a
            palavra-passe dela.
          */}
          {motivo === "desativada" && (
            <div role="status" className="aviso">
              <p className="aviso-titulo">Esta conta está desativada.</p>
              <p className="aviso-texto">
                O acesso foi retirado por quem gere a plataforma. Fala com essa
                pessoa para o recuperar — nada do teu trabalho foi apagado.
              </p>
            </div>
          )}

          <FormularioEntrada destino={destino ?? ""} />

          <p className="nota">
            O registo é fechado: as contas são criadas por convite. Se ainda não
            tens acesso, pede a quem gere a plataforma que te envie um convite.
          </p>
        </section>
      </div>
    </main>
  );
}
