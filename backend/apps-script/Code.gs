/**
 * SuperBrix - Reto de Innovación 24h
 * Backend en Google Apps Script:
 *  - Recibe reportes del operario desde la app móvil (POST JSON)
 *  - Clasifica el texto libre con IA (NVIDIA NIM, API compatible con OpenAI)
 *  - Escribe cada evento como una fila en la hoja "Registros"
 *
 * Despliegue: Extensiones > Apps Script en tu Google Sheet, pega este código,
 * luego Implementar > Nueva implementación > Aplicación web (ejecutar como "Yo",
 * acceso "Cualquier usuario"). Copia la URL /exec resultante en la app móvil.
 *
 * Antes de implementar, configura la API key en:
 * Configuración del proyecto > Propiedades del script > NVIDIA_API_KEY
 */

const SHEET_NAME = 'Registros';
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
// meta/llama-3.1-8b-instruct fue descontinuado por NVIDIA (sep-2026).
// nemotron-3.5-lightning-30b-a3b es el reemplazo activo con "Free Endpoint"
// en build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b.
const NVIDIA_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';

const CATEGORIAS = [
  'Producción Activa',
  'Alistamiento y Preparación (Setup)',
  'Espera de Materiales / Logística',
  'Falla Técnica / Mantenimiento',
  'Calidad y Aprobación',
  'Instrucciones / Coordinación',
  // Extra respecto a la guía del reto: en ensamble manual, si el operario
  // deja el puesto (baño, tomar agua, etc.) la línea se detiene igual que
  // con una falla técnica, así que se rastrea aparte para diferenciar
  // "ausencia de personal" de "problemas de proceso/máquina".
  'Ausencia del Operario / Descanso',
];

/**
 * Modelo de datos: cada fila representa UN SOLO segmento, nunca dos cosas
 * mezcladas. Por eso una acción del operario puede generar hasta 2 filas:
 *   - "Cierre": la categoría y las horas que SÍ corresponden entre sí (el
 *     bloque que se acaba de terminar). Descripcion_OP queda vacía.
 *   - "Inicio": la categoría (y la descripción/texto que la originó) del
 *     bloque que empieza ahora. Horas_Segmento queda vacía porque todavía
 *     no ha corrido tiempo.
 * Así, SUM(Horas_Segmento) agrupado por Categoria_IA en el dashboard da el
 * tiempo real por categoría, sin mezclar el motivo de un bloque con la
 * duración de otro.
 */
function doPost(e) {
  const respuesta = { ok: false };
  try {
    const body = JSON.parse(e.postData.contents);
    const eventId = String(body.eventId || '').trim();
    const cedula = String(body.cedula || '').trim();
    const nombre = String(body.nombre || '').trim();
    const op = String(body.op || '').trim();
    const texto = String(body.texto || '').trim();

    // El cliente móvil a veces reintenta porque no le llega la respuesta
    // (aunque el backend sí procesó la primera vez). Con el eventId evitamos
    // guardar la misma fila dos veces.
    const cache = CacheService.getScriptCache();
    if (eventId) {
      const previa = cache.get('evt_' + eventId);
      if (previa) {
        return ContentService.createTextOutput(previa).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 1) Si venía un segmento anterior corriendo, se cierra con SU categoría
    // y SUS horas (Falla Técnica, Espera de Materiales, Producción Activa...).
    const categoriaCerrada = body.categoriaCerrada ? String(body.categoriaCerrada) : null;
    const horasCerradas = body.horasCerradas != null ? Number(body.horasCerradas) : '';
    if (categoriaCerrada) {
      appendRegistro({
        fecha: new Date(),
        cedula,
        nombre,
        op,
        tipoEvento: 'Cierre',
        texto: '',
        categoria: categoriaCerrada,
        confianza: '',
        horasSegmento: horasCerradas,
      });
    }

    // 2) Si además hay que abrir un segmento nuevo (todo excepto "Finalizar
    // OP" puro), se clasifica y se guarda con horas vacías todavía.
    let categoria = null;
    let confianza = null;
    if (body.abreNuevoSegmento) {
      categoria = body.categoria ? String(body.categoria) : null;
      confianza = categoria ? 'manual' : null;

      if (!categoria) {
        const clasificacion = clasificarConIA(texto);
        categoria = clasificacion.categoria;
        confianza = clasificacion.confianza;
      }

      appendRegistro({
        fecha: new Date(),
        cedula,
        nombre,
        op,
        tipoEvento: 'Inicio',
        texto,
        categoria,
        confianza,
        horasSegmento: '',
      });
    }

    respuesta.ok = true;
    respuesta.categoria = categoria;
    respuesta.confianza = confianza;

    if (eventId) {
      cache.put('evt_' + eventId, JSON.stringify(respuesta), 120);
    }
  } catch (err) {
    respuesta.error = String(err);
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, msg: 'SuperBrix backend activo' })
  ).setMimeType(ContentService.MimeType.JSON);
}

function appendRegistro(r) {
  const sheet = getSheet();
  sheet.appendRow([
    r.fecha,
    r.cedula,
    r.nombre,
    r.op,
    r.tipoEvento,
    r.texto,
    r.categoria,
    r.confianza,
    r.horasSegmento,
  ]);
}

const ENCABEZADOS = [
  'Fecha_Hora', 'Cedula', 'Nombre_Empleado', 'OP', 'Tipo_Evento',
  'Descripcion_OP', 'Categoria_IA', 'Confianza', 'Horas_Segmento',
];

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // Mismos campos que la tarjeta física FO-A-MA-01 (Cédula, OP#, Descripción,
    // No. de Horas) más los campos nuevos que aporta la digitalización
    // (Tipo_Evento, Categoria_IA, Confianza).
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(ENCABEZADOS);
  }
  return sheet;
}

/**
 * Ejecutar UNA VEZ a mano desde el editor (▶ Ejecutar, con esta función
 * seleccionada en el desplegable de arriba) si tu pestaña "Registros" ya
 * tenía datos antes de tener el código y por eso nunca le pusieron
 * encabezados. Es seguro correrla más de una vez: si ya hay encabezados
 * en la fila 1, no hace nada.
 */
function insertarEncabezados() {
  const sheet = getSheet();
  const primeraCelda = sheet.getRange('A1').getValue();
  if (primeraCelda === ENCABEZADOS[0]) {
    Logger.log('Ya hay encabezados en la fila 1, no se hace nada.');
    return;
  }
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]);
  sheet.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('Encabezados insertados.');
}

/**
 * Clasifica el texto libre del operario en una de las CATEGORIAS usando NVIDIA NIM.
 * Si la llamada falla (sin internet, límite de cuota, etc.) cae a un clasificador
 * simple por palabras clave para no perder la demo en vivo.
 */
function clasificarConIA(texto) {
  if (!texto) {
    return { categoria: 'Instrucciones / Coordinación', confianza: 'vacío' };
  }
  const apiKey = PropertiesService.getScriptProperties().getProperty('NVIDIA_API_KEY');
  if (!apiKey) {
    return clasificarPorPalabrasClave(texto);
  }

  const prompt =
    'Clasifica el siguiente reporte de un operario de planta industrial en ' +
    'EXACTAMENTE una de estas categorías: ' + CATEGORIAS.join(' | ') + '.\n' +
    'Responde SOLO con un JSON válido: {"categoria": "...", "confianza": "alta|media|baja"}.\n' +
    'Reporte del operario: "' + texto + '"';

  const payload = {
    model: NVIDIA_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 200,
    // Es un modelo de razonamiento: se apaga el "thinking" para que responda
    // directo con el JSON, sin texto de análisis previo que retrase la demo.
    chat_template_kwargs: { enable_thinking: false },
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const resp = UrlFetchApp.fetch(NVIDIA_ENDPOINT, options);
    if (resp.getResponseCode() !== 200) {
      return clasificarPorPalabrasClave(texto);
    }
    const json = JSON.parse(resp.getContentText());
    const content = json.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match[0]);
    if (CATEGORIAS.indexOf(parsed.categoria) === -1) {
      return clasificarPorPalabrasClave(texto);
    }
    return { categoria: parsed.categoria, confianza: parsed.confianza || 'media' };
  } catch (err) {
    return clasificarPorPalabrasClave(texto);
  }
}

function clasificarPorPalabrasClave(texto) {
  const t = texto.toLowerCase();
  const reglas = [
    { cat: 'Ausencia del Operario / Descanso', kw: ['baño', 'sanitario', 'tomar agua', 'hidratar', 'descanso', 'pausa activa', 'me ausento', 'permiso', 'salgo un momento', 'ir al médico', 'enfermería'] },
    { cat: 'Espera de Materiales / Logística', kw: ['material', 'broca', 'insumo', 'grúa', 'montacargas', 'falta', 'esperando que traigan'] },
    { cat: 'Falla Técnica / Mantenimiento', kw: ['falla', 'ruido', 'eléctrico', 'fuga', 'mantenimiento', 'dañad', 'no enciende'] },
    { cat: 'Calidad y Aprobación', kw: ['calidad', 'inspección', 'visto bueno', 'metrología', 'plano aprobado'] },
    { cat: 'Alistamiento y Preparación (Setup)', kw: ['alistamiento', 'calibra', 'ajuste', 'matriz', 'mordaza', 'setup', 'montaje'] },
    { cat: 'Instrucciones / Coordinación', kw: ['duda', 'reunión', 'supervisor', 'plano', 'coordinación'] },
  ];
  for (const r of reglas) {
    if (r.kw.some((k) => t.indexOf(k) !== -1)) {
      return { categoria: r.cat, confianza: 'baja (heurística sin IA)' };
    }
  }
  return { categoria: 'Producción Activa', confianza: 'baja (heurística sin IA)' };
}
