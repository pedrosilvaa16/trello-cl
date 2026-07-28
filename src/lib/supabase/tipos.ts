/**
 * Tipos da base de dados.
 *
 * Escritos à mão para o repositório não depender de uma ligação ao Supabase
 * para compilar. Quando o esquema mudar, `npm run tipos` regenera-os a partir
 * do projeto real — e o resultado deve ser igual a isto.
 */

/**
 * Eixo B — o que a pessoa pode fazer num quadro ou cartão concreto.
 * A ordem é do mais forte para o mais fraco, como o enum na base de dados.
 */
export type PapelQuadro = "gestor" | "editor" | "comentador" | "leitor";

/** Eixo A — o que a pessoa pode fazer no sistema, fora dos quadros. */
export type PapelGlobal = "super_admin" | "admin" | "externo";

/*
  A paleta vive em `lib/cores.ts`, que é quem a declara uma vez para as
  etiquetas, os quadros e agora as capas. O CHECK na base de dados tem a mesma
  lista — é o preço de a paleta ser um nome e não um hexadecimal, e é barato
  ao pé de ter de migrar dados para mudar uma cor.
*/
import type { CorEtiqueta } from "../cores";

type Timestamptz = string;

/** `faixa` = tira no topo; `completa` = capa no cartão todo, título por cima. */
export type TamanhoCapa = "faixa" | "completa";

/** O estado completo da capa de um cartão. Uma cor ou um anexo, nunca os dois. */
export type Capa = {
  capa_cor: CorEtiqueta | null;
  capa_anexo_id: string | null;
  capa_tamanho: TamanhoCapa;
  capa_texto: "claro" | "escuro";
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nome: string;
          avatar_url: string | null;
          papel_global: PapelGlobal;
          /** Falso = não entra e não conta como membro. Nunca se apaga a linha. */
          ativo: boolean;
          ultimo_acesso: Timestamptz | null;
          criado_em: Timestamptz;
        };
        Insert: {
          id: string;
          nome: string;
          avatar_url?: string | null;
          criado_em?: Timestamptz;
        };
        /*
          Só estas duas. `papel_global` e `ativo` mudam por
          `definir_papel_global` e `definir_estado_conta`, e o GRANT de coluna
          na base de dados recusa qualquer outro caminho — pôr aqui os campos
          seria prometer uma escrita que o servidor não deixa acontecer.
        */
        Update: {
          nome?: string;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      boards: {
        Row: {
          id: string;
          nome: string;
          descricao: string | null;
          cor: string;
          /** Chaves no R2 da imagem de destaque. Nulas quando o quadro não tem. */
          imagem_fundo: string | null;
          imagem_miniatura: string | null;
          /** 'claro' ou 'escuro' — o que a imagem é, para escolher o véu. */
          brilho_fundo: "claro" | "escuro" | null;
          arquivado: boolean;
          criado_por: string | null;
          criado_em: Timestamptz;
        };
        Insert: {
          id?: string;
          nome: string;
          descricao?: string | null;
          cor?: string;
          arquivado?: boolean;
          criado_por?: string | null;
          criado_em?: Timestamptz;
        };
        Update: {
          nome?: string;
          descricao?: string | null;
          cor?: string;
          arquivado?: boolean;
        };
        Relationships: [];
      };
      board_members: {
        Row: {
          board_id: string;
          user_id: string;
          papel: PapelQuadro;
          criado_em: Timestamptz;
        };
        Insert: {
          board_id: string;
          user_id: string;
          papel?: PapelQuadro;
          criado_em?: Timestamptz;
        };
        Update: {
          papel?: PapelQuadro;
        };
        Relationships: [];
      };
      lists: {
        Row: {
          id: string;
          board_id: string;
          nome: string;
          posicao: number;
          arquivada: boolean;
          criado_em: Timestamptz;
        };
        Insert: {
          id?: string;
          board_id: string;
          nome: string;
          posicao: number;
          arquivada?: boolean;
          criado_em?: Timestamptz;
        };
        Update: {
          nome?: string;
          posicao?: number;
          arquivada?: boolean;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          list_id: string;
          /** Cópia de lists.board_id, mantida por trigger. É o que o RLS lê. */
          board_id: string;
          titulo: string;
          descricao: string | null;
          posicao: number;
          data_limite: Timestamptz | null;
          concluido: boolean;
          arquivado: boolean;
          /* A capa: uma cor da paleta OU um anexo de imagem do cartão, nunca
             as duas. `capa_texto` só conta quando o tamanho é 'completa'. */
          capa_cor: CorEtiqueta | null;
          capa_anexo_id: string | null;
          capa_tamanho: TamanhoCapa;
          capa_texto: "claro" | "escuro";
          criado_por: string | null;
          criado_em: Timestamptz;
          atualizado_em: Timestamptz;
        };
        Insert: {
          id?: string;
          list_id: string;
          titulo: string;
          descricao?: string | null;
          posicao: number;
          data_limite?: Timestamptz | null;
          concluido?: boolean;
          arquivado?: boolean;
          criado_por?: string | null;
        };
        /*
          As colunas `capa_*` não estão aqui de propósito, e não é
          esquecimento: o GRANT de coluna na base de dados recusa que sejam
          escritas por um UPDATE normal. Só `definir_capa_cartao` lhes mexe.
          Pô-las aqui era prometer uma escrita que o servidor não deixa
          acontecer.
        */
        Update: {
          list_id?: string;
          titulo?: string;
          descricao?: string | null;
          posicao?: number;
          data_limite?: Timestamptz | null;
          concluido?: boolean;
          arquivado?: boolean;
        };
        Relationships: [];
      };
      labels: {
        Row: {
          id: string;
          board_id: string;
          nome: string;
          cor: string;
          criado_em: Timestamptz;
        };
        Insert: {
          id?: string;
          board_id: string;
          nome?: string;
          cor: string;
          criado_em?: Timestamptz;
        };
        Update: {
          nome?: string;
          cor?: string;
        };
        Relationships: [];
      };
      card_labels: {
        Row: { card_id: string; label_id: string };
        Insert: { card_id: string; label_id: string };
        Update: never;
        Relationships: [];
      };
      card_members: {
        Row: { card_id: string; user_id: string };
        Insert: { card_id: string; user_id: string };
        Update: never;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          card_id: string;
          autor_id: string | null;
          /** Nome de quem escreveu, quando não há perfil (migração da Trello). */
          autor_externo: string | null;
          corpo: string;
          criado_em: Timestamptz;
          editado_em: Timestamptz | null;
        };
        Insert: {
          id?: string;
          card_id: string;
          autor_id: string;
          corpo: string;
          criado_em?: Timestamptz;
        };
        Update: {
          corpo?: string;
          editado_em?: Timestamptz | null;
        };
        Relationships: [];
      };
      /*
        Um anexo é uma de duas coisas: ficheiro no bucket (caminho_storage +
        tamanho_bytes) ou ligação para fora (url). Nunca as duas — há um CHECK
        na base de dados a impor isso.
      */
      attachments: {
        Row: {
          id: string;
          card_id: string;
          nome_ficheiro: string;
          caminho_storage: string | null;
          tamanho_bytes: number | null;
          url: string | null;
          tipo_mime: string;
          carregado_por: string | null;
          carregado_por_externo: string | null;
          criado_em: Timestamptz;
        };
        Insert: {
          id?: string;
          card_id: string;
          nome_ficheiro: string;
          caminho_storage?: string | null;
          tamanho_bytes?: number | null;
          url?: string | null;
          tipo_mime: string;
          carregado_por: string;
          carregado_por_externo?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      convites: {
        Row: {
          id: string;
          email: string;
          board_id: string | null;
          papel: PapelQuadro;
          papel_global: PapelGlobal;
          token: string;
          expira_em: Timestamptz;
          usado_em: Timestamptz | null;
          /** Quando o email saiu pela última vez. Nulo = nunca foi enviado. */
          enviado_em: Timestamptz | null;
          reenvios: number;
          criado_por: string | null;
          criado_em: Timestamptz;
        };
        Insert: {
          id?: string;
          email: string;
          board_id?: string | null;
          papel?: PapelQuadro;
          token: string;
          expira_em?: Timestamptz;
          criado_por: string;
        };
        Update: never;
        Relationships: [];
      };
      dominios_permitidos: {
        Row: { dominio: string; criado_em: Timestamptz };
        Insert: { dominio: string };
        Update: never;
        Relationships: [];
      };
      /*
        Acesso a um cartão sem acesso ao quadro à volta — o caso do freelancer.
        Vale enquanto `expira_em` for nulo ou estiver no futuro; passar a data
        chega para o acesso deixar de funcionar, sem ninguém revogar nada.
      */
      card_access: {
        Row: {
          id: string;
          card_id: string;
          user_id: string;
          papel: PapelQuadro;
          concedido_por: string | null;
          expira_em: Timestamptz | null;
          criado_em: Timestamptz;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Escrito só pelas funções de gestão. Do lado do cliente, só se lê. */
      acessos_log: {
        Row: {
          id: number;
          ator_id: string | null;
          alvo_id: string | null;
          accao: string;
          detalhe: Record<string, unknown> | null;
          criado_em: Timestamptz;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      convite_acessos: {
        Row: {
          id: string;
          convite_id: string;
          board_id: string | null;
          card_id: string | null;
          papel: PapelQuadro;
          expira_em: Timestamptz | null;
          criado_em: Timestamptz;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      /** Elenco da importação da Trello, com o que cada pessoa deixou atrás. */
      pessoas_trello_resumo: {
        Row: {
          id_trello: string;
          username: string;
          nome: string;
          perfil_id: string | null;
          associado_em: Timestamptz | null;
          comentarios: number;
          anexos: number;
          cartoes: number;
          quadros: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      criar_quadro: {
        Args: { p_nome: string; p_descricao?: string | null; p_cor?: string };
        Returns: Database["public"]["Tables"]["boards"]["Row"];
      };
      mover_cartao: {
        Args: { p_cartao: string; p_lista: string; p_posicao: number };
        Returns: number;
      };
      mover_lista: {
        Args: { p_lista: string; p_posicao: number };
        Returns: number;
      };
      posicao_fim_da_lista: {
        Args: { p_lista: string };
        Returns: number;
      };
      posicao_fim_do_quadro: {
        Args: { p_quadro: string };
        Returns: number;
      };
      reequilibrar_lista: {
        Args: { p_lista: string };
        Returns: undefined;
      };
      perfil_por_email: {
        Args: { p_email: string };
        Returns: Database["public"]["Tables"]["profiles"]["Row"] | null;
      };
      quadro_do_cartao: {
        Args: { cartao: string };
        Returns: string | null;
      };
      pode_editar_quadro: {
        Args: { board_id: string };
        Returns: boolean;
      };
      pode_gerir_quadro: {
        Args: { board_id: string };
        Returns: boolean;
      };
      pode_aceder_cartao: {
        Args: { p_cartao: string };
        Returns: boolean;
      };
      pode_editar_cartao: {
        Args: { p_cartao: string };
        Returns: boolean;
      };
      pode_comentar_cartao: {
        Args: { p_cartao: string };
        Returns: boolean;
      };
      papel_global_atual: {
        Args: Record<string, never>;
        Returns: PapelGlobal | null;
      };
      e_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      e_admin_algures: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      super_admins_activos: {
        Args: Record<string, never>;
        Returns: number;
      };
      registar_acesso: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      tenho_trabalhos_soltos: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      listar_pessoas: {
        Args: Record<string, never>;
        Returns: PessoaNaLista[];
      };
      quadros_que_giro: {
        Args: Record<string, never>;
        Returns: QuadroGerido[];
      };
      detalhe_pessoa: {
        Args: { p_alvo: string };
        Returns: DetalhePessoa;
      };
      os_meus_trabalhos: {
        Args: Record<string, never>;
        Returns: TrabalhoSolto[];
      };
      definir_papel_global: {
        Args: { p_alvo: string; p_papel: PapelGlobal };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      definir_estado_conta: {
        Args: { p_alvo: string; p_ativo: boolean };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      preparar_eliminacao_conta: {
        Args: { p_alvo: string };
        Returns: ResumoEliminacao;
      };
      definir_imagem_quadro: {
        Args: {
          p_quadro: string;
          p_fundo?: string | null;
          p_miniatura?: string | null;
          p_brilho?: "claro" | "escuro" | null;
        };
        /** As `_anterior` são as chaves que lá estavam, para o R2 ser limpo. */
        Returns: {
          fundo_anterior: string | null;
          miniatura_anterior: string | null;
          imagem_fundo: string | null;
          imagem_miniatura: string | null;
          brilho_fundo: "claro" | "escuro" | null;
        };
      };
      definir_capa_cartao: {
        Args: {
          p_cartao: string;
          p_cor?: string | null;
          p_anexo?: string | null;
          p_tamanho?: TamanhoCapa;
          p_texto?: "claro" | "escuro";
        };
        Returns: Capa;
      };
      definir_membro_quadro: {
        Args: { p_quadro: string; p_utilizador: string; p_papel: PapelQuadro };
        Returns: Database["public"]["Tables"]["board_members"]["Row"];
      };
      remover_membro_quadro: {
        Args: { p_quadro: string; p_utilizador: string };
        Returns: undefined;
      };
      conceder_acesso_cartao: {
        Args: {
          p_cartao: string;
          p_utilizador: string;
          p_papel?: PapelQuadro;
          p_expira_em?: Timestamptz | null;
        };
        Returns: Database["public"]["Tables"]["card_access"]["Row"];
      };
      revogar_acesso_cartao: {
        Args: { p_cartao: string; p_utilizador: string };
        Returns: undefined;
      };
      revogar_todos_os_acessos: {
        Args: { p_alvo: string };
        Returns: { quadros: number; cartoes: number };
      };
      listar_convites: {
        Args: Record<string, never>;
        Returns: ConviteNaLista[];
      };
      renovar_convite: {
        Args: { p_convite: string; p_token: string };
        Returns: Database["public"]["Tables"]["convites"]["Row"];
      };
      marcar_convite_enviado: {
        Args: { p_convite: string };
        Returns: undefined;
      };
      revogar_convite: {
        Args: { p_convite: string };
        Returns: undefined;
      };
      pode_ver_convite: {
        Args: { p_convite: string };
        Returns: boolean;
      };
      criar_convite: {
        Args: {
          p_email: string;
          p_token: string;
          p_papel_global?: PapelGlobal;
          p_acessos?: AcessoDoConvite[];
        };
        Returns: Database["public"]["Tables"]["convites"]["Row"];
      };
      papel_no_quadro: {
        Args: { board_id: string };
        Returns: PapelQuadro | null;
      };
      convite_por_token: {
        Args: { p_token: string };
        Returns: {
          id: string;
          email: string;
          board_id: string | null;
          nome_quadro: string | null;
          papel: PapelQuadro;
          papel_global: PapelGlobal;
          n_acessos: number;
          expira_em: Timestamptz;
          usado_em: Timestamptz | null;
          valido: boolean;
        }[];
      };
      associar_pessoa_trello: {
        Args: { p_id_trello: string; p_perfil: string };
        Returns: {
          comentarios: number;
          anexos: number;
          quadros: number;
          cartoes: number;
        };
      };
      desassociar_pessoa_trello: {
        Args: { p_id_trello: string };
        Returns: { comentarios: number; cartoes: number };
      };
      resgatar_convite: {
        Args: { p_token: string; p_utilizador: string };
        Returns: Database["public"]["Tables"]["convites"]["Row"];
      };
    };
    Enums: {
      papel_quadro: PapelQuadro;
      papel_global: PapelGlobal;
    };
    CompositeTypes: Record<never, never>;
  };
};

/* ------------------------------------------------ o que as funções devolvem */

/** Uma linha do painel /pessoas. O email vem de auth.users, via SECURITY DEFINER. */
export type PessoaNaLista = {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  papel_global: PapelGlobal;
  ativo: boolean;
  ultimo_acesso: Timestamptz | null;
  criado_em: Timestamptz;
  /** Quantos quadros e quantos cartões soltos (válidos) esta pessoa alcança. */
  quadros: number;
  cartoes: number;
};

/** O que a conta deixou atrás, contado antes de ela ser eliminada. */
export type ResumoEliminacao = {
  nome: string;
  email: string | null;
  /** Comentários e anexos que ficam, assinados com o nome em vez do perfil. */
  comentarios: number;
  anexos: number;
  /** Acessos que desaparecem com a conta. */
  quadros: number;
  cartoes: number;
};

/**
 * Um quadro que quem está a ver pode gerir — e portanto dar a outra pessoa,
 * num convite ou no detalhe dela. Nunca inclui quadros arquivados.
 */
export type QuadroGerido = {
  id: string;
  nome: string;
};

export type QuadroDaPessoa = {
  board_id: string;
  nome: string;
  papel: PapelQuadro;
  arquivado: boolean;
  desde: Timestamptz;
  /** Se quem está a ver tem poder para mexer neste acesso. */
  posso_gerir: boolean;
};

export type CartaoDaPessoa = {
  card_id: string;
  titulo: string;
  board_id: string;
  quadro: string;
  papel: PapelQuadro;
  expira_em: Timestamptz | null;
  expirado: boolean;
  concedido_em: Timestamptz;
  concedido_por: string | null;
  posso_gerir: boolean;
};

export type DetalhePessoa = {
  pessoa: {
    id: string;
    nome: string;
    email: string;
    avatar_url: string | null;
    papel_global: PapelGlobal;
    ativo: boolean;
    ultimo_acesso: Timestamptz | null;
    criado_em: Timestamptz;
  };
  quadros: QuadroDaPessoa[];
  cartoes: CartaoDaPessoa[];
};

/** Um cartão em "Os meus trabalhos", com o nome do cliente e não o quadro. */
export type TrabalhoSolto = {
  card_id: string;
  titulo: string;
  descricao: string | null;
  data_limite: Timestamptz | null;
  concluido: boolean;
  arquivado: boolean;
  papel: PapelQuadro;
  expira_em: Timestamptz | null;
  board_id: string;
  quadro: string;
  lista: string;
};

/** O estado de um convite, calculado no servidor — "expirado" depende do relógio. */
export type EstadoConvite = "pendente" | "por-enviar" | "expirado" | "usado";

/** Uma linha do painel de convites. */
export type ConviteNaLista = {
  id: string;
  email: string;
  papel: PapelQuadro;
  papel_global: PapelGlobal;
  token: string;
  estado: EstadoConvite;
  expira_em: Timestamptz;
  usado_em: Timestamptz | null;
  enviado_em: Timestamptz | null;
  reenvios: number;
  criado_em: Timestamptz;
  criado_por: string | null;
  autor: string | null;
  acessos: {
    tipo: "quadro" | "cartao";
    nome: string;
    papel: PapelQuadro;
    expira_em: Timestamptz | null;
  }[];
};

/** Um acesso a conceder no resgate do convite: ou um quadro, ou um cartão. */
export type AcessoDoConvite = {
  quadro?: string;
  cartao?: string;
  papel: PapelQuadro;
  expira_em?: string | null;
};

/* Atalhos usados por toda a app. */

export type Perfil = Database["public"]["Tables"]["profiles"]["Row"];
export type Quadro = Database["public"]["Tables"]["boards"]["Row"];
export type MembroQuadro = Database["public"]["Tables"]["board_members"]["Row"];
export type Lista = Database["public"]["Tables"]["lists"]["Row"];
export type Cartao = Database["public"]["Tables"]["cards"]["Row"];
export type Etiqueta = Database["public"]["Tables"]["labels"]["Row"];
export type Comentario = Database["public"]["Tables"]["comments"]["Row"];
export type Anexo = Database["public"]["Tables"]["attachments"]["Row"];
export type Convite = Database["public"]["Tables"]["convites"]["Row"];
export type AcessoCartao = Database["public"]["Tables"]["card_access"]["Row"];
export type RegistoAcesso = Database["public"]["Tables"]["acessos_log"]["Row"];
