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
- **Capa do cartão** (`cards.capa_*`). Uma cor da paleta **ou** uma imagem, em
  faixa (tira no topo) ou completa (capa no cartão todo, título por cima) —
  como na Trello. A imagem é **um anexo do próprio cartão**, e não um ficheiro
  à parte: é o que faz apagar o anexo limpar a capa sozinho, pelo
  `on delete set null`, sem uma segunda regra a ter de se lembrar disso.
- **A capa e a imagem do quadro são de quem gere o quadro**, e não de quem
  edita — são identidade visual, não conteúdo. Para isso ser verdade e não só
  aparência, as colunas (`cards.capa_*`, `boards.imagem_*`, `brilho_fundo`)
  estão fora do `GRANT` de UPDATE das tabelas e só mudam por
  `definir_capa_cartao` e `definir_imagem_quadro`; as políticas de UPDATE,
  sozinhas, deixariam qualquer editor lá escrever. Mesma técnica que
  `profiles.papel_global` usa. As imagens são reduzidas no browser antes de
  subir, e a do quadro sobe em duas versões (fundo e miniatura) com o brilho
  medido a partir dos píxeis.

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
- **Utilizadores desativam-se, não se apagam.** Desativar (`profiles.ativo`) é
  o caminho normal, e é o único que se desfaz. A exceção é a conta de teste ou
  o convite enganado: aí, `preparar_eliminacao_conta` + a Admin API eliminam-na
  de vez, e é exclusivo do `super_admin`. Antes de apagar, o nome de quem
  escreveu passa para `comments.autor_externo` e
  `attachments.carregado_por_externo` — as mesmas colunas que a importação da
  Trello usa — para a autoria não se perder com o perfil.
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

### Convites

Criados, enviados e geridos em `/pessoas/convites`. O envio é pelo Resend, com
`RESEND_API_KEY` e `EMAIL_REMETENTE` no ambiente; sem elas o convite continua a
ser criado e o link é copiado à mão.

Quem vê um convite: um `super_admin` vê todos, e toda a gente vê os que criou e
os que dizem respeito a quadros que gere. Reenviar um convite válido manda o
mesmo link; reenviar um expirado troca o token e dá-lhe sete dias novos.

---

## 11. Estatísticas de redes sociais — dois separadores por quadro

Acrescentado depois da secção 10. **Isto revoga a exclusão de "integrações
externas" da secção 5**, e só para este caso: as estatísticas das redes do
cliente. Tudo o resto dessa lista continua fora de âmbito.

A razão é de produto, não técnica. Cada quadro é um cliente, e até aqui o
quadro só mostrava o que está *planeado*. Faltava o outro lado — o que esse
plano deu. É o separador que transforma a ferramenta interna num painel que se
mostra ao cliente.

### Os dois separadores

Dentro de `/quadro/[id]` passam a existir duas secções:

| | |
|---|---|
| **Conteúdos** (`/quadro/[id]`) | O quadro como sempre foi: listas, cartões, arrasto. |
| **Estatísticas** (`/quadro/[id]/estatisticas`) | Painel de resultados das redes sociais do cliente. |

O `layout.tsx` do quadro é dono do cabeçalho e dos separadores; cada página
traz só o seu conteúdo.

### Quem vê e quem liga

Os dois eixos da secção 10 aplicam-se sem exceção nova:

- **Ver estatísticas** = `pode_aceder_quadro`. Um `leitor` e um `comentador`
  veem o painel inteiro — é para isso que ele existe.
- **Ligar e desligar contas** = `pode_gerir_quadro`. Só quem gere o quadro
  autoriza uma rede social. Um cliente vê os números e nunca vê o botão.

### Decisões

- **O token é do quadro, não da agência.** Cada `ligacoes_redes` tem
  `board_id not null`. O cliente autoriza a conta dele para o quadro dele, e
  desligar um quadro não mexe em mais nenhum. Um token único do Business
  Manager a servir todos os quadros pouparia autorizações e trocaria uma
  política RLS de uma linha por uma tabela de associação — não compensa.

- **Os segredos não vivem no mesmo sítio que os dados.** `ligacoes_segredos` é
  uma tabela à parte, com RLS ativa e **política nenhuma**: nem o dono do
  quadro a lê. Os tokens entram cifrados com AES-256-GCM a partir da aplicação
  (`CHAVE_CIFRA_REDES`), portanto a base de dados guarda-os sem os saber ler.
  É deliberadamente mais apertado do que `convites.token`, que está em claro —
  um token de convite vive sete dias e dá acesso a este produto; um token da
  Meta vive sessenta dias e dá acesso à conta do cliente.

- **A base de dados é a fonte de verdade, não a API.** A Meta só devolve cerca
  de trinta dias de histórico. Um cron diário grava um retrato em
  `metricas_redes`, e o painel lê sempre de lá. A consequência a assumir: o
  histórico começa no dia em que a conta é ligada, e um mês sem sincronizar é
  um mês perdido para sempre. Em troca, ao fim de um ano há histórico que o
  plano gratuito do Metricool não dá.

- **Ninguém escreve métricas a partir do browser.** `metricas_redes`,
  `demografia_redes`, `publicacoes_redes` e `sincronizacoes` têm `insert`,
  `update` e `delete` revogados de `authenticated`. Só o sincronizador escreve,
  com a `service_role`. Mesmo tratamento de `acessos_log`.

- **Uma ligação expirada diz que expirou.** Os tokens da Meta duram sessenta
  dias. `ligacoes_redes.estado` e um aviso visível no topo do painel valem mais
  do que qualquer outra coisa aqui: um painel de cliente a mostrar números
  velhos em silêncio é o pior modo de falha possível.

- **Gráficos escritos de raiz**, em SVG, sobre os tokens de `globals.css`.
  Nenhuma biblioteca de gráficos entra no projeto: traria meio megabyte, um
  sistema de temas paralelo ao nosso e props em inglês no meio de código todo
  em português.

- **Faseamento.** Instagram e Facebook primeiro, por partilharem a mesma app
  Meta e valerem quase todo o resultado. LinkedIn e TikTok têm o fornecedor
  escrito e a interface pronta, e ficam à espera da aprovação respetiva — a
  `ligacoes_redes.rede` já as aceita.

### Vocabulário de métricas

Cada rede fala a sua língua; a base de dados fala uma só. Os fornecedores
traduzem para este vocabulário e o painel nunca sabe de que rede veio o número:
`seguidores`, `a_seguir`, `publicacoes`, `alcance`, `visualizacoes`,
`interacoes`, `gostos`, `comentarios`, `partilhas`, `guardados`,
`visitas_perfil`, `cliques_site`.

Acrescentar uma métrica é acrescentar uma linha ao vocabulário e o mapeamento
no fornecedor. Acrescentar uma rede é um ficheiro em `src/lib/redes/`.

### Mobile-first, e desta vez a sério

É o primeiro ecrã do projeto desenhado para o telemóvel antes do computador —
é onde um cliente o vai abrir. Tudo empilha; nada rola na horizontal. O scroll
horizontal das colunas do quadro é uma exceção justificada por ser um quadro, e
não um padrão a repetir.

---

## 12. Separador «Estratégia» — o contexto que se cura

Acrescentado depois da secção 11. É o terceiro separador de um quadro, ao lado
de Conteúdos e Estatísticas, e **só existe para quem gere o quadro**.

Nesta fase **não há modelo de linguagem nenhum ligado**: nenhuma chamada
externa, nenhuma chave, nenhum SDK. O que se construiu foi o sítio onde o
contexto de cada cliente vive — estratégia, voz da marca, o porquê de cada
referência, o que funcionou e o que não funcionou — para se saber se isto se
usa antes de se investir na parte cara.

### Quem vê

`pode_gerir_quadro`, e mais ninguém. Não é «vê e não pode editar»: um editor,
um cliente ou um freelancer **não sabem que o separador existe**.

- A aba não é construída no cabeçalho de quem não gere — não está desativada
  nem escondida por CSS, não chega ao HTML.
- As rotas respondem **404 e nunca 403**. Um 403 confirma que o recurso existe.
- `carregarQuadro` corta `lists.tipo`, `cards.referencia_porque` e
  `cards.referencia_url` do payload de quem não gere. Um campo destes num
  cartão conta a história a quem abra as ferramentas do browser.
- RLS em `board_contexto`, `aprendizagens` e `geracoes` com uma regra só, e ver
  não é mais aberto do que escrever.

### Decisões

- **As listas são tipadas, não procuradas pelo nome.** `lists.tipo` é
  `normal`, `referencias` ou `publicados`. Código que procurasse «Ideias e
  Referências» partiria no primeiro quadro que lhe chamasse outra coisa — e
  partiria em silêncio, devolvendo zero. A migração adivinhou uma vez pelo
  nome; a partir daí corrige-se na interface, e listas novas nascem `normal`.

- **A ordem dos blocos no prompt não é por conveniência de leitura.** Primeiro
  os estáveis — estratégia, voz, publicados, referências, aprendizagens — e o
  pedido no fim. É o que permitirá *prompt caching* quando o modelo entrar;
  trocar de sítio deita fora essa poupança sem dar sinal nenhum.

- **O gerador está atrás de uma interface, com duas implementações.** O
  simulado devolve respostas fixas com 800–1500 ms de atraso artificial, e
  grava em `geracoes` exatamente como o real gravará — com o retrato do
  contexto e o respetivo hash. O atraso não é teatro: uma resposta instantânea
  esconde os problemas que só aparecem quando ela demora.

- **`geracoes.contexto_snapshot` guarda o que foi enviado**, e não uma
  referência ao que existia. O contexto muda todos os dias, e uma resposta má
  só se explica olhando para a entrada exata que a produziu.

- **O painel «O que a AI vê» não está atrás de nenhum modo avançado.** Mostra o
  resultado real de `montarContexto`, não uma aproximação. É o que permite a
  quem gere olhar para a entrada quando uma sugestão for má, em vez de concluir
  que a ferramenta não presta. Escondido, ninguém o abriria — e o valor todo
  dele está em ser visto sem ser procurado.

- **Nada do que a aba produz fica a viver na aba.** A aba é onde o contexto se
  cura; o quadro é onde o trabalho acontece.

---

## 13. Separador «Tarefas» — o trabalho da casa

Acrescentado depois da secção 12. É um separador **de topo**, ao lado de
Quadros, e não um separador dentro de um quadro. Essa é a decisão que manda em
todas as outras.

Até aqui, tudo na plataforma pendurava num quadro — e um quadro é um cliente.
Faltava o outro trabalho: o que a equipa da casa tem para fazer e que não é de
cliente nenhum. Faturas, propostas, candidaturas, o que for.

### Porque é que isto não é um quadro chamado «Interno»

Resolvia à primeira vista e partia à segunda. O RLS dos quadros existe para um
cliente ver o quadro dele; uma lista de quadros com um intruso lá no meio é uma
exceção que se paga em todo o lado a seguir — no filtro da página inicial, nos
convites, nos acessos por cartão, na página de cada pessoa.

Por isso: **tabelas próprias, hierarquia própria, funções de acesso próprias.**
`tarefa_espacos`, `tarefa_listas`, `tarefas` e `tarefa_responsaveis` não têm
uma única chave estrangeira para `boards`, `cards` ou `lists`. Não é omissão, é
a característica principal do desenho — e há um teste em `08_tarefas.sql` que
falha se alguém acrescentar uma.

### Quem vê

`super_admin` e `admin` — o eixo A, e só o eixo A. Uma regra, uma função:
`pode_gerir_tarefas()`, que todas as políticas usam e que a página chama antes
de renderizar seja o que for.

Entre gestores **não há níveis**. São duas ou três pessoas a organizar o
trabalho da casa, e inventar `gestor`/`editor`/`leitor` aqui dentro era
construir uma hierarquia que ninguém pediu para depois ter de a manter.

Para um cliente ou um freelancer o separador **não existe**: não é construído
no cabeçalho, e `/tarefas` responde **404 e nunca 403** — mesma regra da secção
12, e pela mesma razão.

### Hierarquia e campos

```
tarefa_espacos    id, nome, cor, posicao, arquivado
tarefa_listas     id, espaco_id, nome, posicao, arquivada
tarefas           id, lista_id, espaco_id, mae_id, titulo, descricao,
                  estado, prioridade, data_inicio, data_limite,
                  posicao, arquivada, criado_por, criado_em, atualizado_em
tarefa_responsaveis  tarefa_id, user_id
```

- **`estado` é um enum fixo** — `por_fazer`, `em_curso`, `bloqueada`,
  `concluida` — e não configurável por lista. Estados livres fazem com que duas
  listas deixem de ser comparáveis, e a vista de agenda junta tarefas de sítios
  diferentes: não saberia o que «Em revisão» quer dizer ao lado de «A
  aguardar». `bloqueada` está lá porque é a única que muda o que se faz a
  seguir.
- **`prioridade` é anulável.** Obrigar a escolher faz com que tudo acabe em
  «média», e uma coluna onde tudo tem o mesmo valor não ordena nada.
- **Duas datas.** A de início separa «entrego na sexta» de «começo na quarta»;
  sem ela, tudo o que tem prazo aparece a gritar no mesmo dia.
- **`espaco_id` é desnormalizado por trigger**, como `cards.board_id`, e está
  fora do `GRANT` de UPDATE — junto com `atualizado_em`, pela mesma técnica que
  `cards.capa_*` usa.
- **Subtarefas: um nível, e na mesma lista da mãe.** Não é preguiça — é o que
  dispensa correr atrás de ciclos. Com um nível a regra é uma pergunta só («a
  minha mãe já tem mãe?»); com N é uma travessia recursiva a cada gravação, e o
  dia em que alguém puser A dentro de B dentro de A a interface entra em ciclo
  a desenhar.
- **Arquivar não é concluir.** Concluída é «fez-se»; arquivada é «decidiu-se
  não fazer». Confundi-las dá uma métrica de trabalho feito que conta o que se
  desistiu de fazer.

### A vista de agenda

Seis grupos: **Atrasado, Hoje, Esta semana, Este mês, Futuros, Sem data**.

- Os grupos comparam **dias de calendário**, não instantes. Uma tarefa marcada
  para hoje às 09:00, vista às 15:00, fica em «Hoje» e não salta para
  «Atrasado» ao almoço. O emblema ao lado — esse sim, pelo relógio — já diz que
  passou da hora. O grupo responde a «que dia é isto», o emblema a «ainda vou a
  tempo».
- A semana ganha ao mês quando as duas apanham a mesma data.
- **Ao domingo, «esta semana» é a que está prestes a começar.** O fim da semana
  de calendário é o próprio domingo, e sem este cuidado o grupo ficava sempre
  vazio e a tarefa de amanhã caía em «Este mês» — inútil precisamente no dia em
  que alguém abre a agenda para planear a semana.
- **Os grupos vazios ficam**, com uma frase em vez de nada. Um grupo que
  desaparece ao esvaziar faz a lista saltar por baixo do cursor e tira a
  resposta à pergunta que se foi lá fazer.
- O relógio que decide tudo isto vem do servidor no primeiro render e passa a
  andar de minuto a minuto depois de montar — sem isso, o HTML do servidor e o
  do browser divergiam à volta da meia-noite.

### Duas armadilhas que só se veem a correr

- **`profiles` tem RLS.** Uma política que consulte a tabela diretamente é
  avaliada com a sessão de quem escreve, e `partilha_quadro` só deixa ver o
  perfil de quem partilha um quadro connosco. Duas gestoras que não partilhem
  nenhum quadro não se veem — atribuir uma tarefa a uma colega era recusado, e
  o seletor de responsáveis aparecia quase vazio, nenhum dos dois a dizer
  porquê. Daí `e_da_equipa()` e `equipa_da_casa()`, ambas SECURITY DEFINER e
  ambas com a mesma condição, para a interface nunca oferecer um nome que o
  servidor recusa.
- **Os privilégios por omissão do Supabase dão `authenticated` tudo sobre cada
  tabela nova.** Um `grant update (colunas)` por cima disso não restringe nada:
  as duas autorizações somam-se. Sem o `revoke all` antes, o fecho por coluna
  era decorativo.

### Documentos

Acrescentado logo a seguir. Cada tarefa aceita ficheiros, pelo mesmo caminho
que os anexos dos quadros: o browser envia direto para o R2 com um URL de
escrita assinado no servidor, e a leitura é sempre por URL assinado de validade
curta. Limite de 200 MB por ficheiro, como nos quadros.

- **O mesmo bucket, prefixo diferente** (`tarefas/{espaco}/{tarefa}/…`). Um
  segundo bucket não acrescentaria segurança nenhuma — o R2 não tem RLS, o
  bucket já é privado e nada nele é servido diretamente; quem impõe a permissão
  é o servidor, que só assina depois de a confirmar. Seriam duas credenciais e
  duas configurações de CORS para a mesma garantia.
- **Tabela própria** (`tarefa_anexos`). `attachments` tem `card_id not null` a
  apontar para `cards`, e pô-la a servir dois donos obrigava a torná-la
  anulável e a acrescentar um CHECK «ou um ou outro».
- **A chave do objeto nunca vem do cliente**, e isso é fechado dos dois lados: a
  rota decide-a, e o trigger `tarefa_anexos_caminho_no_sitio` recusa, na base de
  dados, qualquer linha cujo caminho não caia debaixo da tarefa a que diz
  pertencer. Sem essa segunda metade, uma linha podia dizer «sou da tarefa A» e
  apontar para o ficheiro da tarefa B — e a rota de leitura assina o que a linha
  disser.

### O tempo real, e um erro que era de toda a aplicação

A sincronização entre separadores foi medida a sério: uma tarefa criada num
separador aparece no outro em **menos de um segundo**, e fechá-la chega igual —
dentro dos dois segundos que a Fase 4 exige.

Chegar lá obrigou a corrigir um erro que **não era das tarefas**: o canal era
subscrito antes de o token da sessão chegar ao socket. O `createBrowserClient`
lê a sessão dos cookies de forma assíncrona, e quem chama `.subscribe()` no
primeiro render subscreve como visitante anónimo. O Realtime avalia as
políticas com as credenciais que o socket tinha nesse momento — e o que devolve
não é um erro, é pior: o canal liga, os eventos chegam, e cada um vem com o
registo vazio e um `errors: ["Error 401: Unauthorized"]` que ninguém lê. Parece
montado e nunca sincronizou nada.

Estava assim **desde sempre, também nos quadros**. A correção é
`subscreverAutenticado` (`src/lib/supabase/tempo-real.ts`): `setAuth` antes de
`subscribe`, num sítio só, usado pelos dois.

A outra metade corrigiu-se no cliente: um registo vazio entrava no estado, ia
parar ao `sort` e rebentava em `porPosicao` a comparar um `id` que não existia —
ecrã branco por causa de uma mensagem que devia ter sido ignorada. **Nenhuma
mensagem vinda de fora pode derrubar a página**, e há testes a guardar isso.

### Fora de âmbito, para já

Comentários e histórico por tarefa, etiquetas, pesquisa, vista de quadro
(kanban) com arrasto e lembretes. A ordenação já é fracionária (`posicao`), mas
**não há função de reequilíbrio** — ela só faz falta quando se inserir *entre*
duas posições, e isso só existe com arrasto. Entra no dia em que o arrasto
entrar: código que nada chama é código que ninguém testa.
