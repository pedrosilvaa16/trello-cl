import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { LIMITE_BYTES, chaveDoAnexoDeTarefa, urlDeEscrita } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  tarefa: z.string().uuid(),
  nomeFicheiro: z.string().trim().min(1).max(255),
  tamanho: z.number().int().positive().max(LIMITE_BYTES),
  tipoMime: z.string().trim().min(1).max(160),
});

/**
 * Autoriza o envio de um documento para uma tarefa e devolve um URL de escrita.
 *
 * O ficheiro vai do browser direto para o R2, sem passar por aqui — é o que
 * permite 200 MB sem esbarrar no limite de corpo de pedido de uma função
 * serverless, e é o mesmo caminho que os anexos dos quadros já usam.
 *
 * Duas coisas são decididas aqui e não se negoceiam: **se** pode enviar e
 * **para onde**. A chave do objeto nunca vem do cliente — se viesse, alguém
 * escrevia por cima do anexo de outra tarefa, ou inseria uma linha a apontar
 * para um ficheiro que não é dela. A segunda metade dessa garantia está na
 * base de dados, no trigger `tarefa_anexos_caminho_no_sitio`.
 */
export async function POST(pedido: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
  }

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return NextResponse.json(
      { erro: "Pedido inválido.", detalhe: validado.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { tarefa, nomeFicheiro, tipoMime } = validado.data;

  /*
    A leitura *é* a verificação de permissão: `tarefas` tem RLS com
    `pode_gerir_tarefas()`, e quem não passa nela não vê a linha. Perguntar
    aqui outra coisa qualquer seria pôr duas regras a decidir o mesmo — e a
    mais frouxa das duas passaria a ser a que realmente vale.

    404 e nunca 403, como o resto do separador: um 403 confirma que a tarefa
    existe a quem não devia sequer saber que o separador existe.
  */
  const { data: linha } = await supabase
    .from("tarefas")
    .select("id, espaco_id")
    .eq("id", tarefa)
    .maybeSingle();

  if (!linha) {
    return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 });
  }

  /*
    O uuid da chave é só para dois ficheiros com o mesmo nome na mesma tarefa
    não se pisarem — não é, e não deve ser, o id da linha. O id da linha nasce
    do `default gen_random_uuid()` da tabela, e é por isso que `id` não está no
    GRANT de INSERT: quanto menos colunas o browser puder escrever, menos há a
    verificar. O que liga a linha ao objeto é `caminho_storage`, e essa ligação
    é imposta pelo trigger `tarefa_anexos_caminho_no_sitio`.
  */
  const chave = chaveDoAnexoDeTarefa(
    linha.espaco_id,
    linha.id,
    randomUUID(),
    nomeFicheiro,
  );

  try {
    const url = await urlDeEscrita(chave, tipoMime);
    return NextResponse.json({ chave, url });
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível preparar o envio. Tenta outra vez." },
      { status: 502 },
    );
  }
}
