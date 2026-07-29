"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Botao } from "@/components/ui/botao";
import { avisar } from "@/components/ui/avisos";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import {
  PERIODOS,
  distribuicao,
  janelas,
  paraDia,
  periodoPorChave,
  porExtenso,
  resumir,
} from "@/lib/estatisticas/agregar";
import type { DadosEstatisticas } from "@/lib/estatisticas/dados";
import { ESCALOES_IDADE, GENEROS, REDES, nomeDoPais } from "@/lib/redes/vocabulario";
import { eGestor } from "@/lib/quadro/tipos";
import type { RedeSocial } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

import { Estatistica } from "./cartao-metrica";
import { GraficoLinha } from "./grafico-linha";
import {
  BarrasHorizontais,
  Bloco,
  GraficoAnel,
  GraficoBarras,
} from "./graficos-demografia";
import { EscolherConta } from "./ligar-rede";
import { rotularDia } from "./medir";

/**
 * O painel de resultados de um cliente.
 *
 * A direção é uma folha branca com hairlines, e não uma pilha de caixas.
 * Três regras, e todas se notam mais pelo que não está lá:
 *
 * · **Sem molduras.** Uma secção separa-se da seguinte por um filete de um
 *   píxel e por espaço, não por uma caixa com sombra. Caixas dentro de caixas
 *   é o que faz um painel parecer um formulário.
 * · **Sem ícones decorativos.** Um ícone entra quando é a única forma de dizer
 *   uma coisa — nunca para enfeitar um título. Um número grande não precisa de
 *   um desenho ao lado a dizer que é importante.
 * · **O número antes do rótulo.** "523" e por baixo "Seguidores". É a ordem por
 *   que a pergunta é feita, e é o que deixa o olho varrer a linha toda de
 *   relance.
 *
 * Mobile-first, e não por princípio: é onde um cliente o abre. Tudo empilha e
 * nada rola na horizontal.
 *
 * Quem vê é qualquer membro do quadro, incluindo o cliente. Quem liga contas é
 * só quem gere — e o servidor volta a verificá-lo em cada ação, porque esconder
 * um botão não é uma permissão.
 */
export function PainelEstatisticas({ dados }: { dados: DadosEstatisticas }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const confirmacao = useConfirmacao();
  const [aDesligar, definirADesligar] = React.useState<{ id: string; nome: string } | null>(
    null,
  );

  const periodo = periodoPorChave(parametros.get("periodo") ?? undefined);
  const redeAtiva = (parametros.get("rede") as RedeSocial | null) ?? null;
  const aEscolher = parametros.get("escolher") as RedeSocial | null;

  const [ocupado, definirOcupado] = React.useState(false);

  const gere = eGestor(dados.papel);
  const { atual, anterior } = janelas(paraDia(new Date()), periodo);

  /*
    Os quatro números de topo. A ordem não é arbitrária: seguidores primeiro
    porque é a pergunta que toda a gente faz, alcance a seguir porque é a que
    responde ao trabalho do mês.
  */
  const destaques = ["seguidores", "alcance", "interacoes", "visualizacoes"].map(
    (metrica) => resumir(dados.metricas, metrica, atual, anterior),
  );

  const genero = distribuicao(dados.demografia, "genero").map((fatia) => ({
    ...fatia,
    grupo: GENEROS[fatia.grupo] ?? fatia.grupo,
  }));
  const idade = distribuicao(dados.demografia, "idade", { ordem: ESCALOES_IDADE });
  const paises = distribuicao(dados.demografia, "pais", { maximo: 6 }).map((fatia) => ({
    ...fatia,
    grupo: fatia.grupo === "Outros" ? fatia.grupo : nomeDoPais(fatia.grupo),
  }));
  const cidades = distribuicao(dados.demografia, "cidade", { maximo: 6 });

  const expiradas = dados.ligacoes.filter((l) => l.estado === "expirada");
  const naoLigadas = (Object.keys(REDES) as RedeSocial[]).filter(
    (rede) => !dados.ligacoes.some((l) => l.rede === rede),
  );

  const publicacoes = [...dados.publicacoes].sort(
    (a, b) =>
      (b.metricas.alcance ?? b.metricas.visualizacoes ?? 0) -
      (a.metricas.alcance ?? a.metricas.visualizacoes ?? 0),
  );

  /** Muda um parâmetro da barra de endereços sem perder os outros. */
  function navegar(mudancas: Record<string, string | null>) {
    const novos = new URLSearchParams(parametros.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null) novos.delete(chave);
      else novos.set(chave, valor);
    }
    router.push(`?${novos.toString()}`, { scroll: false });
  }

  async function ligar(rede: RedeSocial) {
    definirOcupado(true);
    try {
      const resposta = await fetch("/api/redes/ligar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quadro: dados.quadro.id, rede }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível começar.");
      // Sai do site: a autorização acontece do lado da plataforma.
      window.location.href = corpo.url;
    } catch (causa) {
      definirOcupado(false);
      avisar.falhou("Não foi possível ligar esta rede.", (causa as Error).message);
    }
  }

  async function desligar() {
    if (!aDesligar) return;

    const resposta = await fetch(`/api/redes/ligacoes/${aDesligar.id}`, {
      method: "DELETE",
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      avisar.falhou("Não foi possível desligar.", corpo.erro);
      return;
    }
    avisar.feito(`${aDesligar.nome} desligado.`);
    definirADesligar(null);
    router.refresh();
  }

  async function sincronizar(id: string) {
    definirOcupado(true);
    try {
      const resposta = await fetch(`/api/redes/ligacoes/${id}`, { method: "POST" });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível sincronizar.");

      if (corpo.estado === "falhou") {
        avisar.falhou("A sincronização falhou.", corpo.erro);
      } else {
        avisar.feito(
          "Números atualizados.",
          corpo.avisos?.[0] ?? `${corpo.linhas} valores gravados.`,
        );
      }
      router.refresh();
    } catch (causa) {
      avisar.falhou("Não foi possível sincronizar.", (causa as Error).message);
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-24 sm:px-8">
      {aEscolher && (
        <EscolherConta rede={aEscolher} aoFechar={() => navegar({ escolher: null })} />
      )}

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo="Desligar esta conta?"
        descricao={`Perde-se todo o histórico já recolhido de ${aDesligar?.nome ?? "esta conta"}. A Meta só devolve os últimos 30 dias, por isso o que for anterior a isso não volta.`}
        rotuloAcao="Desligar conta"
        perigoso
        aoConfirmar={desligar}
      />

      {/* -------------------------------------------------------- cabeçalho */}
      <header className="pt-8 pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-[22px] font-normal tracking-tight text-texto sm:text-[26px]">
            {dados.quadro.nome}
          </h1>

          {gere && !dados.demonstracao && dados.ligacoes[0] && (
            <Botao
              variante="ligacao"
              onClick={() => sincronizar(dados.ligacoes[0].id)}
              ocupado={ocupado}
              className="text-[13px]"
            >
              Atualizar agora
            </Botao>
          )}
        </div>

        <p className="mt-1 text-sm text-texto-suave">
          {dados.demonstracao
            ? "Aqui podes ver o resultado de todo o nosso trabalho."
            : `Resultados dos ${periodo.curto}${
                dados.primeiroDia
                  ? ` · com dados desde ${rotularDia(dados.primeiroDia, "longo")}`
                  : ""
              }`}
        </p>
      </header>

      {/*
        O período em texto sublinhado, e não em pastilhas cheias de cor. Um
        filtro é navegação, não uma chamada à ação — e quatro botões pintados
        no topo competiam com os números, que é onde o olho deve pousar.
      */}
      <div className="barra-fina -mx-5 flex gap-6 overflow-x-auto border-y border-borda px-5 sm:-mx-8 sm:px-8">
        {PERIODOS.map((opcao) => {
          const ativo = opcao.chave === periodo.chave;
          return (
            <button
              key={opcao.chave}
              type="button"
              onClick={() => navegar({ periodo: opcao.chave })}
              aria-current={ativo ? "true" : undefined}
              className={cn(
                "shrink-0 border-b-2 py-3 text-[13px] whitespace-nowrap",
                "transition-colors duration-[var(--duracao-rapida)]",
                ativo
                  ? "border-texto font-medium text-texto"
                  : "border-transparent text-texto-tenue hover:text-texto",
              )}
            >
              {opcao.curto}
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------- avisos */}
      {dados.demonstracao && <FaixaDemonstracao gere={gere} />}

      {expiradas.length > 0 && (
        <div className="mt-6 border-l-2 border-[var(--cor-aviso)] pl-4">
          <p className="text-sm font-medium text-texto">
            {expiradas.length === 1
              ? `A ligação ao ${REDES[expiradas[0].rede].nome} expirou.`
              : `${expiradas.length} ligações expiraram.`}
          </p>
          <p className="mt-1 text-sm text-texto-suave">
            {gere
              ? "Os números pararam na última recolha com sucesso. Volta a ligar a conta para o painel se atualizar outra vez."
              : "A tua agência já foi avisada. Os números aqui são os da última recolha."}
          </p>
          {gere && (
            <Botao
              variante="ligacao"
              onClick={() => ligar(expiradas[0].rede)}
              ocupado={ocupado}
              className="mt-2 text-[13px]"
            >
              Voltar a ligar
            </Botao>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- os números */}
      <Seccao titulo="Comunidade" primeira>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {destaques.map((resumo) => (
            <Estatistica key={resumo.metrica} resumo={resumo} />
          ))}
        </dl>

        {/* A leitura da percentagem, dita uma vez em vez de quatro. */}
        <p className="mt-5 text-xs text-texto-tenue">
          A percentagem compara com os {periodo.dias} dias anteriores.
        </p>

        <div className="mt-10">
          <Legenda>Seguidores no fim de cada dia</Legenda>
          <GraficoLinha pontos={destaques[0].serie} rotulo="Seguidores" altura={210} />
        </div>

        <div className="mt-10">
          <Legenda>Pessoas diferentes alcançadas, dia a dia</Legenda>
          <GraficoLinha pontos={destaques[1].serie} rotulo="Alcance" altura={180} />
        </div>
      </Seccao>

      {/* ------------------------------------------------------- demografia */}
      {(genero.length > 0 || idade.length > 0 || paises.length > 0) && (
        <Seccao titulo="Público">
          <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            <Bloco titulo="Género" fatias={genero}>
              {() => (
                <GraficoAnel
                  fatias={genero}
                  /*
                    Duas cores medidas e um cinzento. O cinzento é para o "não
                    declarado" — é a ausência de resposta, não uma terceira
                    categoria, e uma cor viva dava-lhe um peso que não tem.
                  */
                  cores={[
                    "var(--grafico-1)",
                    "var(--grafico-2)",
                    "var(--grafico-neutro)",
                  ]}
                />
              )}
            </Bloco>

            <Bloco titulo="Idade" fatias={idade}>
              {() => <GraficoBarras fatias={idade} />}
            </Bloco>

            <Bloco titulo="Países" fatias={paises}>
              {() => <BarrasHorizontais fatias={paises} />}
            </Bloco>

            <Bloco titulo="Cidades" fatias={cidades}>
              {() => <BarrasHorizontais fatias={cidades} />}
            </Bloco>
          </div>
        </Seccao>
      )}

      {/* ------------------------------------------------------ publicações */}
      {publicacoes.length > 0 && (
        <Seccao titulo="Publicações">
          <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {publicacoes.slice(0, 9).map((publicacao) => (
              <li key={publicacao.id}>
                <Publicacao publicacao={publicacao} demonstracao={dados.demonstracao} />
              </li>
            ))}
          </ul>
        </Seccao>
      )}

      {/* ---------------------------------------------------------- contas */}
      <Seccao titulo="Contas ligadas">
        {dados.ligacoes.length === 0 && (
          <p className="text-sm text-texto-suave">
            {gere
              ? "Ainda não há nenhuma conta ligada a este quadro."
              : "A tua agência ainda não ligou as tuas redes a este quadro."}
          </p>
        )}

        {dados.ligacoes.length > 0 && (
          <ul className="divide-y divide-borda border-y border-borda">
            <li className="flex items-center gap-4 py-3">
              <button
                type="button"
                onClick={() => navegar({ rede: null })}
                aria-current={redeAtiva === null ? "true" : undefined}
                className={cn(
                  "text-sm",
                  redeAtiva === null
                    ? "font-medium text-texto"
                    : "text-texto-suave hover:text-texto",
                )}
              >
                Ver todas as redes
              </button>
            </li>

            {dados.ligacoes.map((ligacao) => (
              <li key={ligacao.id} className="flex items-center gap-4 py-3">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: REDES[ligacao.rede].cor }}
                  aria-hidden
                />

                <button
                  type="button"
                  onClick={() => navegar({ rede: ligacao.rede })}
                  aria-current={redeAtiva === ligacao.rede ? "true" : undefined}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={cn(
                      "block truncate text-sm",
                      redeAtiva === ligacao.rede
                        ? "font-medium text-texto"
                        : "text-texto hover:text-principal",
                    )}
                  >
                    {ligacao.nome_conta}
                  </span>
                  <span className="block text-xs text-texto-tenue">
                    {REDES[ligacao.rede].nome}
                    {ligacao.estado !== "activa" && " · ligação a precisar de atenção"}
                  </span>
                </button>

                {gere && (
                  <button
                    type="button"
                    onClick={() => {
                      definirADesligar({ id: ligacao.id, nome: ligacao.nome_conta });
                      confirmacao.abrir();
                    }}
                    className="shrink-0 text-[13px] text-texto-tenue hover:text-[var(--cor-perigo)]"
                  >
                    Desligar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {gere && naoLigadas.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className="text-texto-tenue">Ligar uma rede:</span>
            {naoLigadas.map((rede) => {
              const disponivel = dados.configuradas.includes(rede);
              return (
                <button
                  key={rede}
                  type="button"
                  disabled={!disponivel || ocupado}
                  onClick={() => ligar(rede)}
                  title={disponivel ? undefined : REDES[rede].porLigar}
                  className={cn(
                    "underline-offset-4",
                    disponivel
                      ? "text-principal hover:underline"
                      : "cursor-not-allowed text-texto-tenue",
                  )}
                >
                  {REDES[rede].nome}
                  {!disponivel && " (por configurar)"}
                </button>
              );
            })}
          </p>
        )}

        {!dados.demonstracao && dados.ligacoes[0]?.sincronizada_em && (
          <p className="mt-6 text-xs text-texto-tenue">
            Últimos números recolhidos a{" "}
            {new Intl.DateTimeFormat("pt-PT", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(dados.ligacoes[0].sincronizada_em))}
            . Atualizam-se sozinhos todas as manhãs.
          </p>
        )}
      </Seccao>
    </div>
  );
}

/* ------------------------------------------------------------------ peças */

/**
 * Uma secção: filete, título, conteúdo.
 *
 * O filete é o único traço que separa uma secção da seguinte — sem caixa, sem
 * fundo, sem sombra. É o que faz a página ler-se como uma folha e não como um
 * formulário.
 */
function Seccao({
  titulo,
  primeira = false,
  children,
}: {
  titulo: string;
  /** A primeira não leva filete: já tem a barra dos períodos por cima. */
  primeira?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("pt-10", !primeira && "mt-12 border-t border-borda")}>
      <h2 className="mb-7 text-[11px] font-semibold tracking-[0.08em] text-texto-tenue uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** O que um gráfico mostra, dito antes dele e em voz baixa. */
function Legenda({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[13px] text-texto-suave">{children}</p>;
}

/**
 * A faixa que diz que os números não são reais.
 *
 * É a única coisa nesta página que não pode ser discreta ao ponto de passar
 * despercebida — um painel de demonstração sem ela é um screenshot que anda por
 * aí como se fosse verdade. Mas também não precisa de ícone nem de fundo
 * colorido: um filete vertical e a palavra "Exemplo" dizem-no sem gritar.
 *
 * A mensagem muda com quem lê: o cliente lê uma promessa, quem gere lê o que
 * falta fazer.
 */
function FaixaDemonstracao({ gere }: { gere: boolean }) {
  return (
    <div className="mt-8 border-l-2 border-principal pl-4">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-principal uppercase">
        Exemplo
      </p>
      <p className="mt-1.5 text-[15px] text-texto">
        A Creative Line está a trabalhar para te dar o melhor. Sempre.
      </p>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        {gere
          ? "Este quadro ainda não tem nenhuma rede ligada. O que se segue é um exemplo do que o cliente vai ver — liga uma conta lá em baixo para o substituir pelos números reais."
          : "Em breve podes ver aqui todas as estatísticas reais da tua marca. O que se segue é um exemplo, para veres o que vem a caminho."}
      </p>
    </div>
  );
}

function Publicacao({
  publicacao,
  demonstracao,
}: {
  publicacao: DadosEstatisticas["publicacoes"][number];
  demonstracao: boolean;
}) {
  /*
    Os números em texto corrido, e não em cápsulas com ícone de coração. Um
    ícone por métrica dava três desenhos por cartão e vinte e sete na grelha —
    ruído a fingir densidade.
  */
  const numeros = [
    typeof publicacao.metricas.alcance === "number" &&
      `${porExtenso(publicacao.metricas.alcance)} alcançados`,
    typeof publicacao.metricas.gostos === "number" &&
      `${porExtenso(publicacao.metricas.gostos)} gostos`,
    typeof publicacao.metricas.comentarios === "number" &&
      `${porExtenso(publicacao.metricas.comentarios)} comentários`,
  ].filter(Boolean) as string[];

  const conteudo = (
    <>
      <div className="relative aspect-square overflow-hidden bg-superficie-2">
        {publicacao.miniatura_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicacao.miniatura_url}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          /*
            Sem miniatura, um bloco liso. Nada de fotografia de banco de imagens
            numa demonstração — isso fá-la-ia passar por real.
          */
          <span className="flex size-full items-center justify-center text-xs text-texto-tenue">
            {publicacao.tipo ?? "Publicação"}
          </span>
        )}
        {demonstracao && (
          <span className="absolute top-2 left-2 bg-superficie px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-principal uppercase">
            Exemplo
          </span>
        )}
      </div>

      <p className="mt-3 text-[11px] tracking-wide text-texto-tenue uppercase">
        {rotularDia(publicacao.publicado_em.slice(0, 10))}
        {publicacao.tipo && ` · ${publicacao.tipo}`}
      </p>

      <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-texto">
        {publicacao.legenda ?? "Sem legenda."}
      </p>

      {numeros.length > 0 && (
        <p className="mt-2 text-xs text-texto-suave" data-numerico>
          {numeros.join(" · ")}
        </p>
      )}
    </>
  );

  // Em demonstração não há para onde ir, e um link que não abre nada é pior do
  // que não haver link nenhum.
  return publicacao.url ? (
    <a
      href={publicacao.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group block"
    >
      {conteudo}
    </a>
  ) : (
    <div>{conteudo}</div>
  );
}
