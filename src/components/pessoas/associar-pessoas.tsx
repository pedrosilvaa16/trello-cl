"use client";

import { Check, Link2, Mail, MessageSquare, Paperclip, Undo2 } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Emblema } from "@/components/ui/emblema";
import * as mutar from "@/lib/quadro/mutacoes";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Database, Perfil } from "@/lib/supabase/tipos";

type Pessoa = Database["public"]["Views"]["pessoas_trello_resumo"]["Row"];

export function AssociarPessoas({
  pessoas: iniciais,
  perfis,
  utilizador,
}: {
  pessoas: Pessoa[];
  perfis: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  utilizador: Perfil;
}) {
  const [pessoas, definirPessoas] = React.useState(iniciais);

  const porLigar = pessoas.filter((p) => !p.perfil_id);
  const ligadas = pessoas.filter((p) => p.perfil_id);

  function substituir(atualizada: Pessoa) {
    definirPessoas((atuais) =>
      atuais.map((p) => (p.id_trello === atualizada.id_trello ? atualizada : p)),
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-texto">
          Por ligar
          <Emblema>{porLigar.length}</Emblema>
        </h2>

        {porLigar.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda-forte px-4 py-6 text-center text-sm text-texto-suave">
            Está tudo associado. Nada da Trello ficou sem dono.
          </p>
        ) : (
          <ul className="space-y-2">
            {porLigar.map((pessoa) => (
              <LinhaPessoa
                key={pessoa.id_trello}
                pessoa={pessoa}
                perfis={perfis}
                utilizador={utilizador}
                aoMudar={substituir}
              />
            ))}
          </ul>
        )}
      </section>

      {ligadas.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-texto">
            Já ligadas
            <Emblema>{ligadas.length}</Emblema>
          </h2>
          <ul className="space-y-2">
            {ligadas.map((pessoa) => (
              <LinhaPessoa
                key={pessoa.id_trello}
                pessoa={pessoa}
                perfis={perfis}
                utilizador={utilizador}
                aoMudar={substituir}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LinhaPessoa({
  pessoa,
  perfis,
  utilizador,
  aoMudar,
}: {
  pessoa: Pessoa;
  perfis: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  utilizador: Perfil;
  aoMudar: (pessoa: Pessoa) => void;
}) {
  const [email, definirEmail] = React.useState("");
  const [ocupado, definirOcupado] = React.useState(false);
  const [semConta, definirSemConta] = React.useState<string | null>(null);
  const [ligacaoConvite, definirLigacaoConvite] = React.useState<string | null>(null);

  const ligada = perfis.find((p) => p.id === pessoa.perfil_id);
  const nada =
    pessoa.comentarios === 0 &&
    pessoa.anexos === 0 &&
    pessoa.cartoes === 0 &&
    pessoa.quadros === 0;

  async function associar(idPerfil: string) {
    definirOcupado(true);
    definirSemConta(null);
    try {
      const supabase = criarClienteNavegador();
      const { data, error } = await supabase.rpc("associar_pessoa_trello", {
        p_id_trello: pessoa.id_trello,
        p_perfil: idPerfil,
      });
      if (error) throw new Error(error.message);

      const feito = data as { comentarios: number; cartoes: number; quadros: number };
      aoMudar({ ...pessoa, perfil_id: idPerfil, associado_em: new Date().toISOString() });
      avisar.feito(
        `${pessoa.nome} ficou associada.`,
        [
          feito.comentarios && `${feito.comentarios} comentários`,
          feito.cartoes && `${feito.cartoes} cartões`,
          feito.quadros && `${feito.quadros} quadros`,
        ]
          .filter(Boolean)
          .join(" · ") || "Não havia nada por atribuir.",
      );
      definirEmail("");
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível associar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function procurarEAssociar(evento: React.FormEvent) {
    evento.preventDefault();
    const alvo = email.trim().toLowerCase();
    if (!alvo) return;

    definirOcupado(true);
    definirSemConta(null);
    definirLigacaoConvite(null);
    try {
      const perfil = await mutar.procurarPerfil(alvo);
      if (!perfil) {
        // Sem conta não há a que associar — mas o convite resolve isso aqui.
        definirSemConta(alvo);
        return;
      }
      await associar(perfil.id);
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível procurar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function convidar() {
    if (!semConta) return;
    definirOcupado(true);
    try {
      const { ligacao } = await mutar.criarConvite(semConta, null, "editor", utilizador.id);
      definirLigacaoConvite(ligacao);
      avisar.feito(
        "Convite criado.",
        "Envia o link. Depois de a pessoa entrar, volta aqui e associa-a.",
      );
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível convidar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function desassociar() {
    definirOcupado(true);
    try {
      const supabase = criarClienteNavegador();
      const { error } = await supabase.rpc("desassociar_pessoa_trello", {
        p_id_trello: pessoa.id_trello,
      });
      if (error) throw new Error(error.message);
      aoMudar({ ...pessoa, perfil_id: null, associado_em: null });
      avisar.nota(`${pessoa.nome} voltou a ficar por ligar.`);
    } catch (erro) {
      avisar.falhou(
        erro instanceof Error ? erro.message : "Não foi possível desassociar.",
      );
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <li className="rounded-lg border border-borda bg-superficie p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-texto">
            {pessoa.nome}
            <span className="font-mono text-xs font-normal text-texto-tenue">
              @{pessoa.username}
            </span>
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-tenue">
            {nada ? (
              <span>Não deixou nada atrás.</span>
            ) : (
              <>
                {pessoa.comentarios > 0 && (
                  <span className="inline-flex items-center gap-1" data-numerico>
                    <MessageSquare className="size-3.5" aria-hidden />
                    {pessoa.comentarios} comentários
                  </span>
                )}
                {pessoa.cartoes > 0 && (
                  <span data-numerico>{pessoa.cartoes} cartões por atribuir</span>
                )}
                {pessoa.quadros > 0 && (
                  <span data-numerico>{pessoa.quadros} quadros</span>
                )}
                {pessoa.anexos > 0 && (
                  <span className="inline-flex items-center gap-1" data-numerico>
                    <Paperclip className="size-3.5" aria-hidden />
                    {pessoa.anexos}
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {pessoa.perfil_id ? (
          <div className="flex items-center gap-2">
            {ligada ? (
              <span className="flex items-center gap-2 rounded-md bg-[var(--cor-sucesso-tenue)] px-2 py-1 text-sm text-sucesso">
                <Check className="size-4" aria-hidden />
                <Avatar perfil={ligada} tamanho="pequeno" />
                {ligada.nome}
              </span>
            ) : (
              <Emblema>Associada</Emblema>
            )}
            <Botao
              variante="fantasma"
              tamanho="pequeno"
              onClick={desassociar}
              ocupado={ocupado}
            >
              <Undo2 /> Desfazer
            </Botao>
          </div>
        ) : (
          <form onSubmit={procurarEAssociar} className="flex flex-wrap gap-2">
            {perfis.length > 0 && (
              <select
                defaultValue=""
                onChange={(evento) =>
                  evento.target.value && associar(evento.target.value)
                }
                aria-label={`Associar ${pessoa.nome} a uma conta`}
                disabled={ocupado}
                className="h-9 rounded-md border border-borda-forte bg-superficie px-2 text-sm text-texto"
              >
                <option value="">Escolher conta…</option>
                {perfis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            )}
            <Campo
              type="email"
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              placeholder="ou por email"
              aria-label={`Email de ${pessoa.nome}`}
              className="w-48"
            />
            <Botao type="submit" variante="secundario" ocupado={ocupado}>
              Associar
            </Botao>
          </form>
        )}
      </div>

      {semConta && !ligacaoConvite && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--cor-aviso)] bg-[var(--cor-aviso-tenue)] px-3 py-2 text-sm text-aviso">
          <Mail className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Ainda não há conta com <strong>{semConta}</strong>.
          </span>
          <Botao variante="secundario" tamanho="pequeno" onClick={convidar} ocupado={ocupado}>
            Criar convite
          </Botao>
        </div>
      )}

      {ligacaoConvite && (
        <div className="mt-3 rounded-md border border-[var(--cor-principal-borda)] bg-[var(--cor-principal-tenue)] p-3">
          <p className="mb-2 text-xs text-texto-suave">
            Envia este link. Assim que a pessoa criar a conta, volta aqui e
            associa-a — os comentários e cartões passam nessa altura.
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-borda bg-superficie px-2 py-1.5 font-mono text-xs text-texto-suave">
              {ligacaoConvite}
            </code>
            <Botao
              variante="secundario"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ligacaoConvite);
                  avisar.feito("Link copiado.");
                } catch {
                  avisar.falhou("O browser não deixou copiar.", "Copia à mão.");
                }
              }}
            >
              <Link2 /> Copiar
            </Botao>
          </div>
        </div>
      )}
    </li>
  );
}
