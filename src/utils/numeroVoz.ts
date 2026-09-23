/**
 * Parser de números de Orden de Producción (OP) hablados en español.
 * Extrae y convierte la transcripción de voz del operario a una cadena
 * numérica limpia (ej. "62611").
 */

const DIGITOS_PALABRA: Record<string, number> = {
  cero: 0,
  uno: 1,
  una: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
};

const NUMEROS_ESPECIALES: Record<string, number> = {
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiún: 21,
  veintiun: 21,
  veintiuna: 21,
  veintidos: 22,
  veintidós: 22,
  veintitres: 23,
  veintitrés: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintiséis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

const PALABRAS_IGNORADAS = new Set([
  'y',
  'de',
  'la',
  'el',
  'en',
  'orden',
  'produccion',
  'producción',
  'op',
  'o',
  'p',
  'numero',
  'número',
  'num',
  'por',
  'favor',
  'es',
]);

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, (char) => (char === '\u0301' ? '' : char))
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

/**
 * Convierte cualquier transcripción de voz a los dígitos correspondientes de la OP.
 * Casos contemplados:
 * - Directo con dígitos: "62611", "OP 62 611", "orden de producción 62611" -> "62611"
 * - Dígito por dígito: "seis dos seis uno uno" -> "62611"
 * - Por bloques hablados: "sesenta y dos seis once" -> "62611"
 * - Compuesto tradicional: "sesenta y dos mil seiscientos once" -> "62611"
 */
export function extraerNumeroOp(transcripcion: string): string {
  if (!transcripcion || !transcripcion.trim()) {
    return '';
  }

  const texto = transcripcion.trim();

  // 1. Si ya contiene dígitos numéricos, extraer directamente la secuencia de dígitos.
  const digitosDirectos = texto.replace(/\D/g, '');
  if (digitosDirectos.length > 0) {
    return digitosDirectos;
  }

  // 2. Si viene exclusivamente en palabras en español:
  const palabras = normalizar(texto)
    .split(/\s+/)
    .filter((p) => p && !PALABRAS_IGNORADAS.has(p));

  if (palabras.length === 0) {
    return '';
  }

  // Si contiene "mil" o centenas ("cien", "seiscientos"...), procesar como número compuesto estándar
  const tieneMilOCentenas = palabras.some(
    (p) =>
      p === 'mil' ||
      (p in NUMEROS_ESPECIALES && NUMEROS_ESPECIALES[p] >= 100),
  );

  if (tieneMilOCentenas) {
    let total = 0;
    let actual = 0;
    let reconocioAlguna = false;

    for (const p of palabras) {
      if (p === 'mil') {
        reconocioAlguna = true;
        if (actual === 0) {
          actual = 1;
        }
        total += actual * 1000;
        actual = 0;
      } else if (p in NUMEROS_ESPECIALES) {
        reconocioAlguna = true;
        actual += NUMEROS_ESPECIALES[p];
      } else if (p in DIGITOS_PALABRA) {
        reconocioAlguna = true;
        actual += DIGITOS_PALABRA[p];
      }
    }

    total += actual;
    if (reconocioAlguna && total > 0) {
      return String(total);
    }
  }

  // Si no tiene "mil" ni centenas, procesar como bloques dictados
  // (ej. "seis dos seis uno uno", "sesenta y dos seis once", "veinticinco cuatro")
  const chunks: string[] = [];
  let i = 0;

  while (i < palabras.length) {
    const p = palabras[i];
    // Decenas (30..90) que pueden unirse al siguiente dígito ("sesenta" + "dos" = "62")
    if (
      p in NUMEROS_ESPECIALES &&
      NUMEROS_ESPECIALES[p] >= 30 &&
      NUMEROS_ESPECIALES[p] <= 90
    ) {
      const decena = NUMEROS_ESPECIALES[p];
      if (i + 1 < palabras.length && palabras[i + 1] in DIGITOS_PALABRA) {
        chunks.push(String(decena + DIGITOS_PALABRA[palabras[i + 1]]));
        i += 2;
        continue;
      } else {
        chunks.push(String(decena));
        i++;
        continue;
      }
    } else if (p in NUMEROS_ESPECIALES) {
      chunks.push(String(NUMEROS_ESPECIALES[p]));
      i++;
    } else if (p in DIGITOS_PALABRA) {
      chunks.push(String(DIGITOS_PALABRA[p]));
      i++;
    } else {
      i++;
    }
  }

  return chunks.join('');
}
