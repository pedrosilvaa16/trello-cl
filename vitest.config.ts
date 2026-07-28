import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes da lógica pura: posições e filtros.
 *
 * O que precisa de base de dados é testado em SQL contra um Postgres a sério
 * (ver supabase/tests/ e ./scripts/testar-rls.sh). Estes correm em milésimos e
 * cobrem as duas peças onde um erro de contas se traduz num cartão no sítio
 * errado à frente do utilizador.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
