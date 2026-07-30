"use client";

import { Check, CircleDashed, Flag, UserPlus } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
  RotuloMenu,
  SeparadorMenu,
} from "@/components/ui/menu";
import { paraCampoLocal, deCampoLocal } from "@/lib/datas";
import type { EstadoTarefa, Perfil, PrioridadeTarefa } from "@/lib/supabase/tipos";
import {
  CORES_ESTADO,
  CORES_PRIORIDADE,
  ESTADOS,
  NOMES_ESTADO,
  NOMES_PRIORIDADE,
  PRIORIDADES,
} from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

/**
 * O ponto colorido do estado.
 *
 * Cheio quando está feito, anel vazado quando não está — a diferença lê-se sem
 * depender da cor, que é o mínimo para quem não distingue verde de vermelho.
 */
export function PontoEstado({
  estado,
  className,
}: {
  estado: EstadoTarefa;
  className?: string;
}) {
  const cor = CORES_ESTADO[estado];
  return (
    <span
      className={cn("inline-block size-3 shrink-0 rounded-full", className)}
      style={
        estado === "concluida"
          ? { backgroundColor: cor }
          : { border: `2px solid ${cor}` }
      }
      aria-hidden
    />
  );
}

/** Seletor de estado. O rótulo diz o estado atual, nunca "Estado". */
export function SeletorEstado({
  estado,
  aoMudar,
  compacto = false,
}: {
  estado: EstadoTarefa;
  aoMudar: (estado: EstadoTarefa) => void;
  compacto?: boolean;
}) {
  return (
    <Menu>
      <AbrirMenu asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-borda-forte bg-superficie font-medium text-texto",
            "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
            compacto ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-[13px]",
          )}
        >
          <PontoEstado estado={estado} />
          {NOMES_ESTADO[estado]}
        </button>
      </AbrirMenu>
      <ConteudoMenu alinhamento="start">
        <RotuloMenu>Estado</RotuloMenu>
        {ESTADOS.map((opcao) => (
          <ItemMenu key={opcao} onSelect={() => aoMudar(opcao)}>
            <PontoEstado estado={opcao} />
            {NOMES_ESTADO[opcao]}
            {opcao === estado && <Check className="ml-auto" />}
          </ItemMenu>
        ))}
      </ConteudoMenu>
    </Menu>
  );
}

/** A bandeirinha da prioridade. Sem prioridade não desenha nada na linha. */
export function BandeiraPrioridade({
  prioridade,
  className,
}: {
  prioridade: PrioridadeTarefa;
  className?: string;
}) {
  return (
    <Flag
      className={cn("size-3.5 shrink-0", className)}
      style={{ color: CORES_PRIORIDADE[prioridade] }}
      aria-hidden
    />
  );
}

export function SeletorPrioridade({
  prioridade,
  aoMudar,
}: {
  prioridade: PrioridadeTarefa | null;
  aoMudar: (prioridade: PrioridadeTarefa | null) => void;
}) {
  return (
    <Menu>
      <AbrirMenu asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-borda-forte bg-superficie px-2.5 text-[13px] font-medium",
            "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
            prioridade ? "text-texto" : "text-texto-suave",
          )}
        >
          {prioridade ? (
            <BandeiraPrioridade prioridade={prioridade} />
          ) : (
            <Flag className="size-3.5 text-texto-tenue" aria-hidden />
          )}
          {prioridade ? NOMES_PRIORIDADE[prioridade] : "Prioridade"}
        </button>
      </AbrirMenu>
      <ConteudoMenu alinhamento="start">
        <RotuloMenu>Prioridade</RotuloMenu>
        {PRIORIDADES.map((opcao) => (
          <ItemMenu key={opcao} onSelect={() => aoMudar(opcao)}>
            <BandeiraPrioridade prioridade={opcao} />
            {NOMES_PRIORIDADE[opcao]}
            {opcao === prioridade && <Check className="ml-auto" />}
          </ItemMenu>
        ))}
        {prioridade && (
          <>
            <SeparadorMenu />
            <ItemMenu onSelect={() => aoMudar(null)}>
              <CircleDashed />
              Sem prioridade
            </ItemMenu>
          </>
        )}
      </ConteudoMenu>
    </Menu>
  );
}

/**
 * Quem é responsável pela tarefa.
 *
 * Só aparece aqui quem é da casa e tem a conta ativa — a mesma condição que a
 * política de INSERT de `tarefa_responsaveis` impõe. Se a lista oferecesse mais
 * do que isso, a interface prometia um nome que o servidor recusa.
 */
export function SeletorResponsaveis({
  equipa,
  responsaveis,
  aoAlternar,
}: {
  equipa: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  responsaveis: string[];
  aoAlternar: (id: string, ligar: boolean) => void;
}) {
  const escolhidos = equipa.filter((p) => responsaveis.includes(p.id));

  return (
    <Menu>
      <AbrirMenu asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-borda-forte bg-superficie px-2 text-[13px] font-medium text-texto-suave",
            "transition-colors duration-[var(--duracao-rapida)] hover:bg-superficie-2",
          )}
          aria-label={
            escolhidos.length
              ? `Responsáveis: ${escolhidos.map((p) => p.nome).join(", ")}`
              : "Atribuir a alguém"
          }
        >
          {escolhidos.length === 0 ? (
            <>
              <UserPlus className="size-4" aria-hidden />
              Atribuir
            </>
          ) : (
            <span className="flex items-center -space-x-1.5">
              {escolhidos.slice(0, 3).map((perfil) => (
                <Avatar
                  key={perfil.id}
                  perfil={perfil}
                  tamanho="pequeno"
                  className="ring-2 ring-[var(--cor-superficie)]"
                />
              ))}
              {escolhidos.length > 3 && (
                <span className="pl-2.5 text-xs">+{escolhidos.length - 3}</span>
              )}
            </span>
          )}
        </button>
      </AbrirMenu>
      <ConteudoMenu alinhamento="start">
        <RotuloMenu>Responsáveis</RotuloMenu>
        {equipa.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-texto-suave">
            Só a equipa da casa pode ficar responsável por uma tarefa.
          </p>
        )}
        {equipa.map((perfil) => {
          const tem = responsaveis.includes(perfil.id);
          return (
            <ItemMenu
              key={perfil.id}
              // `preventDefault` mantém o menu aberto: atribuir a três pessoas
              // não deve obrigar a reabrir o menu três vezes.
              onSelect={(evento) => {
                evento.preventDefault();
                aoAlternar(perfil.id, !tem);
              }}
            >
              <Avatar perfil={perfil} tamanho="pequeno" />
              <span className="truncate">{perfil.nome}</span>
              {tem && <Check className="ml-auto" />}
            </ItemMenu>
          );
        })}
      </ConteudoMenu>
    </Menu>
  );
}

/**
 * Campo de data.
 *
 * `datetime-local` nativo, e não um calendário desenhado à mão: numa
 * ferramenta usada o dia inteiro, escrever «30/07 14:00» pelo teclado é mais
 * rápido do que qualquer grelha de dias — e o nativo já traz o calendário para
 * quem preferir o rato, a navegação por teclado e a leitura por voz de graça.
 */
export function CampoData({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string | null;
  aoMudar: (valor: string | null) => void;
}) {
  const id = React.useId();

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-texto-tenue"
      >
        {rotulo}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={paraCampoLocal(valor)}
        onChange={(evento) => aoMudar(deCampoLocal(evento.target.value))}
        className={cn(
          "h-8 w-full rounded-md border border-borda-forte bg-superficie px-2 text-[13px] text-texto",
          "transition-colors duration-[var(--duracao-rapida)] hover:border-[var(--cor-texto-tenue)]",
        )}
      />
    </div>
  );
}
