import { gerarToken, quemPede, responderErro } from "@/lib/acessos";
import { enviarConvite, origemDe } from "@/lib/convites";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Reenvia o email de um convite.
 *
 * Se o convite ainda é válido, sai o mesmo link. Se já expirou, `renovar_convite`
 * dá-lhe um token novo e mais sete dias — o que invalida o antigo, e é o que se
 * quer: um link que andou duas semanas a passear por caixas de correio não deve
 * voltar a funcionar por causa de um clique de renovação.
 *
 * O token novo é gerado aqui, no servidor, pela mesma razão de sempre: é o
 * segredo que dá entrada na plataforma, e não se aceita um segredo que venha
 * de fora.
 */
export async function POST(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await quemPede();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { data: convite, error } = await supabase.rpc("renovar_convite", {
      p_convite: id,
      p_token: gerarToken(),
    });
    if (error) throw error;

    const ligacao = `${origemDe(pedido)}/convite/${convite.token}`;
    const envio = await enviarConvite({ convite, ligacao, supabase });

    if (!envio.enviado) {
      // 502 e não 500: o que falhou foi o fornecedor de email, e o convite
      // continua válido. A mensagem do Resend diz o que está mal (domínio por
      // verificar, chave inválida) e é mais útil do que qualquer paráfrase.
      return Response.json(
        { erro: envio.motivo, convite, ligacao },
        { status: 502 },
      );
    }

    return Response.json({ convite, ligacao, envio });
  } catch (erro) {
    return responderErro(erro);
  }
}
