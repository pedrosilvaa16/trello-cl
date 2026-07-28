// Leitura das variáveis de ambiente do Supabase.
//
// As duas primeiras são públicas (chegam ao browser via NEXT_PUBLIC_) e por isso
// têm de ser referidas literalmente — o Next substitui `process.env.NOME` no
// bundle em tempo de build, logo `process.env[nome]` não funcionaria.

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} em falta. Ver .env.example e criar .env.local.`,
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return obrigatoria(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

/** Chave pública. Todos os pedidos que a usam passam pelas políticas de RLS. */
export function chavePublicavel(): string {
  return obrigatoria(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** Chave de serviço. Ignora RLS — só pode ser lida no servidor. */
export function chaveDeServico(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "chaveDeServico() foi chamada no browser. A service_role nunca pode sair do servidor.",
    );
  }
  return obrigatoria(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
