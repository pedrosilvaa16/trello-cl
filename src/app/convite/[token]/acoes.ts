"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { criarClienteAdmin, criarClienteServidor } from "@/lib/supabase/servidor";

import { MINIMO_PALAVRA_PASSE, type EstadoConvite } from "./constantes";

const esquema = z
  .object({
    token: z.string().min(1),
    nome: z
      .string()
      .trim()
      .min(2, "Escreve o teu nome — é o que os colegas vão ver.")
      .max(80, "O nome não pode passar dos 80 caracteres."),
    palavraPasse: z
      .string()
      .min(
        MINIMO_PALAVRA_PASSE,
        `A palavra-passe precisa de pelo menos ${MINIMO_PALAVRA_PASSE} caracteres.`,
      ),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.palavraPasse === dados.confirmacao, {
    message: "As duas palavras-passe não são iguais.",
    path: ["confirmacao"],
  });

/**
 * Resgatar um convite: criar a conta e ficar com sessão iniciada.
 *
 * Corre com a service_role porque quem está deste lado ainda não tem sessão
 * nenhuma — é literalmente o pedido de quem ainda não existe na plataforma.
 * Por isso valida tudo outra vez aqui, sem confiar em nada que venha do
 * formulário além do token.
 */
export async function aceitarConvite(
  _anterior: EstadoConvite,
  dados: FormData,
): Promise<EstadoConvite> {
  const validado = esquema.safeParse({
    token: dados.get("token"),
    nome: dados.get("nome"),
    palavraPasse: dados.get("palavraPasse"),
    confirmacao: dados.get("confirmacao"),
  });

  if (!validado.success) {
    return { erro: validado.error.issues[0].message };
  }

  const { token, nome, palavraPasse } = validado.data;
  const admin = criarClienteAdmin();

  const { data: convites, error: erroConvite } = await admin.rpc(
    "convite_por_token",
    { p_token: token },
  );

  const convite = convites?.[0];
  if (erroConvite || !convite) {
    return { erro: "Este convite não existe. Confirma o link que recebeste." };
  }
  if (!convite.valido) {
    return {
      erro: convite.usado_em
        ? "Este convite já foi usado. Se a conta é tua, entra com a tua palavra-passe."
        : "Este convite expirou. Pede um novo a um admin.",
    };
  }

  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email: convite.email,
    password: palavraPasse,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (erroCriar || !criado.user) {
    const mensagem = erroCriar?.message ?? "";
    if (/already|registered|exists/i.test(mensagem)) {
      return {
        erro: "Já existe uma conta com este email. Entra com a tua palavra-passe em vez de usares o convite.",
      };
    }
    if (/domínio|dominio|autorizado/i.test(mensagem)) {
      return {
        erro: "Este email não pertence a um domínio autorizado. Fala com um admin.",
      };
    }
    return {
      erro: "Não foi possível criar a conta. Tenta outra vez; se continuar, fala com um admin.",
    };
  }

  const { error: erroResgate } = await admin.rpc("resgatar_convite", {
    p_token: token,
    p_utilizador: criado.user.id,
  });

  if (erroResgate) {
    // A conta não pode ficar de pé sem o convite consumido, senão sobra um
    // utilizador sem quadro nenhum e o convite continua a parecer válido.
    await admin.auth.admin.deleteUser(criado.user.id);
    return {
      erro: "O convite foi usado entretanto. Pede um novo a um admin.",
    };
  }

  const supabase = await criarClienteServidor();
  const { error: erroEntrada } = await supabase.auth.signInWithPassword({
    email: convite.email,
    password: palavraPasse,
  });

  if (erroEntrada) {
    // Conta criada, sessão é que não. Melhor mandar entrar do que fingir erro.
    redirect("/entrar");
  }

  redirect(convite.board_id ? `/quadro/${convite.board_id}` : "/");
}
