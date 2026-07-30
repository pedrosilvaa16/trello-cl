"use client";

import {
  CalendarDays,
  ChevronRight,
  FolderPlus,
  ListPlus,
  PenLine,
  Archive,
  UserRoundCheck,
  UserRoundPen,
} from "lucide-react";
import * as React from "react";

import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
} from "@/components/ui/menu";
import { corEtiqueta } from "@/lib/cores";
import type { EspacoTarefas, ListaTarefas } from "@/lib/supabase/tipos";
import type { Vista } from "@/lib/tarefas/vistas";
import { cn } from "@/lib/utils";

/**
 * A coluna da esquerda: por onde se escolhe o que ver.
 *
 * As três primeiras entradas são perguntas («o que tenho para fazer?», «o que
 * é meu?», «o que pedi?») e as de baixo são sítios. A ordem é essa de
 * propósito — quem abre isto de manhã quer a primeira, não quer escolher uma
 * lista.
 */
export function BarraLateral({
  vista,
  aoMudarVista,
  espacos,
  listas,
  contagens,
  aoCriarEspaco,
  aoCriarLista,
  aoRenomearEspaco,
  aoRenomearLista,
  aoArquivarEspaco,
  aoArquivarLista,
  className,
}: {
  vista: Vista;
  aoMudarVista: (vista: Vista) => void;
  espacos: EspacoTarefas[];
  listas: ListaTarefas[];
  /** Quantas tarefas por abrir há em cada vista e em cada lista. */
  contagens: {
    agenda: number;
    minhas: number;
    criadas: number;
    porLista: Map<string, number>;
  };
  aoCriarEspaco: (nome: string) => Promise<void>;
  aoCriarLista: (idEspaco: string, nome: string) => Promise<void>;
  aoRenomearEspaco: (id: string, nome: string) => Promise<void>;
  aoRenomearLista: (id: string, nome: string) => Promise<void>;
  aoArquivarEspaco: (id: string) => Promise<void>;
  aoArquivarLista: (id: string) => Promise<void>;
  className?: string;
}) {
  const [fechados, definirFechados] = React.useState<Set<string>>(new Set());
  const [aCriarEm, definirACriarEm] = React.useState<string | null>(null);
  const [novoEspaco, definirNovoEspaco] = React.useState(false);

  function alternar(id: string) {
    definirFechados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <nav
      aria-label="Vistas e listas de tarefas"
      className={cn("flex flex-col gap-4 overflow-y-auto p-3", className)}
    >
      <ul className="space-y-0.5">
        <ItemVista
          icone={CalendarDays}
          nome="Agenda"
          contagem={contagens.agenda}
          ativa={vista.tipo === "agenda"}
          aoEscolher={() => aoMudarVista({ tipo: "agenda" })}
        />
        <ItemVista
          icone={UserRoundCheck}
          nome="Atribuídas a mim"
          contagem={contagens.minhas}
          ativa={vista.tipo === "minhas"}
          aoEscolher={() => aoMudarVista({ tipo: "minhas" })}
        />
        <ItemVista
          icone={UserRoundPen}
          nome="Criadas por mim"
          contagem={contagens.criadas}
          ativa={vista.tipo === "criadas"}
          aoEscolher={() => aoMudarVista({ tipo: "criadas" })}
        />
      </ul>

      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between gap-1 px-2">
          <h2 className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">
            Espaços
          </h2>
          <Botao
            variante="fantasma"
            tamanho="iconePequeno"
            onClick={() => definirNovoEspaco(true)}
            aria-label="Criar espaço"
            title="Criar espaço"
          >
            <FolderPlus />
          </Botao>
        </div>

        {novoEspaco && (
          <CampoNovoNome
            etiqueta="Nome do espaço"
            aoGuardar={async (nome) => {
              await aoCriarEspaco(nome);
              definirNovoEspaco(false);
            }}
            aoCancelar={() => definirNovoEspaco(false)}
          />
        )}

        <ul className="space-y-0.5">
          {espacos.map((espaco) => {
            const fechado = fechados.has(espaco.id);
            const doEspaco = listas.filter((l) => l.espaco_id === espaco.id);

            return (
              <li key={espaco.id}>
                <div className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => alternar(espaco.id)}
                    aria-expanded={!fechado}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-texto",
                      "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 text-texto-tenue",
                        "transition-transform duration-[var(--duracao-rapida)] ease-[var(--curva)]",
                        !fechado && "rotate-90",
                      )}
                      aria-hidden
                    />
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: corEtiqueta(espaco.cor) }}
                      aria-hidden
                    />
                    <span className="truncate">{espaco.nome}</span>
                  </button>

                  <MenuDoItem
                    rotulo={`Opções de ${espaco.nome}`}
                    aoRenomear={(nome) => aoRenomearEspaco(espaco.id, nome)}
                    aoArquivar={() => aoArquivarEspaco(espaco.id)}
                    textoArquivar="Arquivar espaço"
                    extra={
                      <ItemMenu onSelect={() => definirACriarEm(espaco.id)}>
                        <ListPlus /> Nova lista
                      </ItemMenu>
                    }
                  />
                </div>

                {!fechado && (
                  <ul className="mt-0.5 space-y-0.5 pl-4">
                    {doEspaco.map((lista) => (
                      <li key={lista.id} className="group flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            aoMudarVista({ tipo: "lista", id: lista.id })
                          }
                          aria-current={
                            vista.tipo === "lista" && vista.id === lista.id
                              ? "page"
                              : undefined
                          }
                          className={cn(
                            "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                            "transition-colors duration-[var(--duracao-rapida)]",
                            vista.tipo === "lista" && vista.id === lista.id
                              ? "bg-superficie-3 font-medium text-texto"
                              : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                          )}
                        >
                          <span className="truncate">{lista.nome}</span>
                          <Contagem valor={contagens.porLista.get(lista.id) ?? 0} />
                        </button>

                        <MenuDoItem
                          rotulo={`Opções de ${lista.nome}`}
                          aoRenomear={(nome) => aoRenomearLista(lista.id, nome)}
                          aoArquivar={() => aoArquivarLista(lista.id)}
                          textoArquivar="Arquivar lista"
                        />
                      </li>
                    ))}

                    {aCriarEm === espaco.id && (
                      <li>
                        <CampoNovoNome
                          etiqueta="Nome da lista"
                          aoGuardar={async (nome) => {
                            await aoCriarLista(espaco.id, nome);
                            definirACriarEm(null);
                          }}
                          aoCancelar={() => definirACriarEm(null)}
                        />
                      </li>
                    )}

                    {doEspaco.length === 0 && aCriarEm !== espaco.id && (
                      <li>
                        <Botao
                          variante="fantasma"
                          tamanho="pequeno"
                          className="w-full justify-start"
                          onClick={() => definirACriarEm(espaco.id)}
                        >
                          <ListPlus /> Criar a primeira lista
                        </Botao>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function ItemVista({
  icone: Icone,
  nome,
  contagem,
  ativa,
  aoEscolher,
}: {
  icone: React.ComponentType<{ className?: string }>;
  nome: string;
  contagem: number;
  ativa: boolean;
  aoEscolher: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={aoEscolher}
        aria-current={ativa ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
          "transition-colors duration-[var(--duracao-rapida)]",
          ativa
            ? "bg-superficie-3 font-medium text-texto"
            : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
        )}
      >
        <Icone className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{nome}</span>
        <Contagem valor={contagem} />
      </button>
    </li>
  );
}

/** Zero não se escreve: uma coluna de zeros é ruído, e a ausência já diz. */
function Contagem({ valor }: { valor: number }) {
  if (valor === 0) return null;
  return (
    <span className="shrink-0 text-xs text-texto-tenue" data-numerico>
      {valor}
    </span>
  );
}

/** Renomear e arquivar, comuns a espaços e listas. */
function MenuDoItem({
  rotulo,
  aoRenomear,
  aoArquivar,
  textoArquivar,
  extra,
}: {
  rotulo: string;
  aoRenomear: (nome: string) => Promise<void>;
  aoArquivar: () => Promise<void>;
  textoArquivar: string;
  extra?: React.ReactNode;
}) {
  const [aRenomear, definirARenomear] = React.useState(false);

  if (aRenomear) {
    return (
      <CampoNovoNome
        etiqueta={rotulo}
        aoGuardar={async (nome) => {
          await aoRenomear(nome);
          definirARenomear(false);
        }}
        aoCancelar={() => definirARenomear(false)}
      />
    );
  }

  return (
    <Menu>
      <AbrirMenu asChild>
        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          aria-label={rotulo}
          /*
            Invisível até haver rato ou foco em cima, mas nunca `hidden`: com
            `display:none` o teclado não lhe chega, e a linha ficaria sem
            opções nenhumas para quem não usa rato.
          */
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <PenLine />
        </Botao>
      </AbrirMenu>
      <ConteudoMenu>
        {extra}
        <ItemMenu onSelect={() => definirARenomear(true)}>
          <PenLine /> Renomear
        </ItemMenu>
        <ItemMenu perigoso onSelect={() => void aoArquivar()}>
          <Archive /> {textoArquivar}
        </ItemMenu>
      </ConteudoMenu>
    </Menu>
  );
}

/** Campo de nome que se confirma com Enter e se desiste com Escape. */
function CampoNovoNome({
  etiqueta,
  valorInicial = "",
  aoGuardar,
  aoCancelar,
}: {
  etiqueta: string;
  valorInicial?: string;
  aoGuardar: (nome: string) => Promise<void>;
  aoCancelar: () => void;
}) {
  const [valor, definirValor] = React.useState(valorInicial);
  const [ocupado, definirOcupado] = React.useState(false);

  async function guardar() {
    const nome = valor.trim();
    if (!nome || ocupado) return;
    definirOcupado(true);
    try {
      await aoGuardar(nome);
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <form
      className="px-2 py-1"
      onSubmit={(evento) => {
        evento.preventDefault();
        void guardar();
      }}
    >
      <Campo
        autoFocus
        aria-label={etiqueta}
        placeholder={etiqueta}
        value={valor}
        maxLength={80}
        disabled={ocupado}
        onChange={(evento) => definirValor(evento.target.value)}
        onBlur={() => (valor.trim() ? void guardar() : aoCancelar())}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") {
            evento.preventDefault();
            aoCancelar();
          }
        }}
        className="h-8 text-[13px]"
      />
    </form>
  );
}
