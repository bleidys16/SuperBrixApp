/**
 * Cliente HTTP hacia el backend de Google Apps Script.
 * Reemplaza API_URL por la URL /exec que te da "Implementar > Nueva implementación"
 * en el Apps Script (ver backend/apps-script/README.md).
 */
export const API_URL =
  'https://script.google.com/macros/s/AKfycbwchXUR0oUpAg_cWGkNjM2vXnKtXuKLNJs7j58jryN6NmDqB4oxPMQqjqQ_oC7M5IxzuQ/exec';

/**
 * Cada request puede cerrar un segmento anterior, abrir uno nuevo, o ambos
 * a la vez (una "novedad" cierra el que estaba corriendo y abre el de la
 * interrupción). El backend guarda cada cosa en su propia fila para que
 * categoría y horas siempre correspondan al mismo bloque de tiempo.
 */
export interface ReporteEvento {
  cedula: string;
  nombre: string;
  op: string;
  maquina: string;
  /** Categoría del segmento que se está cerrando (si hay uno corriendo). */
  categoriaCerrada?: string;
  /** Horas que duró ese segmento cerrado. */
  horasCerradas?: number;
  /** true si además arranca un segmento nuevo (todo menos "Finalizar OP"). */
  abreNuevoSegmento?: boolean;
  categoria?: string; // categoría del segmento nuevo, si viene de un botón rápido (se salta la IA)
  texto?: string; // texto libre dictado/escrito por el operario para el segmento nuevo (pasa por la IA)
}

export interface RespuestaBackend {
  ok: boolean;
  categoria?: string;
  confianza?: string;
  error?: string;
}

function generarEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function intentarEnvio(
  evento: ReporteEvento & { eventId: string },
  timeoutMs: number,
): Promise<RespuestaBackend> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const respuesta = await fetch(API_URL, {
      method: 'POST',
      // text/plain (no application/json) evita que Android intente re-negociar
      // la petición al seguir la redirección 302 de Apps Script, que es lo que
      // estaba causando "Network request failed" / "AbortError" incluso cuando
      // el backend ya había guardado la fila. doPost lee el body igual como
      // texto crudo y lo parsea con JSON.parse, así que el formato no cambia.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(evento),
      signal: controller.signal,
    });
    if (!respuesta.ok) {
      throw new Error(`Error de red: ${respuesta.status}`);
    }
    return await respuesta.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

const INTENTOS = [15000, 25000, 30000]; // ms, cada intento espera más por si la red está lenta

/**
 * Apps Script a veces responde con una redirección que el cliente móvil no
 * logra completar aunque el backend ya haya guardado la fila (confirmado:
 * el Sheet recibe el dato igual). Por eso reintenta con el mismo `eventId`:
 * el backend lo usa para no duplicar la fila si un intento anterior sí llegó.
 */
export async function enviarEvento(evento: ReporteEvento): Promise<RespuestaBackend> {
  const conId = { ...evento, eventId: generarEventId() };
  for (let i = 0; i < INTENTOS.length; i++) {
    try {
      return await intentarEnvio(conId, INTENTOS[i]);
    } catch {
      if (i === INTENTOS.length - 1) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error(
    'No se pudo confirmar el envío después de varios intentos. Es probable que sí se haya guardado: revisa antes de repetirlo.',
  );
}
