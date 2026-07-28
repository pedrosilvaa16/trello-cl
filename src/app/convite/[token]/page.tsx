import { AlertCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Marca } from "@/components/marca";
import { Botao } from "@/components/ui/botao";
import { criarClienteAdmin } from "@/lib/supabase/servidor";

import { FormularioConvite } from "./formulario";

export const metadata: Metadata = { title: "Convite" };

// O token é único e de uso único: nunca guardar a resposta em cache.
export const dynamic = "force-dynamic";

export default async function PaginaConvite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Cliente de serviço: quem abre este link ainda não tem sessão nenhuma.
  const admin = criarClienteAdmin();
  const { data } = await admin.rpc("convite_por_token", { p_token: token });
  const convite = data?.[0];

  const motivo = !convite
    ? "Este link de convite não corresponde a nenhum convite. Confirma que o copiaste inteiro."
    : convite.usado_em
      ? "Este convite já foi usado. Se a conta é tua, entra com a tua palavra-passe."
      : new Date(convite.expira_em) <= new Date()
        ? "Este convite expirou. Os convites são válidos durante 7 dias — pede um novo a um admin."
        : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Marca className="mb-8 text-principal" />

        {motivo ? (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-texto">
              <AlertCircle className="size-5 text-perigo" aria-hidden />
              Convite inválido
            </h1>
            <p className="mt-2 mb-6 text-sm text-texto-suave">{motivo}</p>
            <Botao comoFilho variante="secundario" className="w-full">
              <Link href="/entrar">Ir para a entrada</Link>
            </Botao>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-texto">
              {convite!.nome_quadro
                ? `Convite para «${convite!.nome_quadro}»`
                : "Bem-vindo"}
            </h1>
            <p className="mt-1 mb-6 text-sm text-texto-suave">
              Vais criar a conta de{" "}
              <span className="font-medium text-texto">{convite!.email}</span>
              {convite!.nome_quadro && (
                <>
                  {" "}
                  e entrar no quadro como{" "}
                  <span className="font-medium text-texto">
                    {convite!.papel}
                  </span>
                </>
              )}
              .
            </p>

            <FormularioConvite token={token} />
          </>
        )}
      </div>
    </main>
  );
}
