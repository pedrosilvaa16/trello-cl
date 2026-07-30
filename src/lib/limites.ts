/**
 * Limites que o servidor e o browser têm de conhecer.
 *
 * Vive à parte de `r2.ts` porque esse é `server-only`: importá-lo num
 * componente de cliente dá erro de build, e é assim que se garante que as
 * credenciais do R2 nunca vão para o browser. O limite de tamanho, esse, tem de
 * ser conhecido dos dois lados — o browser para recusar o ficheiro antes de o
 * começar a enviar, o servidor para o recusar de verdade.
 *
 * O número está aqui uma vez só. A restrição da tabela em SQL tem de dizer o
 * mesmo; são os dois sítios onde ele aparece, e não há um terceiro.
 */

/** 200 MB — o mesmo limite que a restrição das tabelas de anexos impõe. */
export const LIMITE_BYTES = 209715200;
