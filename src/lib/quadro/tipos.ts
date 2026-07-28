import type {
  Anexo,
  Cartao,
  Comentario,
  Etiqueta,
  Lista,
  PapelQuadro,
  Perfil,
  Quadro,
} from "@/lib/supabase/tipos";

/**
 * Cartão com as ligações já resolvidas em arrays de ids e as contagens que o
 * cartão mostra de relance. Tudo isto vem na mesma consulta que os cartões.
 */
export type CartaoCompleto = Cartao & {
  etiquetas: string[];
  membros: string[];
  nComentarios: number;
  nAnexos: number;
};

export type MembroComPerfil = {
  user_id: string;
  papel: PapelQuadro;
  perfil: Perfil;
};

/** Tudo o que o quadro precisa para se desenhar. Carregado de uma vez. */
export type DadosQuadro = {
  /** `imagem` é o URL já assinado da imagem de destaque, válido uma hora. */
  quadro: Quadro & { imagem: string | null };
  listas: Lista[];
  cartoes: CartaoCompleto[];
  etiquetas: Etiqueta[];
  membros: MembroComPerfil[];
  papel: PapelQuadro;
};

export type ComentarioComAutor = Comentario & {
  autor: Pick<Perfil, "id" | "nome" | "avatar_url"> | null;
};

export type AnexoComAutor = Anexo & {
  autor: Pick<Perfil, "id" | "nome"> | null;
};

/** `leitor` só lê — é a única distinção que a interface precisa de fazer. */
export function podeEditar(papel: PapelQuadro) {
  return papel === "admin" || papel === "editor";
}

export function eAdmin(papel: PapelQuadro) {
  return papel === "admin";
}

export const NOMES_PAPEL: Record<PapelQuadro, string> = {
  admin: "Admin",
  editor: "Editor",
  leitor: "Leitor",
};

export const DESCRICOES_PAPEL: Record<PapelQuadro, string> = {
  admin: "Gere membros, arquiva e apaga o quadro.",
  editor: "Cria e altera listas, cartões e comentários.",
  leitor: "Vê tudo, não altera nada.",
};
