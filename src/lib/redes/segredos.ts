import "server-only";

import { criarClienteAdmin } from "@/lib/supabase/servidor";

import { cifrar } from "./cifra";

/**
 * Grava o token de uma ligação, cifrado.
 *
 * É o único caminho até `ligacoes_segredos`. A tabela tem RLS ativa e política
 * nenhuma — nem o gestor do quadro nem o super_admin lá chegam a partir de um
 * browser — e por isso a escrita passa pela `service_role`, que só existe do
 * lado do servidor.
 *
 * O que entra já vai cifrado por `cifra.ts`: a base de dados guarda o token sem
 * o saber ler. Mesmo que alguém chegasse à tabela, levava daqui bytes.
 */
export async function guardarSegredo(entrada: {
  ligacao: string;
  token: string;
  refresh?: string | null;
  ambito?: string | null;
}): Promise<void> {
  const admin = criarClienteAdmin();

  const { error } = await admin.from("ligacoes_segredos").upsert(
    {
      ligacao_id: entrada.ligacao,
      token_cifrado: cifrar(entrada.token),
      refresh_cifrado: entrada.refresh ? cifrar(entrada.refresh) : null,
      ambito: entrada.ambito ?? null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "ligacao_id" },
  );

  if (error) {
    /*
      A ligação já existe e o token não. É o pior estado possível — o painel
      diria "ligado" e nunca sincronizava — por isso isto tem de rebentar alto e
      dizer a saída, em vez de deixar meia ligação de pé.
    */
    throw new Error(
      `A conta ficou ligada mas o token não foi guardado (${error.message}). ` +
        "Volta a ligar a conta.",
    );
  }
}
