import { z } from "zod";

import { exigirAdmin, exigirSuperAdmin, responderErro } from "@/lib/acessos";
import { criarClienteAdmin, criarClienteServidor } from "@/lib/supabase/servidor";

/** O detalhe de uma pessoa: quadros, cartões soltos, quem concedeu e quando. */
export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await exigirAdmin();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("detalhe_pessoa", { p_alvo: id });
    if (error) throw error;

    return Response.json(data);
  } catch (erro) {
    return responderErro(erro);
  }
}

const esquema = z.object({
  papelGlobal: z.enum(["super_admin", "admin", "externo"]),
});

/**
 * Altera o papel global — eixo A, exclusivo do super_admin.
 *
 * A verificação está em dois sítios de propósito, e não é redundância a mais:
 * `exigirSuperAdmin` dá o 403 legível, e `definir_papel_global` recusa na
 * mesma a quem lá chegue por outro caminho. Só a segunda é que é a permissão.
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
      return Response.json(
        { erro: "Papel global inválido." },
        { status: 400 },
      );
    }

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("definir_papel_global", {
      p_alvo: id,
      p_papel: validado.data.papelGlobal,
    });
    if (error) throw error;

    return Response.json({ pessoa: data });
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Elimina a conta de vez. A saída de emergência, e não o caminho normal.
 *
 * Dois passos, por esta ordem e não pela outra:
 *
 * 1. `preparar_eliminacao_conta`, com a sessão de quem pede — é aqui que as
 *    permissões são mesmo verificadas, e é aqui que o nome de quem escreveu
 *    passa para texto, para os comentários não ficarem órfãos.
 * 2. A eliminação em si, pela Admin API, que é quem invalida as sessões e os
 *    refresh tokens. Apagar de `auth.users` faz cascata até `profiles`, e daí
 *    até tudo o que dependia dela.
 *
 * A chave de serviço só entra no segundo passo, depois de o primeiro ter dito
 * que sim. Nunca é ela a decidir se a operação pode acontecer — ignora o RLS
 * por completo, e uma verificação feita com ela é uma verificação que não se
 * fez.
 */
export async function DELETE(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    const quem = await exigirSuperAdmin();
    const { id } = await contexto.params;

    if (id === quem.id) {
      return Response.json(
        { erro: "Não podes eliminar a tua própria conta." },
        { status: 400 },
      );
    }

    const supabase = await criarClienteServidor();
    const { data: resumo, error } = await supabase.rpc(
      "preparar_eliminacao_conta",
      { p_alvo: id },
    );
    if (error) throw error;

    const { error: erroAoApagar } = await criarClienteAdmin().auth.admin.deleteUser(id);
    if (erroAoApagar) {
      /*
        A conta continua de pé e a autoria já foi carimbada — o que não se nota,
        porque a interface só lê o nome em texto quando o perfil desaparece.
        Dizer a verdade sobre o que falhou vale mais do que tentar desfazer um
        carimbo que não faz mal nenhum a ninguém.
      */
      console.error("Falha ao eliminar a conta no GoTrue:", erroAoApagar);
      return Response.json(
        {
          erro:
            "A conta não foi eliminada e continua a existir. " +
            "Tenta outra vez; se persistir, desativa-a.",
        },
        { status: 502 },
      );
    }

    return Response.json({ eliminada: true, resumo });
  } catch (erro) {
    return responderErro(erro);
  }
}
