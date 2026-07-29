import type {
  Anexo,
  Cartao,
  Comentario,
  Etiqueta,
  Lista,
  PapelGlobal,
  PapelQuadro,
  Perfil,
  Quadro,
  TipoLista,
} from "@/lib/supabase/tipos";

/**
 * Cartão com as ligações já resolvidas em arrays de ids e as contagens que o
 * cartão mostra de relance. Tudo isto vem na mesma consulta que os cartões.
 */
export type CartaoCompleto = Omit<
  Cartao,
  "referencia_porque" | "referencia_url"
> & {
  etiquetas: string[];
  membros: string[];
  nComentarios: number;
  nAnexos: number;
  /*
    Opcionais porque só existem no payload de quem gere o quadro.
    `carregarQuadro` corta-os para toda a gente — não é uma otimização, é a
    regra do separador «Estratégia»: quem não gere não deve sequer saber que
    ele existe, e um campo `referencia_porque` no cartão contava a história.
  */
  referencia_porque?: string | null;
  referencia_url?: string | null;
};

/** Como `Lista`, mas com o `tipo` opcional — só vai a quem gere o quadro. */
export type ListaNoQuadro = Omit<Lista, "tipo"> & { tipo?: TipoLista };

export type MembroComPerfil = {
  user_id: string;
  papel: PapelQuadro;
  perfil: Perfil;
};

/** Tudo o que o quadro precisa para se desenhar. Carregado de uma vez. */
export type DadosQuadro = {
  /** `imagem` é o URL já assinado da imagem de destaque, válido uma hora. */
  quadro: Quadro & { imagem: string | null };
  listas: ListaNoQuadro[];
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

/*
  Estas três respondem à mesma pergunta que as funções homónimas em SQL, e são
  para desenhar a interface — nunca para decidir se uma escrita acontece. Quem
  decide isso é o servidor: esconder um botão não é uma permissão.
*/

/** `gestor` e `editor` escrevem; `comentador` e `leitor` não. */
export function podeEditar(papel: PapelQuadro) {
  return papel === "gestor" || papel === "editor";
}

/** O comentador é o caso próprio: lê tudo e comenta, sem poder editar nada. */
export function podeComentar(papel: PapelQuadro) {
  return podeEditar(papel) || papel === "comentador";
}

export function eGestor(papel: PapelQuadro) {
  return papel === "gestor";
}

export const NOMES_PAPEL: Record<PapelQuadro, string> = {
  gestor: "Gestor",
  editor: "Editor",
  comentador: "Comentador",
  leitor: "Leitor",
};

export const DESCRICOES_PAPEL: Record<PapelQuadro, string> = {
  gestor: "Gere membros, arquiva e apaga o quadro.",
  editor: "Cria e altera listas, cartões e comentários.",
  comentador: "Vê tudo e comenta. Não cria nem altera cartões.",
  leitor: "Vê tudo, não altera nada.",
};

export const NOMES_PAPEL_GLOBAL: Record<PapelGlobal, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  externo: "Externo",
};

export const DESCRICOES_PAPEL_GLOBAL: Record<PapelGlobal, string> = {
  super_admin: "Gere pessoas e papéis. Acede a todos os quadros.",
  admin: "Cria quadros e convida pessoas para os que gere.",
  externo: "Só vê aquilo a que lhe deram acesso.",
};
