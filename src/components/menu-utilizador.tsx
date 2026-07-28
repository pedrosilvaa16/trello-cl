"use client";

import { LogOut, Users } from "lucide-react";
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
  eAdmin = false,
}: {
  perfil: Perfil;
  eAdmin?: boolean;
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
        {eAdmin && (
          <>
            <ItemMenu asChild>
              <Link href="/pessoas">
                <Users /> Pessoas da Trello
              </Link>
            </ItemMenu>
            <SeparadorMenu />
          </>
        )}
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
