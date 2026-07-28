"use client";

import { Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Emblema } from "@/components/ui/emblema";
import { Vazio } from "@/components/ui/vazio";
import { NOMES_PAPEL_GLOBAL } from "@/lib/quadro/tipos";
import type { PapelGlobal, Perfil, PessoaNaLista } from "@/lib/supabase/tipos";

import { ConvidarPessoa, type QuadroParaConvite } from "./convidar-pessoa";

type FiltroPapel = PapelGlobal | "todos";
type FiltroEstado = "todos" | "ativos" | "desativados";

/**
 * A lista de pessoas, com pesquisa e filtros.
 *
 * Tudo o que se vê aqui já passou pelo servidor: a lista chega filtrada pelo
 * âmbito de quem está a ver. Os filtros desta barra são para encontrar, não
 * para proteger.
 */
export function PainelPessoas({
  pessoas,
  quadros,
  euProprio,
}: {
  pessoas: PessoaNaLista[];
  quadros: QuadroParaConvite[];
  euProprio: Perfil;
}) {
  const [texto, definirTexto] = React.useState("");
  const [papel, definirPapel] = React.useState<FiltroPapel>("todos");
  const [estado, definirEstado] = React.useState<FiltroEstado>("ativos");
  const [aConvidar, definirAConvidar] = React.useState(false);

  const eSuperAdmin = euProprio.papel_global === "super_admin";

  const visiveis = React.useMemo(() => {
    const procura = texto.trim().toLowerCase();
    return pessoas.filter((pessoa) => {
      if (papel !== "todos" && pessoa.papel_global !== papel) return false;
      if (estado === "ativos" && !pessoa.ativo) return false;
      if (estado === "desativados" && pessoa.ativo) return false;
      if (!procura) return true;
      return (
        pessoa.nome.toLowerCase().includes(procura) ||
        pessoa.email.toLowerCase().includes(procura)
      );
    });
  }, [pessoas, texto, papel, estado]);

  const desativados = pessoas.filter((p) => !p.ativo).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-texto">
            Pessoas
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-texto-suave">
            Quem tem acesso a quê.{" "}
            {eSuperAdmin
              ? "Vês todas as contas da plataforma."
              : "Vês quem partilha quadros contigo."}
          </p>
        </div>

        <Botao variante="principal" onClick={() => definirAConvidar(true)}>
          <UserPlus /> Convidar pessoa
        </Botao>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-texto-tenue"
            aria-hidden
          />
          <Campo
            type="search"
            value={texto}
            onChange={(evento) => definirTexto(evento.target.value)}
            placeholder="Procurar por nome ou email"
            aria-label="Procurar pessoas"
            className="pl-8"
          />
        </div>

        <Seletor
          rotulo="Papel global"
          valor={papel}
          aoMudar={(v) => definirPapel(v as FiltroPapel)}
          opcoes={[
            ["todos", "Todos os papéis"],
            ["super_admin", NOMES_PAPEL_GLOBAL.super_admin],
            ["admin", NOMES_PAPEL_GLOBAL.admin],
            ["externo", NOMES_PAPEL_GLOBAL.externo],
          ]}
        />

        <Seletor
          rotulo="Estado da conta"
          valor={estado}
          aoMudar={(v) => definirEstado(v as FiltroEstado)}
          opcoes={[
            ["ativos", "Ativos"],
            ["desativados", `Desativados${desativados ? ` (${desativados})` : ""}`],
            ["todos", "Todos os estados"],
          ]}
        />
      </div>

      {visiveis.length === 0 ? (
        <Vazio
          icone={Users}
          titulo={
            pessoas.length === 0
              ? "Ainda não há ninguém para gerir"
              : "Nada corresponde a esta procura"
          }
          descricao={
            pessoas.length === 0
              ? "Convida a primeira pessoa e ela aparece aqui assim que aceitar."
              : "Muda o texto ou limpa os filtros para voltar a ver a lista toda."
          }
          acao={
            pessoas.length === 0 ? (
              <Botao variante="principal" onClick={() => definirAConvidar(true)}>
                <UserPlus /> Convidar pessoa
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-borda rounded-lg border border-borda">
          {visiveis.map((pessoa) => (
            <LinhaPessoa
              key={pessoa.id}
              pessoa={pessoa}
              euProprio={pessoa.id === euProprio.id}
            />
          ))}
        </ul>
      )}

      <ConvidarPessoa
        aberto={aConvidar}
        aoMudarAberto={definirAConvidar}
        quadros={quadros}
        podeEscolherPapelGlobal={eSuperAdmin}
      />
    </>
  );
}

function LinhaPessoa({
  pessoa,
  euProprio,
}: {
  pessoa: PessoaNaLista;
  euProprio: boolean;
}) {
  return (
    <li>
      <Link
        href={`/pessoas/${pessoa.id}`}
        className={
          "flex items-center gap-3 px-3 py-2.5 transition-colors " +
          "duration-[var(--duracao-rapida)] hover:bg-superficie-2 " +
          "focus-visible:bg-superficie-2 focus-visible:outline-none"
        }
      >
        <Avatar
          perfil={pessoa}
          className={pessoa.ativo ? undefined : "opacity-40 grayscale"}
        />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-texto">
            {pessoa.nome}
            {euProprio && (
              <span className="text-xs font-normal text-texto-tenue">(tu)</span>
            )}
            {!pessoa.ativo && <Emblema>Desativada</Emblema>}
          </p>
          <p className="truncate text-xs text-texto-tenue">{pessoa.email}</p>
        </div>

        <div className="hidden shrink-0 text-right text-xs text-texto-tenue sm:block">
          <p>{contar(pessoa.quadros, "quadro", "quadros")}</p>
          {pessoa.cartoes > 0 && (
            <p>{contar(pessoa.cartoes, "cartão solto", "cartões soltos")}</p>
          )}
        </div>

        <div className="hidden w-28 shrink-0 text-right text-xs text-texto-tenue md:block">
          {ultimoAcesso(pessoa.ultimo_acesso)}
        </div>

        <Emblema className="shrink-0">
          {NOMES_PAPEL_GLOBAL[pessoa.papel_global]}
        </Emblema>
      </Link>
    </li>
  );
}

function Seletor({
  rotulo,
  valor,
  aoMudar,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  opcoes: [string, string][];
}) {
  return (
    <select
      value={valor}
      aria-label={rotulo}
      onChange={(evento) => aoMudar(evento.target.value)}
      className="h-9 rounded-md border border-borda-forte bg-superficie px-2 text-sm text-texto"
    >
      {opcoes.map(([chave, nome]) => (
        <option key={chave} value={chave}>
          {nome}
        </option>
      ))}
    </select>
  );
}

function contar(quantos: number, singular: string, plural: string) {
  return `${quantos} ${quantos === 1 ? singular : plural}`;
}

/** Datas absolutas dão trabalho a ler numa lista; aqui interessa a distância. */
function ultimoAcesso(quando: string | null) {
  if (!quando) return "Nunca entrou";

  const dias = Math.floor(
    (Date.now() - new Date(quando).getTime()) / 86_400_000,
  );
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 30) return `Há ${dias} dias`;
  if (dias < 365) return `Há ${Math.floor(dias / 30)} meses`;
  return "Há mais de um ano";
}
