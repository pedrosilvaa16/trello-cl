import { z } from "zod";

import { exigirSuperAdmin, responderErro } from "@/lib/acessos";
import { criarClienteAdmin, criarClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({ ativo: z.boolean() });

/**
 * Ativa ou desativa uma conta.
 *
 * UTILIZADORES NÃO SE APAGAM. Apagar quebra a autoria dos comentários e o
 * histórico dos cartões; desativar tira o acesso e deixa o nome onde ele tem
 * de continuar a aparecer.
 *
 * A autoridade é `definir_estado_conta`, que corre com a sessão de quem pede,
 * verifica o papel e trava a regra da última conta super_admin ativa. Só
 * depois de ela passar é que o passo seguinte acontece.
 */
export async function PATCH(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await exigirSuperAdmin();
    const { id } = await contexto.params;

    const validado = esquema.safeParse(await pedido.json().catch(() => null));
    if (!validado.success) {
      return Response.json({ erro: "Estado inválido." }, { status: 400 });
    }

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("definir_estado_conta", {
      p_alvo: id,
      p_ativo: validado.data.ativo,
    });
    if (error) throw error;

    /*
      A coluna `ativo` já cortou o acesso a tudo — as funções de permissão
      começam todas por `conta_activa()`, e um separador que ficou aberto passa
      a não ver nada. Falta impedir a entrada, e isso vive no servidor de
      autenticação, que não conhece a tabela `profiles`.

      É a única `service_role` desta funcionalidade. Vem depois da autorização
      e não em vez dela: só corre se a chamada acima passou, e o que faz é
      bloquear a conta — nunca lê dados de quadros.
    */
    try {
      const admin = criarClienteAdmin();
      await admin.auth.admin.updateUserById(id, {
        // 100 anos: o Supabase não tem "para sempre", e reativar limpa isto.
        ban_duration: validado.data.ativo ? "none" : "876000h",
      });
    } catch {
      // A base de dados é a fonte de verdade e já foi atualizada. Se o
      // bloqueio falhar, a pessoa consegue autenticar-se e não vê nada — mau,
      // mas não é uma fuga. Fica o registo para quem estiver a ver os logs.
      console.error(
        `Conta ${id}: o estado mudou em profiles mas o bloqueio no Auth falhou.`,
      );
    }

    return Response.json({ pessoa: data });
  } catch (erro) {
    return responderErro(erro);
  }
}
