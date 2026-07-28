/**
 * Tipos da base de dados.
 *
 * Escritos à mão para o repositório não depender de uma ligação ao Supabase
 * para compilar. Quando o esquema mudar, `npm run tipos` regenera-os a partir
 * do projeto real — e o resultado deve ser igual a isto.
 */

export type PapelQuadro = "admin" | "editor" | "leitor";

type Timestamptz = string;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nome: string;
          avatar_url: string | null;
          criado_em: Timestamptz;
        };
        Insert: {
          id: string;
          nome: string;
          avatar_url?: string | null;
          criado_em?: Timestamptz;
        };
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
          titulo: string;
          descricao: string | null;
          posicao: number;
          data_limite: Timestamptz | null;
          concluido: boolean;
          arquivado: boolean;
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
          token: string;
          expira_em: Timestamptz;
          usado_em: Timestamptz | null;
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
    };
    CompositeTypes: Record<never, never>;
  };
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
