import "server-only";

import type { RedeSocial } from "@/lib/supabase/tipos";

import type { Fornecedor } from "./fornecedor";
import { fornecedorLinkedin, redirecionamentoLinkedin } from "./linkedin";
import { fornecedorMeta, redirecionamentoMeta } from "./meta";
import { fornecedorTiktok, redirecionamentoTiktok } from "./tiktok";

/**
 * O registo das redes.
 *
 * É o único sítio que conhece as quatro ao mesmo tempo. Tudo o resto — as
 * rotas, o motor de sincronização, o painel — pede um `Fornecedor` aqui e
 * trabalha contra o contrato.
 */

const FORNECEDORES: Record<RedeSocial, Fornecedor> = {
  instagram: fornecedorMeta("instagram"),
  facebook: fornecedorMeta("facebook"),
  linkedin: fornecedorLinkedin,
  tiktok: fornecedorTiktok,
};

export function fornecedorDe(rede: RedeSocial): Fornecedor {
  return FORNECEDORES[rede];
}

/**
 * O endereço de retorno de cada rede.
 *
 * Um por rede, e não um só com a rede no `state`: o `redirect_uri` tem de estar
 * registado na app de cada plataforma, e vê-lo escrito por extenso na
 * configuração delas é mais fácil de conferir do que um genérico.
 */
export function redirecionamentoDe(rede: RedeSocial): string {
  switch (rede) {
    case "instagram":
    case "facebook":
      // A Meta é uma app só, e por isso um callback só. Qual das duas redes se
      // está a ligar vai no `state`.
      return redirecionamentoMeta();
    case "linkedin":
      return redirecionamentoLinkedin();
    case "tiktok":
      return redirecionamentoTiktok();
  }
}

/**
 * As redes que este ambiente sabe ligar.
 *
 * Uma rede sem credenciais não é um erro — é o estado normal de uma rede cuja
 * aprovação ainda não chegou. O painel mostra-a a cinzento e diz porquê, em vez
 * de a esconder e deixar a pergunta no ar.
 */
export function redesConfiguradas(): RedeSocial[] {
  return (Object.keys(FORNECEDORES) as RedeSocial[]).filter((rede) =>
    FORNECEDORES[rede].configurado(),
  );
}
