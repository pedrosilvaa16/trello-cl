import { z } from "zod";

import { exigirAdmin, gerarToken, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const papelQuadro = z.enum(["gestor", "editor", "comentador", "leitor"]);

const acesso = z
  .object({
    quadro: z.string().uuid().optional(),
    cartao: z.string().uuid().optional(),
    papel: papelQuadro.default("editor"),
    expira_em: z.string().datetime().nullable().optional(),
  })
  // Um acesso é a um quadro ou a um cartão. Aos dois não faz sentido, a nenhum
  // também não — e a base de dados tem a mesma restrição em CHECK.
  .refine((a) => Boolean(a.quadro) !== Boolean(a.cartao), {
    message: "Cada acesso é a um quadro ou a um cartão, não aos dois.",
  });

const esquema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  papelGlobal: z.enum(["super_admin", "admin", "externo"]).default("externo"),
  acessos: z.array(acesso).max(50).default([]),
});

/**
 * Cria um convite: email, papel global e os quadros e cartões a que dá acesso,
 * tudo no mesmo passo.
 *
 * As regras de quem convida quem estão em `criar_convite`, em SQL:
 *   - super_admin  qualquer pessoa, com qualquer papel global
 *   - admin        só com papel global externo, e só para quadros que gere
 *   - admin        NUNCA promove ninguém a admin ou a super_admin
 *
 * O token nasce aqui e não no cliente: é o segredo que dá entrada na
 * plataforma, e não se aceita um segredo que venha de fora.
 *
 * Não há servidor de email ligado — a resposta traz o link para copiar, em vez
 * de fingir um envio que não aconteceu.
 */
export async function POST(pedido: Request) {
  try {
    await exigirAdmin();

    const validado = esquema.safeParse(await pedido.json().catch(() => null));
    if (!validado.success) {
      return Response.json(
        {
          erro: "Pedido inválido.",
          detalhe: validado.error.issues[0]?.message,
        },
        { status: 400 },
      );
    }

    const { email, papelGlobal, acessos } = validado.data;
    const token = gerarToken();

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("criar_convite", {
      p_email: email,
      p_token: token,
      p_papel_global: papelGlobal,
      p_acessos: acessos,
    });
    if (error) throw error;

    const origem = new URL(pedido.url).origin;
    return Response.json({
      convite: data,
      ligacao: `${origem}/convite/${token}`,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
