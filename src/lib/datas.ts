import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";
import { pt } from "date-fns/locale";

export type EstadoData = "atrasado" | "hoje" | "amanha" | "futuro" | "concluido";

/**
 * Em que pé está a data-limite de um cartão.
 *
 * Só isto decide a cor do indicador — a regra vive num sítio só para o cartão,
 * o painel de detalhe e os filtros nunca discordarem entre si.
 */
export function estadoData(
  dataLimite: string | null,
  concluido: boolean,
): EstadoData | null {
  if (!dataLimite) return null;
  if (concluido) return "concluido";

  const data = new Date(dataLimite);
  const agora = new Date();

  if (data.getTime() < agora.getTime()) return "atrasado";
  if (isToday(data)) return "hoje";
  if (isTomorrow(data)) return "amanha";
  return "futuro";
}

/** Data-limite como se diz em voz alta: "hoje, 17:30", "3.ª feira, 12 ago". */
export function textoDataLimite(dataLimite: string) {
  const data = new Date(dataLimite);
  const horas = format(data, "HH:mm", { locale: pt });
  const temHora = horas !== "00:00";

  if (isToday(data)) return temHora ? `hoje, ${horas}` : "hoje";
  if (isTomorrow(data)) return temHora ? `amanhã, ${horas}` : "amanhã";
  if (isYesterday(data)) return temHora ? `ontem, ${horas}` : "ontem";

  const dias = Math.abs(differenceInCalendarDays(data, new Date()));
  const mesmoAno = data.getFullYear() === new Date().getFullYear();

  // Dentro da semana o dia da semana diz mais do que o número.
  if (dias < 7) {
    return format(data, temHora ? "EEEE, d MMM 'às' HH:mm" : "EEEE, d MMM", {
      locale: pt,
    });
  }

  return format(
    data,
    mesmoAno
      ? temHora
        ? "d MMM 'às' HH:mm"
        : "d MMM"
      : temHora
        ? "d MMM yyyy 'às' HH:mm"
        : "d MMM yyyy",
    { locale: pt },
  );
}

/** "há 5 minutos", "há 2 dias" — para comentários e anexos. */
export function haQuantoTempo(instante: string) {
  return `há ${formatDistanceToNowStrict(new Date(instante), { locale: pt })}`;
}

/** Data completa, para o title dos elementos abreviados. */
export function dataCompleta(instante: string) {
  return format(new Date(instante), "d 'de' MMMM 'de' yyyy 'às' HH:mm", {
    locale: pt,
  });
}

/** Para <input type="datetime-local">, que só fala em hora local sem fuso. */
export function paraCampoLocal(instante: string | null) {
  if (!instante) return "";
  const data = new Date(instante);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(data.getMinutes())}`;
}

/** O caminho inverso: campo local → ISO com fuso, pronto para timestamptz. */
export function deCampoLocal(valor: string): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}
