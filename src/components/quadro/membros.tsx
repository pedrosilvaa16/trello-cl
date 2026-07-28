"use client";

import { Copy, Link2, Mail, UserPlus, X } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo, Etiqueta as Rotulo } from "@/components/ui/campo";
import { CaixaDialogo, Dialogo } from "@/components/ui/dialogo";
import { Emblema } from "@/components/ui/emblema";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
  RotuloMenu,
  SeparadorMenu,
} from "@/components/ui/menu";
import type { AccaoQuadro } from "@/lib/quadro/estado";
import * as mutar from "@/lib/quadro/mutacoes";
import {
  DESCRICOES_PAPEL,
  NOMES_PAPEL,
  type MembroComPerfil,
} from "@/lib/quadro/tipos";
import type { Convite, PapelQuadro, Perfil } from "@/lib/supabase/tipos";

export function GestorMembros({
  aberto,
  aoMudarAberto,
  idQuadro,
  nomeQuadro,
  membros,
  utilizador,
  despachar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  idQuadro: string;
  nomeQuadro: string;
  membros: MembroComPerfil[];
  utilizador: Perfil;
  despachar: React.Dispatch<AccaoQuadro>;
}) {
  const [email, definirEmail] = React.useState("");
  const [papel, definirPapel] = React.useState<PapelQuadro>("editor");
  const [ocupado, definirOcupado] = React.useState(false);
  const [pendentes, definirPendentes] = React.useState<Convite[]>([]);
  const [ligacaoNova, definirLigacaoNova] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    mutar
      .convitesPendentes(idQuadro)
      .then(definirPendentes)
      .catch(() => definirPendentes([]));
  }, [aberto, idQuadro]);

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault();
    const alvo = email.trim().toLowerCase();
    if (!alvo) return;

    definirOcupado(true);
    definirLigacaoNova(null);
    try {
      const perfil = await mutar.procurarPerfil(alvo);

      if (perfil) {
        await mutar.adicionarMembro(idQuadro, perfil.id, papel);
        despachar({
          tipo: "membro:upsert",
          membro: { user_id: perfil.id, papel, perfil },
        });
        avisar.feito(`${perfil.nome} entrou no quadro.`);
        definirEmail("");
        return;
      }

      // Sem conta: o caminho é um convite à plataforma.
      const { convite, ligacao } = await mutar.criarConvite(
        alvo,
        idQuadro,
        papel,
        utilizador.id,
      );
      definirPendentes((atuais) => [convite, ...atuais]);
      definirLigacaoNova(ligacao);
      definirEmail("");
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível convidar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function mudarPapel(membro: MembroComPerfil, novo: PapelQuadro) {
    try {
      await mutar.alterarPapel(idQuadro, membro.user_id, novo);
      despachar({ tipo: "membro:upsert", membro: { ...membro, papel: novo } });
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível mudar o papel.",
      );
    }
  }

  async function remover(membro: MembroComPerfil) {
    try {
      await mutar.removerMembro(idQuadro, membro.user_id);
      despachar({ tipo: "membro:remover", utilizador: membro.user_id });
      avisar.feito(`${membro.perfil.nome} saiu do quadro.`);
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível remover.",
      );
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={aoMudarAberto}>
      <CaixaDialogo
        titulo="Membros do quadro"
        descricao={`Quem pode ver e alterar «${nomeQuadro}».`}
        larguraMaxima="max-w-lg"
      >
        <form onSubmit={adicionar} className="space-y-2">
          <Rotulo htmlFor="convidar">Convidar por email</Rotulo>
          <div className="flex gap-2">
            <Campo
              id="convidar"
              type="email"
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              placeholder="colega@empresa.pt"
              className="flex-1"
            />
            <SeletorPapel valor={papel} aoMudar={definirPapel} />
            <Botao type="submit" variante="principal" ocupado={ocupado}>
              <UserPlus />
              <span className="sr-only sm:not-sr-only">Convidar</span>
            </Botao>
          </div>
          <p className="text-xs text-texto-tenue">
            Se já tiver conta, entra já no quadro. Se não, é criado um convite
            válido durante 7 dias.
          </p>
        </form>

        {ligacaoNova && <LigacaoConvite ligacao={ligacaoNova} />}

        <ul className="mt-5 space-y-1">
          {membros.map((membro) => {
            const euProprio = membro.user_id === utilizador.id;
            return (
              <li
                key={membro.user_id}
                className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
              >
                <Avatar perfil={membro.perfil} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto">
                    {membro.perfil.nome}
                    {euProprio && (
                      <span className="ml-1.5 text-xs font-normal text-texto-tenue">
                        (tu)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-texto-tenue">
                    {DESCRICOES_PAPEL[membro.papel]}
                  </p>
                </div>

                <Menu>
                  <AbrirMenu asChild>
                    <Botao
                      variante="secundario"
                      tamanho="pequeno"
                      aria-label={`Papel de ${membro.perfil.nome}: ${NOMES_PAPEL[membro.papel]}`}
                    >
                      {NOMES_PAPEL[membro.papel]}
                    </Botao>
                  </AbrirMenu>
                  <ConteudoMenu>
                    <RotuloMenu>Papel no quadro</RotuloMenu>
                    {(Object.keys(NOMES_PAPEL) as PapelQuadro[]).map((chave) => (
                      <ItemMenu
                        key={chave}
                        onSelect={() => mudarPapel(membro, chave)}
                      >
                        <span className="flex flex-col">
                          <span>{NOMES_PAPEL[chave]}</span>
                          <span className="text-xs text-texto-tenue">
                            {DESCRICOES_PAPEL[chave]}
                          </span>
                        </span>
                      </ItemMenu>
                    ))}
                    <SeparadorMenu />
                    <ItemMenu perigoso onSelect={() => remover(membro)}>
                      <X /> {euProprio ? "Sair do quadro" : "Remover do quadro"}
                    </ItemMenu>
                  </ConteudoMenu>
                </Menu>
              </li>
            );
          })}
        </ul>

        {pendentes.length > 0 && (
          <div className="mt-5 border-t border-borda pt-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
              Convites por aceitar
            </h3>
            <ul className="space-y-1">
              {pendentes.map((convite) => (
                <li
                  key={convite.id}
                  className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-superficie-2 text-texto-tenue">
                    <Mail className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-texto">
                      {convite.email}
                    </p>
                    <p className="text-xs text-texto-tenue">
                      Expira a{" "}
                      {new Date(convite.expira_em).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                  <Emblema>{NOMES_PAPEL[convite.papel]}</Emblema>
                  <Botao
                    variante="fantasma"
                    tamanho="iconePequeno"
                    aria-label={`Copiar o link do convite de ${convite.email}`}
                    onClick={() =>
                      copiar(
                        `${window.location.origin}/convite/${convite.token}`,
                      )
                    }
                  >
                    <Link2 />
                  </Botao>
                  <Botao
                    variante="fantasma"
                    tamanho="iconePequeno"
                    aria-label={`Revogar o convite de ${convite.email}`}
                    onClick={async () => {
                      try {
                        await mutar.revogarConvite(convite.id);
                        definirPendentes((atuais) =>
                          atuais.filter((c) => c.id !== convite.id),
                        );
                      } catch {
                        avisar.falhou("Não foi possível revogar o convite.");
                      }
                    }}
                  >
                    <X />
                  </Botao>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CaixaDialogo>
    </Dialogo>
  );
}

function SeletorPapel({
  valor,
  aoMudar,
}: {
  valor: PapelQuadro;
  aoMudar: (papel: PapelQuadro) => void;
}) {
  return (
    <select
      value={valor}
      onChange={(evento) => aoMudar(evento.target.value as PapelQuadro)}
      aria-label="Papel do convidado"
      className="h-9 rounded-md border border-borda-forte bg-superficie px-2 text-sm text-texto"
    >
      {(Object.keys(NOMES_PAPEL) as PapelQuadro[]).map((chave) => (
        <option key={chave} value={chave}>
          {NOMES_PAPEL[chave]}
        </option>
      ))}
    </select>
  );
}

/**
 * O convite não se envia sozinho.
 *
 * Não há servidor de email ligado, e inventar um "Enviado!" que não aconteceu
 * seria pior do que dizer a verdade: aqui está o link, envia-o tu.
 */
function LigacaoConvite({ ligacao }: { ligacao: string }) {
  return (
    <div className="mt-3 rounded-md border border-[var(--cor-principal-borda)] bg-[var(--cor-principal-tenue)] p-3">
      <p className="text-sm font-medium text-texto">Convite criado.</p>
      <p className="mt-0.5 mb-2 text-xs text-texto-suave">
        Envia este link à pessoa. É válido 7 dias e só pode ser usado uma vez.
      </p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-borda bg-superficie px-2 py-1.5 font-mono text-xs text-texto-suave">
          {ligacao}
        </code>
        <Botao variante="secundario" onClick={() => copiar(ligacao)}>
          <Copy /> Copiar
        </Botao>
      </div>
    </div>
  );
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar.feito("Link copiado.");
  } catch {
    avisar.falhou(
      "O browser não deixou copiar.",
      "Seleciona o link à mão e copia com Ctrl+C.",
    );
  }
}
