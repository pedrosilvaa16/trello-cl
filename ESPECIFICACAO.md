# Plataforma de quadros — Especificação

Ferramenta interna de gestão de tarefas, estilo Trello, para uso exclusivo dos
colaboradores da empresa. Não há registo público nem subscrições.

Este documento é o contexto de referência do projeto. É importado a partir do
`CLAUDE.md` na raiz, para ser lido em todas as sessões.

---

## 1. Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Base de dados | Supabase (Postgres) |
| Autenticação | Supabase Auth — email + palavra-passe, **registo fechado** |
| Tempo real | Supabase Realtime (Postgres changes) |
| Anexos | Supabase Storage, bucket privado |
| Interface | Tailwind CSS + shadcn/ui |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Alojamento | Vercel |

Sem ORM pesado — o cliente do Supabase é suficiente e mantém o código legível.
As migrações vivem em `supabase/migrations/` e são versionadas no Git.

---

## 2. Modelo de dados

Todas as tabelas em `public`, todas com RLS ativa.

```
profiles         id (= auth.users.id), nome, avatar_url, criado_em,
                 papel_global ('super_admin'|'admin'|'externo'),
                 ativo, ultimo_acesso
boards           id, nome, descricao, cor, arquivado, criado_por, criado_em
board_members    board_id, user_id,
                 papel ('gestor'|'editor'|'comentador'|'leitor')
lists            id, board_id, nome, posicao (numeric), arquivada
cards            id, list_id, board_id, titulo, descricao, posicao (numeric),
                 data_limite (timestamptz), concluido, arquivado,
                 criado_por, criado_em, atualizado_em
card_access      id, card_id, user_id, papel, concedido_por, expira_em, criado_em
acessos_log      id, ator_id, alvo_id, accao, detalhe (jsonb), criado_em
labels           id, board_id, nome, cor
card_labels      card_id, label_id
card_members     card_id, user_id
comments         id, card_id, autor_id, corpo, criado_em, editado_em
attachments      id, card_id, nome_ficheiro, caminho_storage, tamanho_bytes,
                 tipo_mime, carregado_por, criado_em
convites         id, email, papel, papel_global, token, expira_em,
                 usado_em, criado_por
convite_acessos  id, convite_id, board_id, card_id, papel, expira_em
```

Índices obrigatórios: `lists(board_id, posicao)`, `cards(list_id, posicao)`,
`cards(board_id)`, `comments(card_id, criado_em)`,
`board_members(user_id, board_id)`, `card_access(user_id, card_id)`,
`profiles(papel_global) where ativo`.

---

## 3. Decisões críticas

Estas quatro são as que custam caro se forem mal feitas à partida.

### 3.1 Ordenação por posição fracionária

`posicao` é `numeric`, **nunca** um inteiro sequencial. Ao inserir um cartão
entre dois outros, a nova posição é a média das posições vizinhas. No topo,
`primeira - 1`; no fundo, `ultima + 1`.

Isto significa que arrastar um cartão faz **um** `UPDATE` de uma linha, em vez
de reescrever a lista inteira. Quando o intervalo entre duas posições ficar
abaixo de `0.0001`, corre uma rotina de reequilíbrio que reatribui posições
inteiras (1, 2, 3…) a essa lista.

### 3.2 Registo fechado

O registo público tem de estar desativado em Supabase Auth → Providers → Email.
Entrar na plataforma só é possível por convite:

1. Um admin cria um registo em `convites` com o email e o papel.
2. O sistema envia um link com token, válido 7 dias.
3. O destinatário define a palavra-passe e o token é marcado como usado.

Adicionalmente, um trigger em `auth.users` rejeita qualquer email fora dos
domínios permitidos da empresa. Cinto e suspensórios — é a única barreira entre
a ferramenta e a internet aberta.

### 3.3 RLS em todas as tabelas

A regra base: um utilizador só vê um quadro se existir uma linha em
`board_members` que o ligue a esse quadro. Tudo o resto (listas, cartões,
comentários, anexos) herda a permissão através do `board_id` do respetivo
quadro. As duas exceções são o `super_admin`, que passa em tudo, e o
`card_access`, que dá um cartão sem dar o quadro — ver secção 10.

Escrita: `editor` e `gestor` podem criar e alterar; `comentador` só comenta;
`leitor` só lê. Apagar quadros e gerir membros é exclusivo de `gestor`.

Escreve uma função `pode_aceder_quadro(board_id uuid)` em SQL e usa-a nas
políticas em vez de repetir subconsultas.

**Nenhuma tabela vai para produção sem políticas RLS testadas.** Testa sempre
com duas contas em quadros diferentes.

### 3.4 Anexos privados

Bucket `anexos`, privado. Caminho:
`boards/{board_id}/cards/{card_id}/{uuid}-{nome_ficheiro}`.

O acesso é sempre por URL assinado com validade curta (60 minutos), gerado no
servidor depois de verificar a permissão. Limite de 25 MB por ficheiro.

---

## 4. Funcionalidades do dia 1

**Quadros** — criar, renomear, arquivar. Lista de quadros na página inicial.
Convidar colaboradores e atribuir papel.

**Listas** — criar, renomear, reordenar por arrasto, arquivar.

**Cartões** — criar, editar título e descrição (markdown simples), arrastar
dentro da lista e entre listas, arquivar. Painel lateral ou modal com o detalhe
do cartão.

**Etiquetas** — conjunto por quadro, com nome e cor. Aplicar várias por cartão.
Filtrar o quadro por etiqueta.

**Datas-limite** — data e hora opcionais, com indicador visual para hoje,
amanhã e atrasado. Marcar como concluído.

**Comentários** — escrever, editar e apagar os próprios. Ordenados do mais
antigo para o mais recente, com autor e data.

**Anexos** — carregar, descarregar e remover. Pré-visualização para imagens.

**Tempo real** — alterações a listas, cartões e comentários aparecem nos outros
utilizadores sem recarregar a página.

---

## 5. Fora de âmbito

Não construir, mesmo que pareça fácil: automações e regras, Power-Ups,
integrações externas, vista de calendário ou timeline, checklists dentro de
cartões, modo offline, apps móveis nativas, histórico de atividade por cartão,
notificações por email, campos personalizados.

Cada um destes é uma conversa separada, depois da ferramenta estar em uso real.

---

## 6. Fases e critérios de aceitação

**Fase 1 — Fundações.** Projeto Next.js a correr, projeto Supabase criado,
esquema e RLS aplicados por migração, autenticação por email e palavra-passe,
fluxo de convite funcional.
*Aceite quando:* dois utilizadores convidados entram e não conseguem ver os
quadros um do outro.

**Fase 2 — O quadro.** Quadros, listas e cartões com arrasto fluido e
atualização otimista da interface.
*Aceite quando:* arrastar 50 cartões seguidos não produz nenhuma posição
errada nem salto visual.

**Fase 3 — Contexto.** Etiquetas, datas-limite, membros do cartão, filtros.
*Aceite quando:* filtrar por etiqueta e por membro devolve o resultado certo em
conjunto.

**Fase 4 — Colaboração.** Comentários, anexos, sincronização em tempo real.
*Aceite quando:* dois separadores abertos no mesmo quadro refletem alterações
um do outro em menos de dois segundos.

**Fase 5 — Acabamento.** Pesquisa, arquivo, atalhos de teclado, estados vazios,
responsivo em telemóvel.

Cada fase termina com a aplicação utilizável e publicada. Nada de fases que
deixem o produto partido.

---

## 7. Direção visual

É uma ferramenta de trabalho, usada horas por dia. Densidade de informação,
velocidade e legibilidade valem mais do que ornamento. A tentação a evitar é
copiar o azul do Trello por reflexo — o produto deve parecer da empresa, com
uma paleta e uma tipografia escolhidas de propósito e não por defeito.

Piso de qualidade, sem exceções: foco de teclado visível, contraste conforme
WCAG AA, funcional em telemóvel, animações respeitando `prefers-reduced-motion`.
As transições de arrasto devem ser curtas (150–200 ms) — numa ferramenta usada
o dia inteiro, animação lenta transforma-se em irritação à terceira semana.

Nos textos da interface: verbos ativos, o botão diz o que acontece. "Guardar
alterações", não "Submeter". Um erro explica o que falhou e como resolver. Um
ecrã vazio é um convite para agir, não um espaço em branco.

---

## 8. Convenções de trabalho

- Português de Portugal na interface e nos comentários do código.
- Nomes de tabelas e colunas em português, minúsculas, com underscore.
- Commits pequenos e descritivos.
- Chaves e segredos em variáveis de ambiente. A `service_role` do Supabase
  nunca chega ao cliente.
- Antes de cada nova funcionalidade, confirmar que as políticas RLS das tabelas
  envolvidas continuam corretas.

---

## 9. Notas de implementação

Decisões tomadas ao construir, onde a especificação deixava margem. O
`README.md` explica-as por extenso; aqui fica o essencial para quem retomar o
trabalho.

- **Nomes de tabelas.** A secção 2 fixa nomes em inglês (`boards`, `cards`) e a
  secção 8 pede português. Ganhou a secção 2, por ser o esquema concreto: as
  tabelas mantêm o nome de lá e **as colunas são todas em português**.
- **`convites.board_id`.** Única coluna acrescentada ao modelo. Sem ela, o
  `papel` de um convite não teria a que quadro se aplicar, e "convidar
  colaborador e atribuir papel" (secção 4) não fecharia para quem ainda não tem
  conta. É opcional: a nulo, o convite dá só acesso à plataforma.
- **Hooks React.** Os nomes de código são portugueses, exceto os hooks, que
  levam o prefixo `use` (`useAtalhos`, `useTempoReal`). É contrato do React: sem
  ele, as regras dos hooks deixam de ser verificadas pelo linter.
- **Envio de convites.** Não há servidor de email ligado. A interface cria o
  convite e mostra o link para copiar, em vez de fingir um envio. Ligar um
  fornecedor é acrescentar uma chamada em `criarConvite`.
- **Upload de anexos.** O download é por URL assinado no servidor, como manda a
  secção 3.4. O upload vai do browser direto para o Storage, protegido pelas
  políticas do bucket — passar 25 MB por uma função serverless esbarraria no
  limite de corpo do pedido da Vercel.

---

## 10. Níveis de acesso — dois eixos

Acrescentado depois da Fase 5. O modelo de permissões passou a ter dois eixos
independentes, e é isto que manda sobre a secção 3.3 onde as duas divergirem.

**Eixo A — papel global** (`profiles.papel_global`). O que a pessoa pode fazer
no sistema:

| | |
|---|---|
| `super_admin` | Gere utilizadores e papéis globais. Acede a todos os quadros e cartões sem precisar de convite. Uma pessoa. |
| `admin` | Gestoras de redes sociais. Criam quadros, gerem os quadros onde são gestoras, convidam pessoas para esses quadros. **Não** alteram papéis globais nem acedem a quadros alheios. |
| `externo` | Todos os outros. Sem poderes próprios. Só vê aquilo a que lhe deram acesso explícito. |

**Eixo B — papel por recurso** (`board_members.papel`, `card_access.papel`):
`gestor`, `editor`, `comentador`, `leitor`.

"Cliente" e "freelancer" **não são papéis**. São descrições de utilização:

- cliente = `externo` + `comentador` no quadro dele
- freelancer = `externo` + `editor` em cartões específicos

É deliberado. Um cliente que passe a fazer trabalho pontual, ou um freelancer
que se torne cliente, resolve-se com uma linha nova em vez de uma exceção no
código.

### O que isto obriga

- **Um único sítio por regra.** As políticas usam sempre as funções
  `pode_aceder_*` / `pode_editar_*` / `pode_gerir_*`. Duas cópias da mesma
  regra a divergir são uma falha de segurança silenciosa.
- **Nenhuma função de permissão devolve `null`.** Numa política, nulo é
  recusa; em PL/pgSQL, `if not <nulo>` não entra no ramo e a guarda cala-se.
  Todas acabam em `coalesce(..., false)`.
- **`cards.board_id`.** Desnormalização mantida por trigger, para o RLS não ter
  de subir a `lists` uma vez por linha.
- **Utilizadores não se apagam.** Desativa-se (`profiles.ativo`). Apagar quebra
  a autoria dos comentários e o histórico dos cartões.
- **A última conta `super_admin` ativa** não pode ser desativada nem
  despromovida.
- **Toda a alteração de acesso escreve em `acessos_log`**, e ninguém escreve lá
  diretamente.
- **Esconder um botão não é uma permissão.** O papel global no cliente serve
  para desenhar a interface; toda a ação é verificada no servidor.

### Ecrãs que isto obriga a ter

Um freelancer com cartões soltos não pode abrir o quadro — veria os cartões dos
outros clientes. Precisa de **"Os meus trabalhos"** (`/os-meus-trabalhos`), que
lista os cartões a que tem acesso agrupados por cliente, e de os poder abrir
diretamente (`/cartao/[id]`). Sem isto, entra e não vê nada.

Um cliente com um quadro só salta a lista e vai direto para lá.
