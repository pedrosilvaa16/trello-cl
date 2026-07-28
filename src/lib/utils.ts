import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes e resolve conflitos do Tailwind (a última ganha). */
export function cn(...entradas: ClassValue[]) {
  return twMerge(clsx(entradas));
}

/** Iniciais para o avatar: "Ana Maria Ferreira" → "AF". */
export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Tamanhos legíveis: 1,4 MB em vez de 1468006. */
export function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["kB", "MB", "GB"];
  let valor = bytes / 1024;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024;
    indice += 1;
  }
  return `${valor.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} ${unidades[indice]}`;
}
