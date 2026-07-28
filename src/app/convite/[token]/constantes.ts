/*
  Um ficheiro "use server" só pode exportar funções assíncronas — uma constante
  lá dentro invalida o módulo inteiro. Daí estas viverem à parte, onde tanto o
  servidor como o formulário lhes chegam.
*/

export const MINIMO_PALAVRA_PASSE = 10;

export type EstadoConvite = { erro?: string };
