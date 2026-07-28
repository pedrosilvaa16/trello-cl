"use client";

import { Briefcase, LogOut, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { sair } from "@/app/entrar/acoes";
import { Avatar } from "@/components/ui/avatar";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
  SeparadorMenu,
} from "@/components/ui/menu";
import type { Perfil } from "@/lib/supabase/tipos";

export function MenuUtilizador({
  perfil,
  gerePessoas = false,
  temTrabalhos = false,
}: {
  perfil: Perfil;
  /** super_admin ou admin: mostra o painel de pessoas. */
  gerePessoas?: boolean;
  /** Tem cartões soltos, logo tem "Os meus trabalhos" para onde ir. */
  temTrabalhos?: boolean;
}) {
  const [aSair, definirASair] = React.useState(false);

  return (
    <Menu>
      <AbrirMenu asChild>
        <button
          type="button"
          className="rounded-full"
          aria-label={`Conta de ${perfil.nome}`}
        >
          <Avatar perfil={perfil} />
        </button>
      </AbrirMenu>
      <ConteudoMenu>
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-texto">
            {perfil.nome}
          </p>
        </div>
        <SeparadorMenu />
        {temTrabalhos && (
          <ItemMenu asChild>
            <Link href="/os-meus-trabalhos">
              <Briefcase /> Os meus trabalhos
            </Link>
          </ItemMenu>
        )}
        {gerePessoas && (
          <ItemMenu asChild>
            <Link href="/pessoas">
              <Users /> Pessoas
            </Link>
          </ItemMenu>
        )}
        {(gerePessoas || temTrabalhos) && <SeparadorMenu />}
        <ItemMenu
          disabled={aSair}
          onSelect={() => {
            definirASair(true);
            void sair();
          }}
        >
          <LogOut /> {aSair ? "A sair…" : "Terminar sessão"}
        </ItemMenu>
      </ConteudoMenu>
    </Menu>
  );
}
