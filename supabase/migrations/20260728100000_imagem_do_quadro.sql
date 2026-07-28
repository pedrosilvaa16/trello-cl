-- Imagem de destaque de cada quadro.
--
-- Na Trello cada cliente tem uma fotografia que aparece no cartão da lista de
-- quadros e no fundo do próprio quadro. É identidade visual: numa lista de 19
-- clientes, a imagem encontra o quadro certo antes de o nome ser lido.
--
-- Guardam-se duas: uma pequena para a lista e uma grande para o fundo. Servir
-- 1600px num cartão de 280px seria mandar megabytes para nada.

alter table public.boards
  add column imagem_fundo text,
  add column imagem_miniatura text,
  -- 'claro' ou 'escuro': diz o que a imagem é, não o que se lhe põe por cima.
  -- Quem decide o véu de contraste é a interface, e precisa de saber isto.
  add column brilho_fundo text check (brilho_fundo in ('claro', 'escuro'));

comment on column public.boards.imagem_fundo is
  'Chave no bucket R2 da imagem grande, para o fundo do quadro.';
comment on column public.boards.imagem_miniatura is
  'Chave no bucket R2 da imagem pequena, para o cartão na lista de quadros.';
comment on column public.boards.brilho_fundo is
  'Se a imagem é clara ou escura, para a interface escolher o véu de contraste.';

-- Nada muda em RLS: as colunas são do quadro, e quem vê o quadro vê-as. O
-- acesso às imagens em si continua a ser por URL assinado gerado no servidor,
-- só para os quadros que o utilizador já podia ler.
