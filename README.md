# Quadros

Ferramenta interna de gestão de tarefas, estilo Trello. Registo fechado: só se
entra por convite.

A especificação do produto está em [`ESPECIFICACAO.md`](ESPECIFICACAO.md) e é o
documento que manda. Este ficheiro trata de pôr isto a andar.

---

## Pôr a andar

Precisas de Node 22+, do [Supabase CLI](https://supabase.com/docs/guides/cli) e
de um projeto Supabase.

```bash
npm install
cp .env.example .env.local     # e preencher com as chaves do projeto
```

### 1. Aplicar o esquema

```bash
supabase link --project-ref <ref-do-projeto>
supabase db push
```

Isto aplica as migrações de `supabase/migrations/`: esquema, funções de acesso,
políticas RLS, posições, autenticação, anexos, tempo real e — para quem venha da
Trello — os ajustes da importação e o elenco de pessoas.

> **Sem isto nada funciona.** A aplicação compila e arranca, mas todas as
> consultas falham com `Could not find the table 'public.boards'`.

### 2. Fechar o registo

No Supabase Dashboard → **Authentication → Providers → Email**, desligar
*Enable Sign Ups*. É o passo que a especificação exige e que nenhuma migração
pode fazer por ti — vive na configuração do projeto, não na base de dados.

Opcionalmente, restringir os domínios de email aceites:

```sql
insert into public.dominios_permitidos (dominio) values ('empresa.pt');
```

Com a tabela vazia não há restrição de domínio, o que é prático em local e
perigoso em produção. O trigger em `auth.users` faz cumprir o resto.

### 3. Criar a primeira conta

Os convites só podem ser criados por quem já é admin de algum quadro, por isso o
primeiro utilizador nasce fora da aplicação:

```bash
npm run primeiro-admin -- ana@empresa.pt "Ana Ferreira"
```

Entra em `/entrar`, cria um quadro (ficas admin dele) e convida a equipa pelo
botão de membros.

### 4. Arrancar

```bash
npm run dev
```

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Testes da lógica pura (posições, filtros) |
| `npm run tipos` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm run bd:testar` | **Migrações + testes de RLS** num Postgres descartável |
| `npm run bd:aplicar` | `supabase db push` |
| `npm run tipos:gerar` | Regenera os tipos da base de dados a partir do projeto |
| `npm run trello:extrair` | Puxa a conta Trello para `dados-trello/` |
| `npm run trello:validar` | Ensaia a importação sem tocar na base de dados |
| `npm run trello:importar` | Importa para a plataforma |
| `npm run anexos:r2` | Traz da Trello todos os ficheiros para o R2 |
| `npm run papel-global` | Define o papel global de uma conta (`--listar` mostra todas) |
| `npm run testar:api` | Testes de aceitação às rotas, com sessões reais |
| `npm run dar-admin` | Escreve alguém como gestor em cada quadro (raramente é o que se quer — ver `papel-global`) |

**/pessoas** é o painel de gestão de acessos, para `super_admin` e `admin`.
Depois de importar da Trello, **/pessoas/trello** liga cada pessoa da
importação a uma conta desta plataforma.

### Testar a base de dados

A especificação é explícita: *nenhuma tabela vai para produção sem políticas RLS
testadas, e testa sempre com duas contas em quadros diferentes*. É o que
`npm run bd:testar` faz — cerca de 60 asserções em
[`supabase/tests/`](supabase/tests/), incluindo os critérios de aceitação das
Fases 1 e 2:

- dois utilizadores não veem os quadros um do outro, nem com o id à frente;
- um `leitor` lê e não escreve, um `editor` não apaga o quadro, só o `gestor`
  gere membros;
- comentários só são editados e apagados pelo próprio autor;
- o bucket de anexos segue as permissões do quadro;
- um convite não serve duas vezes nem depois de expirar;
- **50 arrastos seguidos** e a ordem do servidor bate sempre certo com a do
  cliente, incluindo o reequilíbrio pelo meio.

E os dez critérios de aceitação dos níveis de acesso
([`05_niveis_de_acesso.sql`](supabase/tests/05_niveis_de_acesso.sql)), dos quais
os dois primeiros são os que interessam: um cliente não lê nada do quadro de
outro cliente, nem sequer o anexo, nem com o id à frente.

Corre num cluster Postgres temporário com os arreios mínimos do Supabase
(`supabase/tests/00_stub_supabase.sql`), por isso **não precisa de Docker**. Com
Docker a correr, `supabase db reset` é o caminho mais fiel.

### Testar as rotas

`npm run bd:testar` cobre as políticas e as funções; `npm run testar:api` cobre
o que fica por cima delas. É a única forma de fazer o teste 2 como está escrito
— *não obtém URL assinado de um anexo do quadro B, mesmo chamando a rota
diretamente com o id do anexo* — porque isso é um handler e não uma tabela.

As contas fazem login a sério e o que vai em cada pedido é o cookie de sessão
delas; a `service_role` só monta e desmonta o cenário. Precisa de um Supabase a
sério (`supabase start`) e da aplicação a correr, e recusa-se a apontar para um
projeto remoto sem `--mesmo-em-producao`.

---

## Migrar da Trello

Três passos, e o do meio existe para o terceiro não ter surpresas.

```bash
npm run trello:extrair     # puxa tudo para dados-trello/ (não escreve na BD)
npm run trello:validar     # ensaia a conversão contra as restrições das tabelas
npm run trello:importar -- --admin=ana@empresa.pt
```

**Credenciais.** A Trello dá três coisas e os nomes enganam: a *chave API*, o
*Segredo* (OAuth secret, que **não** serve para a API REST) e o *token*, que é
uma terceira credencial gerada ao autorizar a aplicação. Só a chave e o token
entram no `.env.local`:

```
https://trello.com/1/authorize?expiration=1day&scope=read&response_type=token&name=Importador%20Quadros&key=<A_TUA_CHAVE>
```

`scope=read` e um dia de validade chegam: é uma migração, só se lê.

**Quem é quem.** A API da Trello não devolve o email de terceiros, por isso a
primeira corrida do importador cria `dados-trello/mapa-pessoas.json` e pára. Se
já souberes emails, escreve-os lá e essas pessoas entram ligadas de início.
**Não é obrigatório**: quem ficar em branco entra como autor externo — o nome
sobrevive nos comentários (marcados como "migrado") — e liga-se depois em
/pessoas, sem perder nada.

**Repetível.** Cada objeto criado fica registado em `importacoes_trello`, por
isso correr duas vezes não duplica nada e uma corrida interrompida retoma de
onde ficou. O rasto é gravado a seguir a cada inserção, não no fim — com
centenas de ficheiros a transferir, a interrupção acontece.

**A atribuição corrige-se depois.** Não é preciso acertar o mapeamento antes de
importar. Cada comentário e cada anexo guarda o id da pessoa na Trello em
`autor_trello`, e os cartões e quadros que ficaram por atribuir esperam em
`atribuicoes_trello` e `membros_trello`. A página **/pessoas** (só para admins)
lista quem veio da Trello e associa cada um a uma conta — passando-lhe nesse
momento os comentários, os anexos, os quadros e os cartões.

`autor_trello` nunca é limpo, e é isso que torna a coisa reversível: associar à
pessoa errada resolve-se associando outra vez à certa, e `desassociar` devolve
o nome a texto. A pertença aos quadros é a única coisa que não se retira ao
desassociar — tirar alguém de um quadro onde já pode estar a trabalhar seria
fazer estragos por causa de um engano de mapeamento.

Vale a pena começar por um quadro só, e sem transferir ficheiros:

```bash
npm run trello:importar -- --admin=ana@empresa.pt --quadro="Fero" --so-metadados
```

### O que a migração mudou no esquema

Tudo isto veio de dados reais a bater no esquema, não de suposições
([`20260727100000_importacao_trello.sql`](supabase/migrations/20260727100000_importacao_trello.sql)):

- **`cards.titulo` 300 → 1000** e **`comments.corpo` 5000 → 20000.** Um cartão
  trazia um título de 714 caracteres e um comentário tinha 6259.
- **Um anexo passa a ser ficheiro *ou* ligação.** A Trello deixa anexar um URL,
  e a equipa usa isso para Canva, Drive e Instagram. `caminho_storage` e
  `tamanho_bytes` passaram a poder ser nulos, entrou `url`, e um `CHECK` garante
  exatamente uma das duas metades. O limite de 25 MB da especificação mantém-se
  para o que é mesmo ficheiro.
- **`comments.autor_externo`.** Nem toda a gente que escreveu na Trello tem
  conta aqui. Em vez de deitar fora o nome, guarda-se em texto.
- **`importacoes_trello`.** Andaime da migração, sem políticas de RLS: só o
  `service_role` lhe chega, e não faz parte do produto.
- **`pessoas_trello`, `atribuicoes_trello`, `membros_trello`** e as funções
  `associar_pessoa_trello` / `desassociar_pessoa_trello`, que sustentam a página
  /pessoas ([`20260727110000_pessoas_trello.sql`](supabase/migrations/20260727110000_pessoas_trello.sql)).

**Os ficheiros vão para o R2, não para o Supabase.** `npm run anexos:r2` vai à
Trello (a fonte original, e a única que tem também os vídeos) e copia tudo para
o bucket. É repetível: o que já lá está com o tamanho certo é saltado. Correr
com `--ver` diz o que faria sem escrever nada.

**Checklists ficaram fora**, como manda a secção 5 da especificação — mas o
conteúdo não se perdeu: as 6 que existiam entram na descrição do cartão como
lista de tarefas markdown, que o `remark-gfm` já desenha com caixas. Construir
tabelas e interface para seis casos seria uma funcionalidade inteira a mais.

---

## Como está feito

### Posições fracionárias

`posicao` é `numeric`. Largar um cartão entre dois outros dá-lhe a média das
posições vizinhas, o que faz de cada arrasto **um `UPDATE` de uma linha**.

A aritmética existe em duplicado, de propósito: em
[`src/lib/posicoes.ts`](src/lib/posicoes.ts) para o cliente pintar o cartão no
sítio certo antes de a rede responder, e em SQL
([`20260727090300_posicoes.sql`](supabase/migrations/20260727090300_posicoes.sql))
para o servidor ter a última palavra. Os testes verificam que os dois concordam.

Inserir sempre no mesmo intervalo parte a folga ao meio de cada vez; ao fim de
14 vezes desce abaixo de `0.0001` e o `mover_cartao` reequilibra a lista,
devolvendo a posição final para o cliente se corrigir numa só resposta.

### Permissões

Dois eixos independentes, definidos em
[`20260728120000_niveis_de_acesso.sql`](supabase/migrations/20260728120000_niveis_de_acesso.sql)
e descritos por extenso na secção 10 da especificação.

**Eixo A, o papel global** (`profiles.papel_global`): `super_admin` gere pessoas
e vê tudo; `admin` cria quadros e gere os seus; `externo` só vê o que lhe deram.

**Eixo B, o papel por recurso**: `gestor`, `editor`, `comentador`, `leitor` —
num quadro (`board_members`) ou num cartão solto (`card_access`).

"Cliente" e "freelancer" não são papéis, são combinações: um cliente é externo +
comentador no quadro dele; um freelancer é externo + editor em cartões
concretos, com data de fim opcional. Quem muda de função resolve-se com uma
linha nova, e não com uma exceção no código.

Uma regra, um sítio: as políticas chamam sempre `pode_aceder_*`,
`pode_editar_*`, `pode_gerir_*`, e nunca repetem a lógica em subconsultas. São
`SECURITY DEFINER` por necessidade — uma política sobre `board_members` que
consultasse `board_members` entraria em recursão infinita — e todas acabam em
`coalesce(..., false)`, porque em PL/pgSQL `if not <nulo>` não entra no ramo e
uma guarda que se cala é uma guarda que não existe.

A interface esconde o que um papel não pode fazer, mas não é ela que decide.
As escritas do quadro passam pelo cliente do browser, logo por RLS; as de gestão
passam por rotas que verificam a sessão no servidor e por funções SQL que voltam
a verificar tudo. Um quadro alheio não dá "sem permissão": desaparece.

**Utilizadores não se apagam** — desativa-se (`profiles.ativo`). Apagar quebraria
a autoria dos comentários e o histórico dos cartões. Desativado não entra e
deixa de contar como membro, mas o nome continua a aparecer no que escreveu. E a
última conta `super_admin` ativa não pode ser desativada nem despromovida.

Toda a alteração de acesso fica em `acessos_log`, onde ninguém escreve
diretamente.

### Tempo real

O canal do quadro subscreve `lists`, `cards`, `labels`, `card_labels` e
`card_members`; os comentários são subscritos por cartão, só enquanto o painel
está aberto. O Realtime reavalia RLS por subscritor, por isso ninguém recebe o
que não podia ler.

`cards` não tem `board_id`, por isso um cartão mexido noutro quadro do mesmo
utilizador também chega ao canal. Quem o descarta é o reducer, que é onde o
estado atual está — assim o efeito não depende do estado e subscreve uma só vez.

### Anexos, no Cloudflare R2

Os ficheiros vivem num bucket privado do R2, não no Supabase Storage. A troca
teve dois motivos: 831 MB enchiam o 1 GB do plano, e o limite de 25 MB deixava
os vídeos de fora. No R2 o limite passou a **200 MB** e a saída de dados não se
paga.

**O R2 não tem RLS.** Quem tiver as credenciais lê o bucket inteiro — por isso
elas nunca saem do servidor ([`src/lib/r2.ts`](src/lib/r2.ts) é `server-only`, e
importá-lo num componente de cliente dá erro de build). A permissão é imposta
antes de qualquer acesso, em três sítios:

- **Ler** — [`GET /api/anexos/[id]`](src/app/api/anexos/) lê a linha de
  `attachments` com a sessão do utilizador. Essa consulta *é* a verificação: se
  RLS não deixa ver a linha, não há nada para assinar. Só depois se assina um
  URL de 60 minutos, como manda a secção 3.4.
- **Enviar** — [`POST /api/anexos/upload`](src/app/api/anexos/upload/) confirma
  `pode_editar_quadro` (a mesma função que as políticas usam, não uma segunda
  regra a poder divergir), decide a chave do objeto e devolve um URL de escrita.
  O ficheiro vai do browser direto para o R2: 200 MB nunca caberiam no corpo de
  um pedido a uma função serverless.
- **Remover** — `DELETE` na mesma rota apaga primeiro a linha (que passa por
  RLS) e só depois o objeto.

A chave do objeto é sempre decidida no servidor. Se viesse do cliente, qualquer
pessoa escrevia por cima do anexo de outra.

O instante da assinatura é arredondado em janelas de 15 minutos
([`src/lib/r2.ts`](src/lib/r2.ts)). Sem isso, cada render produzia um URL
diferente para a mesma imagem e o browser voltava a descarregar as vinte
miniaturas da lista de quadros a cada visita. A validade efetiva fica entre 45 e
60 minutos — continua a ser a "validade curta" da secção 3.4.

### Imagem de destaque do quadro

Cada quadro tem uma fotografia, que aparece no cartão da lista e por trás das
colunas — como na Trello, de onde vieram (`npm run fundos:r2`). São guardadas
duas escalas: ~640px para o cartão e a maior para o fundo, porque servir 1600px
num cartão de 280px seria mandar megabytes para nada.

Os URLs são assinados no próprio render das páginas, e não por uma rota que
reencaminha: assinar é um HMAC local, e 19 quadros custam microssegundos. A
permissão não precisa de segunda verificação, porque os quadros já saíram de
uma consulta filtrada por RLS.

A legibilidade não depende da fotografia. As colunas e a barra do quadro
mantêm superfície opaca, e sobre a imagem há um véu cuja força segue o
`brilho_fundo` — que é a classificação clara/escura que a própria Trello faz da
imagem.

### Convites

Um admin cria o convite, o sistema gera um token e a interface **mostra o link
para copiar**. Não há servidor de email ligado, e dizer "enviado" sem ter
enviado seria pior do que ser claro. Ligar um fornecedor (Resend, SMTP) é
acrescentar uma chamada em `criarConvite`, em
[`src/lib/quadro/mutacoes.ts`](src/lib/quadro/mutacoes.ts).

Quem resgata o convite ainda não tem sessão, por isso essa troca corre no
servidor com a `service_role`, em [`src/app/convite/`](src/app/convite/). Se o
resgate falhar depois de a conta ser criada, a conta é apagada — mais vale não
existir do que ficar um utilizador sem quadro nenhum e um convite que ainda
parece válido.

---

## Onde está o quê

```
supabase/migrations/    Esquema, RLS, posições, convites, storage, realtime,
                        níveis de acesso
supabase/reverter/      Reversões, fora do que o `db push` aplica
supabase/tests/         Testes de RLS, posições e níveis de acesso (SQL)
src/app/                Rotas: entrar, convite, quadro, cartão, pessoas, api
src/components/ui/      Primitivas (botão, diálogo, menu, avatar…)
src/components/quadro/  O quadro: colunas, cartões, detalhe, filtros, membros
src/components/pessoas/ O painel de acessos e o cartão visto sem o quadro
src/lib/acessos.ts      Autorização das rotas de gestão, no servidor
src/lib/quadro/         Estado, mutações, filtros, tempo real
src/lib/posicoes.ts     Aritmética das posições fracionárias
src/proxy.ts            Renovação de sessão e proteção de rotas
```

---

## Convenções

Português de Portugal na interface e nos comentários. Nomes de código em
português, com duas exceções deliberadas:

- **Tabelas** mantêm os nomes da especificação (`boards`, `cards`, `lists`), que
  é onde o esquema está fixado. As **colunas são todas em português**.
- **Hooks React** levam o prefixo `use` (`useAtalhos`, `useTempoReal`). É
  contrato do React: sem ele, o linter deixa de verificar as regras dos hooks, e
  perder essa verificação custa mais do que ganha a coerência do nome.

Uma coluna foi acrescentada ao modelo da especificação: `convites.board_id`,
opcional. Sem ela o `papel` de um convite não teria a que quadro se aplicar.

O tema vive todo em variáveis CSS no topo de
[`globals.css`](src/app/globals.css) — mudar a identidade da empresa é mexer aí
e em mais lado nenhum. As cores das etiquetas são guardadas pelo nome (`verde`,
`azul`), nunca em hexadecimal, para a paleta poder mudar sem migração.
