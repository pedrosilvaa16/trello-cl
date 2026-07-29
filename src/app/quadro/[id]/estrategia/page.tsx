import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PainelEstrategia } from "@/components/estrategia/painel";
import { montarContexto } from "@/lib/contexto";
import { exigirPerfil } from "@/lib/perfil";
import { carregarCabecalhoQuadro } from "@/lib/quadro/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dados = await carregarCabecalhoQuadro(id);
  // Só quem gere chega a esta página; para os outros o título é o genérico,
  // que também é o que a resposta 404 mostra.
  return {
    title:
      dados?.papel === "gestor" ? `Estratégia · ${dados.quadro.nome}` : "Quadro",
  };
}

/**
 * O separador «Estratégia»: onde o contexto de um cliente se cura.
 *
 * `notFound()` e não uma página de «sem permissão». Para quem não gere o
 * quadro esta rota não existe — é a mesma regra das rotas de API, e pela mesma
 * razão: um ecrã a dizer «não podes ver isto» confirma que isto existe.
 *
 * Tudo o que se vê aqui é carregado no servidor. O painel «O que a AI vê»
 * mostra o resultado real de `montarContexto`, e não uma aproximação montada
 * no browser — se fosse uma segunda implementação, divergiria da verdadeira e
 * passaria a mentir exatamente quando fosse preciso confiar nela.
 */
export default async function PaginaEstrategia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPerfil();

  const dados = await carregarCabecalhoQuadro(id);
  if (!dados || dados.papel !== "gestor") notFound();

  const supabase = await criarClienteServidor();

  const [{ data: contexto }, { data: listas }, { data: aprendizagens }, montado] =
    await Promise.all([
      supabase
        .from("board_contexto")
        .select("estrategia, voz_marca, atualizado_em, autor:profiles(nome)")
        .eq("board_id", id)
        .maybeSingle(),
      supabase
        .from("lists")
        .select("id, nome, tipo, arquivada")
        .eq("board_id", id)
        .eq("arquivada", false)
        .order("posicao"),
      supabase
        .from("aprendizagens")
        .select("*")
        .eq("board_id", id)
        .order("criado_em", { ascending: false }),
      montarContexto(id, "ideias"),
    ]);

  const idsReferencias = (listas ?? [])
    .filter((l) => l.tipo === "referencias")
    .map((l) => l.id);

  const { data: referencias } = idsReferencias.length
    ? await supabase
        .from("cards")
        .select("id, titulo, referencia_porque, referencia_url, list_id")
        .in("list_id", idsReferencias)
        .eq("arquivado", false)
        .order("criado_em", { ascending: false })
    : { data: [] };

  /*
    Sem `overflow-y-auto` aqui: cada coluna do workspace rola por si, e a
    página nunca rola. É o que mantém o rail das secções e o painel do contexto
    à vista enquanto se trabalha no meio.
  */
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PainelEstrategia
        idQuadro={id}
        nomeQuadro={dados.quadro.nome}
        contexto={{
          estrategia: contexto?.estrategia ?? "",
          vozMarca: contexto?.voz_marca ?? "",
          atualizadoEm: contexto?.atualizado_em ?? null,
          autor:
            (contexto?.autor as { nome: string } | null | undefined)?.nome ??
            null,
        }}
        listas={listas ?? []}
        referencias={referencias ?? []}
        aprendizagens={aprendizagens ?? []}
        montado={montado}
      />
    </div>
  );
}
