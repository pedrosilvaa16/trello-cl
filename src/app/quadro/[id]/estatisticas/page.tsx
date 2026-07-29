import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PainelEstatisticas } from "@/components/estatisticas/painel";
import { periodoPorChave } from "@/lib/estatisticas/agregar";
import { carregarEstatisticas } from "@/lib/estatisticas/dados";
import { exigirPerfil } from "@/lib/perfil";
import { carregarCabecalhoQuadro } from "@/lib/quadro/dados";
import type { RedeSocial } from "@/lib/supabase/tipos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dados = await carregarCabecalhoQuadro(id);
  return { title: dados ? `Estatísticas · ${dados.quadro.nome}` : "Estatísticas" };
}

/**
 * O painel de resultados de um cliente.
 *
 * Os dados vêm todos do servidor, e todos pelo RLS — as políticas destas
 * tabelas delegam em `pode_aceder_quadro`, o que quer dizer que o cliente, que
 * é comentador, vê o painel completo. É isso que se quer: o separador existe
 * para ele.
 *
 * O período e a rede vivem na barra de endereços em vez de num `useState`.
 * Assim um link para "o Instagram deste cliente nos últimos 90 dias" é um link,
 * o botão de voltar funciona, e a agregação continua a acontecer no servidor
 * com os dados já filtrados.
 */
export default async function PaginaEstatisticas({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; rede?: string }>;
}) {
  const { id } = await params;
  const { periodo: chavePeriodo, rede } = await searchParams;

  await exigirPerfil();

  const dados = await carregarEstatisticas(
    id,
    periodoPorChave(chavePeriodo),
    rede as RedeSocial | undefined,
  );

  // Igual ao quadro: de fora, não ser membro e não existir são a mesma coisa.
  if (!dados) notFound();

  return (
    /*
      O `layout.tsx` do quadro é `h-dvh overflow-hidden`, para os separadores
      ficarem à vista. Quem rola é este contentor, e não a página — daí o
      `overflow-y-auto` aqui e não lá.

      `bg-superficie` e não o fundo da aplicação: este ecrã é uma folha branca
      com filetes, e o cinzento por baixo só faria sentido se houvesse caixas
      brancas por cima — que é exatamente o que aqui não há.
    */
    <main
      id="conteudo"
      className="barra-fina min-h-0 flex-1 overflow-y-auto bg-superficie"
    >
      <PainelEstatisticas dados={dados} />
    </main>
  );
}
