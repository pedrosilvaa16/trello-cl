import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { AreaTarefas } from "@/components/tarefas/area";
import { exigirPerfil } from "@/lib/perfil";
import { carregarTarefas } from "@/lib/tarefas/dados";

export const metadata: Metadata = { title: "Tarefas" };

/**
 * O separador «Tarefas»: o trabalho interno da equipa, fora dos quadros.
 *
 * `notFound()` e não uma página de "não tens acesso": quem não é da casa não
 * deve descobrir que isto existe. Um 403 confirma que o recurso está lá — é a
 * mesma regra da «Estratégia», e a página segue-a pela mesma razão.
 *
 * Quem decide é `carregarTarefas`, que começa por perguntar à base de dados
 * (`pode_gerir_tarefas`) em vez de olhar para o `papel_global` que veio no
 * perfil. Esconder um separador não é uma permissão; isto é.
 */
export default async function PaginaTarefas() {
  const perfil = await exigirPerfil();
  const dados = await carregarTarefas();

  if (!dados) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Cabecalho perfil={perfil} />
      <AreaTarefas
        dados={dados}
        perfil={perfil}
        agoraInicial={new Date().toISOString()}
      />
    </div>
  );
}
