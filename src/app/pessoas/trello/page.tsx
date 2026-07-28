import { ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho } from "@/components/cabecalho";
import { AssociarPessoas } from "@/components/pessoas/associar-pessoas";
import { Botao } from "@/components/ui/botao";
import { Vazio } from "@/components/ui/vazio";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Pessoas da Trello" };

export default async function PaginaPessoas() {
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();

  // A vista já está protegida por RLS, mas sem esta verificação quem não gere
  // nada via a página vazia em vez de saber que não é para ele.
  const { data: eAdminAlgures } = await supabase.rpc("e_admin_algures");
  const eAdmin = eAdminAlgures ?? false;

  const { data: pessoas } = eAdmin
    ? await supabase
        .from("pessoas_trello_resumo")
        .select("*")
        .order("perfil_id", { nullsFirst: true })
        .order("comentarios", { ascending: false })
    : { data: [] };

  // Contas a que se pode associar: as que este admin já vê.
  const { data: perfis } = await supabase
    .from("profiles")
    .select("id, nome, avatar_url")
    .order("nome");

  return (
    <>
      <Cabecalho perfil={perfil} />

      <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        <Botao comoFilho variante="fantasma" tamanho="pequeno" className="mb-4 -ml-2">
          <Link href="/pessoas">
            <ArrowLeft /> Pessoas
          </Link>
        </Botao>

        <h1 className="text-lg font-semibold tracking-tight text-texto">
          Pessoas da Trello
        </h1>
        <p className="mt-1 mb-6 max-w-2xl text-sm text-texto-suave">
          Quem escreveu e recebeu cartões na Trello, e a conta a que corresponde
          aqui. Associar uma pessoa passa-lhe os comentários, os anexos, os
          quadros e os cartões que estavam à espera — e pode ser corrigido
          depois, quantas vezes for preciso.
        </p>

        {!eAdmin ? (
          <Vazio
            icone={Users}
            titulo="Isto é para quem gere quadros"
            descricao="Associar pessoas importadas mexe na autoria de comentários em vários quadros, por isso só quem gere algum quadro o pode fazer."
          />
        ) : (pessoas ?? []).length === 0 ? (
          <Vazio
            icone={Users}
            titulo="Não há nada importado da Trello"
            descricao="Esta página enche-se depois de correr a importação. Até lá, não há ninguém para associar."
          />
        ) : (
          <AssociarPessoas pessoas={pessoas ?? []} perfis={perfis ?? []} />
        )}
      </main>
    </>
  );
}
