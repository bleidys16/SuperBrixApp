/**
 * SuperBrix - Reto de Innovación 24h
 * Backend en Google Apps Script:
 *  - Recibe reportes del operario desde la app móvil (POST JSON)
 *  - Clasifica el texto libre con IA (Groq; NVIDIA NIM como respaldo automático)
 *  - Escribe cada evento como una fila en la hoja "Registros"
 *
 * Despliegue: Extensiones > Apps Script en tu Google Sheet, pega este código,
 * luego Implementar > Nueva implementación > Aplicación web (ejecutar como "Yo",
 * acceso "Cualquier usuario"). Copia la URL /exec resultante en la app móvil.
 *
 * Antes de implementar, configura la API key en:
 * Configuración del proyecto > Propiedades del script > GROQ_API_KEY
 * (opcionalmente también NVIDIA_API_KEY como respaldo; ver proveedores_()).
 */

const SHEET_NAME = 'Registros';

// Groq corre modelos open source (Llama, Gemma...) sobre hardware propio
// (LPU), no sobre GPUs compartidas: responde típicamente en <1 s, muy por
// debajo de los 30-40 s que llegó a tardar NVIDIA con su cola gratuita
// saturada. Mismo formato de API (chat/completions estilo OpenAI).
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_DEFAULT = 'llama-3.3-70b-versatile';
function modeloGroq_() {
  return PropertiesService.getScriptProperties().getProperty('GROQ_MODEL') || GROQ_MODEL_DEFAULT;
}

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
// meta/llama-3.1-8b-instruct fue descontinuado por NVIDIA (sep-2026).
// nemotron-3.5-lightning-30b-a3b es el reemplazo activo con "Free Endpoint"
// en build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b.
const NVIDIA_MODEL_DEFAULT = 'nvidia/nemotron-3.5-lightning-30b-a3b';
// El endpoint gratis de NVIDIA es una cola compartida: según la hora, un mismo
// modelo puede responder en 2 s o en 40+ s. Por eso el modelo se puede cambiar
// desde Propiedades del script (NVIDIA_MODEL) sin tocar código ni volver a
// implementar; compararModelosNVIDIA() dice cuál está respondiendo más rápido.
function modeloNVIDIA_() {
  return PropertiesService.getScriptProperties().getProperty('NVIDIA_MODEL') || NVIDIA_MODEL_DEFAULT;
}

// Candidatos para compararModelosNVIDIA(): modelos de texto pequeños/rápidos.
// Los que NVIDIA no tenga disponibles simplemente salen como no disponibles.
const NVIDIA_CANDIDATOS = [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/nvidia-nemotron-nano-9b-v2',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.2-3b-instruct',
  'mistralai/mistral-small-24b-instruct',
  'qwen/qwen2.5-7b-instruct',
  'google/gemma-3-12b-it',
];

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

// Marca en caché que un eventId se está procesando (ver doPost).
const EN_PROCESO = '__en_proceso__';

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
    const maquina = String(body.maquina || '').trim();
    const texto = String(body.texto || '').trim();

    // El cliente móvil a veces reintenta porque no le llega la respuesta
    // (aunque el backend sí procesó la primera vez, ya que NVIDIA puede
    // tardar 30-40 s y el celular se rinde antes). Con el eventId evitamos
    // guardar la misma fila dos veces: si el reintento llega mientras el
    // primer intento todavía está clasificando, se espera ese resultado en
    // vez de volver a escribir las filas.
    const cache = CacheService.getScriptCache();
    if (eventId) {
      // Candado corto (no durante la espera de la IA) para que dos intentos
      // casi simultáneos no pasen ambos el "if" antes de que cualquiera
      // alcance a marcar EN_PROCESO; sin esto, ese hueco de milisegundos
      // podía dejar pasar el mismo duplicado que se quería evitar.
      const candado = LockService.getScriptLock();
      let yaProcesando = false;
      candado.tryLock(5000);
      try {
        const previa = cache.get('evt_' + eventId);
        if (previa && previa !== EN_PROCESO) {
          return ContentService.createTextOutput(previa).setMimeType(ContentService.MimeType.JSON);
        }
        yaProcesando = previa === EN_PROCESO;
        if (!yaProcesando) {
          cache.put('evt_' + eventId, EN_PROCESO, 120);
        }
      } finally {
        candado.releaseLock();
      }
      // La IA puede tardar bastante: se espera un buen rato antes de
      // rendirse. IMPORTANTE: si se agota la espera, NUNCA se reprocesa
      // desde cero (eso fue un bug real: dos intentos podían clasificar por
      // separado y duplicar la fila). En vez de eso se avisa que sigue en
      // curso; el intento original la va a terminar de escribir solo.
      if (yaProcesando) {
        let previa = cache.get('evt_' + eventId);
        for (let i = 0; previa === EN_PROCESO && i < 55; i++) {
          Utilities.sleep(1000);
          previa = cache.get('evt_' + eventId);
        }
        if (previa && previa !== EN_PROCESO) {
          return ContentService.createTextOutput(previa).setMimeType(ContentService.MimeType.JSON);
        }
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, procesando: true, error: 'Todavía procesando, intenta de nuevo en unos segundos.' })
        ).setMimeType(ContentService.MimeType.JSON);
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
        maquina,
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
        maquina,
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
    r.maquina || '',
  ]);
}

const ENCABEZADOS = [
  'Fecha_Hora', 'Cedula', 'Nombre_Empleado', 'OP', 'Tipo_Evento',
  'Descripcion_OP', 'Categoria_IA', 'Confianza', 'Horas_Segmento',
  // Al final para no mover las columnas que ya usa Looker Studio.
  'Maquina',
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
 * Ejecutar a mano desde el editor ANTES de la demo, para que el dashboard no
 * se vea vacío ni con datos irreales. Hace dos cosas:
 *  1) Mueve todas las filas actuales de "Registros" a la pestaña
 *     "Archivo_pruebas" (no se borra nada, solo se aparta).
 *  2) Genera un turno de hoy (6:00 a 14:00) de 4 operarios con el mismo
 *     formato Inicio/Cierre que produce la app. Las novedades van en texto
 *     libre y pasan por clasificarConIA, igual que en la app real.
 */
function sembrarDatosDemo() {
  const sheet = getSheet();
  archivarRegistros_(sheet);
  // Si la hoja se creó antes de agregar "Maquina", completa el encabezado.
  sheet.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold');

  const PROD = null; // segmento de Producción Activa (botón rápido, sin IA)
  const turnos = [
    { cedula: '72234621', nombre: 'Juan Perez', maquina: 'Fresadora CNC', op: '62611', segmentos: [
      ['Estoy montando la mordaza y calibrando la fresadora', 35], [PROD, 95],
      ['Pare la fresadora porque estoy esperando que traigan la broca de 1/2 pulgada', 50], [PROD, 80],
      ['Voy al baño', 10], [PROD, 60],
      ['El supervisor me llamó para aclarar una duda del plano', 20], [PROD, 75],
    ]},
    { cedula: '1098765432', nombre: 'Maria Gomez', maquina: 'Torno', op: '62620', segmentos: [
      ['Ajuste de la matriz del torno antes de arrancar', 25], [PROD, 110],
      ['El torno hace un ruido raro y se apagó, llamé a mantenimiento', 70], [PROD, 90],
      ['Espero que calidad me dé el visto bueno de la primera pieza', 30], [PROD, 100],
      ['Pausa activa y tomar agua', 15],
    ]},
    { cedula: '1122334455', nombre: 'Pedro Ramirez', maquina: 'Soldadora MIG', op: '62630', segmentos: [
      ['Alistamiento de la soldadora y cambio de boquilla', 30], [PROD, 120],
      ['Se acabó el alambre de soldadura, fui al almacén por un rollo', 40], [PROD, 100],
      ['Reunión de coordinación con el jefe de planta', 25], [PROD, 90],
    ]},
    { cedula: '1055667788', nombre: 'Laura Torres', maquina: 'Prensa dobladora', op: '62645', segmentos: [
      ['Calibrando la dobladora para la nueva OP', 40], [PROD, 70],
      ['No han traído la lámina calibre 16, estoy esperando el montacargas', 75], [PROD, 85],
      ['La prensa tiene una fuga de aceite', 45], [PROD, 60],
      ['Inspección de calidad de las piezas dobladas', 20],
    ]},
  ];

  // Todas las novedades van a la IA en paralelo: NVIDIA a veces tarda más de
  // un minuto por consulta y en serie se pasaría del límite de 6 min.
  const textos = [];
  turnos.forEach((t) => t.segmentos.forEach(([texto]) => texto && textos.push(texto)));
  const clasificaciones = clasificarVarios_(textos);

  const hoy = new Date();
  const filas = [];
  turnos.forEach((t) => {
    let cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 6, 0, 0);
    t.segmentos.forEach(([texto, minutos]) => {
      const c = texto
        ? clasificaciones[texto]
        : { categoria: 'Producción Activa', confianza: 'manual' };
      const fin = new Date(cursor.getTime() + minutos * 60000);
      filas.push([cursor, t.cedula, t.nombre, t.op, 'Inicio', texto || '', c.categoria, c.confianza, '', t.maquina]);
      filas.push([fin, t.cedula, t.nombre, t.op, 'Cierre', '', c.categoria, '', minutos / 60, t.maquina]);
      cursor = fin;
    });
  });

  // Orden cronológico, como llegarían en la vida real desde varios celulares.
  filas.sort((a, b) => a[0] - b[0]);
  sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, ENCABEZADOS.length).setValues(filas);
  Logger.log('Datos demo insertados: ' + filas.length + ' filas.');
}

function archivarRegistros_(sheet) {
  const ultima = sheet.getLastRow();
  if (ultima < 2) return;
  const datos = sheet.getRange(2, 1, ultima - 1, ENCABEZADOS.length).getValues();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let archivo = ss.getSheetByName('Archivo_pruebas');
  if (!archivo) {
    archivo = ss.insertSheet('Archivo_pruebas');
    archivo.appendRow(ENCABEZADOS);
  }
  archivo.getRange(archivo.getLastRow() + 1, 1, datos.length, ENCABEZADOS.length).setValues(datos);
  sheet.deleteRows(2, ultima - 1);
}

/**
 * Proveedores de IA configurados, en orden de preferencia (Groq primero por
 * velocidad). clasificarConIA los prueba en este orden y solo pasa al
 * siguiente si el anterior falla de verdad (caído, sin cuota, timeout): así,
 * que uno de los dos falle el día de la demo no deja al operario sin
 * clasificación.
 */
function proveedores_() {
  const props = PropertiesService.getScriptProperties();
  const lista = [];
  const groq = props.getProperty('GROQ_API_KEY');
  if (groq) {
    lista.push({ nombre: 'groq', key: groq, url: GROQ_ENDPOINT, modelo: modeloGroq_() });
  }
  const nvidia = props.getProperty('NVIDIA_API_KEY');
  if (nvidia) {
    lista.push({ nombre: 'nvidia', key: nvidia, url: NVIDIA_ENDPOINT, modelo: modeloNVIDIA_() });
  }
  return lista;
}

/**
 * Clasifica el texto libre del operario en una de las CATEGORIAS con IA.
 * Prueba TODOS los proveedores configurados EN PARALELO (no uno tras otro):
 * si Groq se cuelga, Apps Script puede tardar hasta ~60 s en darse cuenta, y
 * probar NVIDIA solo después sumaría otros 60 s. En paralelo, el peor caso es
 * el más lento de los dos, no la suma. Se prefiere el resultado del primero
 * en la lista (Groq) si varios responden bien; si todos fallan, cae al
 * clasificador por palabras clave para no perder la demo en vivo.
 */
function clasificarConIA(texto) {
  if (!texto) {
    return { categoria: 'Instrucciones / Coordinación', confianza: 'vacío' };
  }
  const provs = proveedores_();
  if (provs.length === 0) {
    return clasificarPorPalabrasClave(texto);
  }
  let respuestas;
  try {
    respuestas = UrlFetchApp.fetchAll(provs.map((p) => Object.assign({ url: p.url }, pedidoIA_(texto, p))));
  } catch (err) {
    Logger.log('clasificarConIA: fetchAll falló por completo: ' + err);
    return clasificarPorPalabrasClave(texto);
  }
  for (let i = 0; i < provs.length; i++) {
    const c = intentarInterpretar_(respuestas[i], provs[i]);
    if (c) {
      return c;
    }
    Logger.log('clasificarConIA: ' + provs[i].nombre + ' no dio resultado válido (HTTP ' + respuestas[i].getResponseCode() + '): ' + respuestas[i].getContentText().slice(0, 300));
  }
  return clasificarPorPalabrasClave(texto);
}

/**
 * Igual que clasificarConIA pero para muchos textos a la vez, en paralelo.
 * Usa un único proveedor (el primero disponible) porque solo se usa para
 * sembrar datos de prueba, no en la demo en vivo.
 * Devuelve un objeto { texto: { categoria, confianza } }.
 */
function clasificarVarios_(textos) {
  const resultado = {};
  const provs = proveedores_();
  if (provs.length === 0) {
    textos.forEach((t) => (resultado[t] = clasificarPorPalabrasClave(t)));
    return resultado;
  }
  const prov = provs[0];
  const pedidos = textos.map((t) => Object.assign({ url: prov.url }, pedidoIA_(t, prov)));
  let respuestas;
  try {
    respuestas = UrlFetchApp.fetchAll(pedidos);
  } catch (err) {
    textos.forEach((t) => (resultado[t] = clasificarPorPalabrasClave(t)));
    return resultado;
  }
  textos.forEach((t, i) => (resultado[t] = intentarInterpretar_(respuestas[i], prov) || clasificarPorPalabrasClave(t)));
  return resultado;
}

function pedidoIA_(texto, prov) {
  const prompt =
    'Clasifica el siguiente reporte de un operario de planta industrial en ' +
    'EXACTAMENTE una de estas categorías: ' + CATEGORIAS.join(' | ') + '.\n' +
    'Responde SOLO con un JSON válido: {"categoria": "...", "confianza": "alta|media|baja"}.\n' +
    'Reporte del operario: "' + texto + '"';

  const payload = {
    model: prov.modelo,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 200,
  };

  if (prov.nombre === 'groq') {
    // Groq garantiza JSON válido con esto (la palabra "JSON" ya está en el
    // prompt, requisito de la API para poder usar este modo).
    payload.response_format = { type: 'json_object' };
  }
  if (prov.nombre === 'nvidia') {
    // Nemotron es un modelo de razonamiento: se apaga el "thinking" para que
    // responda directo con el JSON, sin texto de análisis previo.
    payload.chat_template_kwargs = { enable_thinking: false };
  }

  return {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prov.key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
}

/** Devuelve la clasificación si la respuesta es válida, o null si no (para poder probar el siguiente proveedor). */
function intentarInterpretar_(resp, prov) {
  try {
    if (resp.getResponseCode() !== 200) {
      return null;
    }
    const json = JSON.parse(resp.getContentText());
    const content = json.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match[0]);
    if (CATEGORIAS.indexOf(parsed.categoria) === -1) {
      return null;
    }
    return { categoria: parsed.categoria, confianza: parsed.confianza || 'media' };
  } catch (err) {
    return null;
  }
}

/**
 * Diagnóstico: ejecutar a mano desde el editor y mirar el Registro de
 * ejecución. Prueba TODOS los proveedores configurados (no solo el primero)
 * y dice cuánto tarda cada uno, qué código HTTP devuelve y si clasifica
 * bien, para confirmar antes de la demo que el respaldo también funciona.
 */
function probarIA() {
  const provs = proveedores_();
  if (provs.length === 0) {
    Logger.log('No hay GROQ_API_KEY ni NVIDIA_API_KEY en Propiedades del script: se usa solo el respaldo por palabras clave.');
    return;
  }
  const texto = 'Pare la fresadora porque estoy esperando que traigan la broca de 1/2 pulgada';
  provs.forEach((prov) => {
    const inicio = Date.now();
    try {
      const resp = UrlFetchApp.fetch(prov.url, pedidoIA_(texto, prov));
      const seg = (Date.now() - inicio) / 1000;
      const c = intentarInterpretar_(resp, prov);
      Logger.log(
        prov.nombre + ' (' + prov.modelo + ') → ' + seg + ' s | HTTP ' + resp.getResponseCode() +
        (c ? ' | ' + c.categoria + ' (' + c.confianza + ')' : ' | respuesta inválida, caería al respaldo')
      );
    } catch (err) {
      Logger.log(prov.nombre + ' → error después de ' + (Date.now() - inicio) / 1000 + ' s: ' + err);
    }
  });
  Logger.log('Orden de uso real (el primero que responda bien gana): ' + provs.map((p) => p.nombre).join(' → ') + ' → palabras clave');
}

/**
 * Ejecutar a mano desde el editor (solo si usas NVIDIA). Manda la misma
 * novedad a varios modelos de NVIDIA en paralelo y lista cuánto tardó cada
 * uno y qué categoría dio. Copia el más rápido que clasifique bien en
 * Propiedades del script > NVIDIA_MODEL.
 */
function compararModelosNVIDIA() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('NVIDIA_API_KEY');
  if (!apiKey) {
    Logger.log('No hay NVIDIA_API_KEY en Propiedades del script.');
    return;
  }
  const texto = 'Pare la fresadora porque estoy esperando que traigan la broca de 1/2 pulgada';
  // fetchAll no da el tiempo de cada pedido por separado, así que se mide
  // uno por uno y se corta a los ~4.5 min para no chocar con el límite de 6.
  const t0 = Date.now();
  NVIDIA_CANDIDATOS.forEach((modelo) => {
    if (Date.now() - t0 > 270000) {
      Logger.log(modelo + ' → no se alcanzó a probar (tiempo agotado)');
      return;
    }
    const inicio = Date.now();
    const prov = { nombre: 'nvidia', key: apiKey, url: NVIDIA_ENDPOINT, modelo: modelo };
    try {
      const resp = UrlFetchApp.fetch(NVIDIA_ENDPOINT, pedidoIA_(texto, prov));
      const seg = (Date.now() - inicio) / 1000;
      if (resp.getResponseCode() !== 200) {
        Logger.log(modelo + ' → no disponible (HTTP ' + resp.getResponseCode() + ', ' + seg + ' s)');
        return;
      }
      const c = intentarInterpretar_(resp, prov);
      Logger.log(modelo + ' → ' + seg + ' s | ' + (c ? c.categoria + ' (' + c.confianza + ')' : 'respuesta inválida'));
    } catch (err) {
      Logger.log(modelo + ' → error después de ' + (Date.now() - inicio) / 1000 + ' s: ' + err);
    }
  });
  Logger.log('Modelo actual: ' + modeloNVIDIA_());
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
