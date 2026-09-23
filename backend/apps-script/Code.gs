/**
 * SuperBrix - Reto de Innovación 24h
 * Backend en Google Apps Script:
 *  - Recibe reportes del operario desde la app móvil (POST JSON)
 *  - Clasifica el texto libre con Groq y respaldo local por palabras clave
 *  - Escribe cada evento como una fila en la hoja "Registros"
 *
 * Despliegue: Extensiones > Apps Script en tu Google Sheet, pega este código,
 * luego Implementar > Nueva implementación > Aplicación web (ejecutar como "Yo",
 * acceso "Cualquier usuario"). Copia la URL /exec resultante en la app móvil.
 *
 * Antes de implementar, configura la API key en:
 * Configuración del proyecto > Propiedades del script > GROQ_API_KEY
 * (si falta o falla, se usa el clasificador local por palabras clave).
 */

const SHEET_NAME = 'Registros';

// Groq corre modelos open source sobre hardware propio y está configurado
// como único proveedor de IA para mantener baja la latencia del pitch.
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// 'llama-3.3-70b-versatile' no está disponible para esta cuenta (Groq
// respondía HTTP 404, confirmado con `probarIA()`). openai/gpt-oss-20b sí
// está habilitado, es igual o más rápido (~0.5 s de punta a punta) y da
// buena precisión para esta clasificación de 7 categorías fijas.
const GROQ_MODEL_DEFAULT = 'openai/gpt-oss-20b';
function modeloGroq_() {
  return PropertiesService.getScriptProperties().getProperty('GROQ_MODEL') || GROQ_MODEL_DEFAULT;
}

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

    // El cliente móvil a veces reintenta porque no le llega la respuesta,
    // aunque el backend haya procesado la primera. Con el eventId evitamos
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
    let proveedor = 'manual';
    let tiempoClasificacionMs = 0;
    if (body.abreNuevoSegmento) {
      categoria = body.categoria ? String(body.categoria) : null;
      confianza = categoria ? 'manual' : null;

      if (!categoria) {
        const inicioClasificacion = Date.now();
        const clasificacion = clasificarConIA(texto);
        tiempoClasificacionMs = Date.now() - inicioClasificacion;
        categoria = clasificacion.categoria;
        confianza = clasificacion.confianza;
        proveedor = clasificacion.proveedor || 'desconocido';
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
    if (categoria && proveedor !== 'manual') {
      respuesta.proveedor = proveedor;
      respuesta.tiempoClasificacionMs = tiempoClasificacionMs;
    }

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
  const accion = e && e.parameter ? String(e.parameter.action || '') : '';
  if (accion === 'resumen') {
    const cedula = e.parameter && e.parameter.cedula ? String(e.parameter.cedula) : '';
    const maquina = e.parameter && e.parameter.maquina ? String(e.parameter.maquina) : '';
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, resumen: resumenOperativo_(cedula, maquina) })
    ).setMimeType(ContentService.MimeType.JSON);
  }

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
    formatearRegistros();
  }
  return sheet;
}

// Mismos colores que usa la app (src/theme.ts y src/categorias.ts) para que
// una fila se identifique igual en el celular, en el Sheet y en Looker.
const ESTILO_CATEGORIA = {
  'Producción Activa': { fondo: '#E7F5EC', texto: '#1E7B3B' },
  'Alistamiento y Preparación (Setup)': { fondo: '#E8F1F9', texto: '#2C6394' },
  'Espera de Materiales / Logística': { fondo: '#F6EEDA', texto: '#8C6708' },
  'Falla Técnica / Mantenimiento': { fondo: '#FBEAE8', texto: '#A8362E' },
  'Calidad y Aprobación': { fondo: '#EEEBFA', texto: '#5D51B8' },
  'Instrucciones / Coordinación': { fondo: '#E8F1F9', texto: '#2C6394' },
  'Ausencia del Operario / Descanso': { fondo: '#F2EFE9', texto: '#6B6558' },
};

/**
 * Aplica el formato visual a la hoja "Registros": encabezado de marca,
 * columnas congeladas/con ancho legible, formato de fecha/horas, y un color
 * por categoría (igual al de la app) para leer de un vistazo qué es
 * productivo y qué no. Es seguro correrla varias veces: siempre vuelve a
 * dejar la hoja en el mismo estado, no duplica nada.
 * Ejecútala a mano desde el editor (▶ con esta función seleccionada) cuando
 * quieras refrescar el estilo, por ejemplo después de importar filas viejas.
 */
function formatearRegistros() {
  const sheet = getSheet();
  const columnas = ENCABEZADOS.length;

  sheet.setFrozenRows(1);
  const encabezado = sheet.getRange(1, 1, 1, columnas);
  encabezado
    .setBackground('#EC8C2B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  const anchos = {
    Fecha_Hora: 140,
    Cedula: 100,
    Nombre_Empleado: 150,
    OP: 90,
    Tipo_Evento: 90,
    Descripcion_OP: 320,
    Categoria_IA: 220,
    Confianza: 130,
    Horas_Segmento: 110,
    Maquina: 130,
  };
  ENCABEZADOS.forEach((nombre, i) => sheet.setColumnWidth(i + 1, anchos[nombre] || 120));

  // Se formatea un rango amplio (no solo las filas que ya tienen datos) para
  // que las filas que la app agregue más adelante con appendRow ya salgan
  // con el mismo estilo, sin tener que volver a correr esta función.
  const filasDatos = 2000;

  // Bandas alternadas suaves para leer filas largas sin perderse, sin pisar
  // el color por categoría (que se aplica encima, por rango).
  sheet.getRange(2, 1, filasDatos, columnas).getBandings().forEach((b) => b.remove());
  sheet
    .getRange(2, 1, filasDatos, columnas)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.getRange(2, indiceColumna_('Fecha_Hora'), filasDatos, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange(2, indiceColumna_('Horas_Segmento'), filasDatos, 1).setNumberFormat('0.00" h"');
  sheet.getRange(2, indiceColumna_('Descripcion_OP'), filasDatos, 1).setWrap(true);

  const rangoCategoria = sheet.getRange(2, indiceColumna_('Categoria_IA'), filasDatos, 1);
  const reglasExistentes = sheet
    .getConditionalFormatRules()
    .filter((r) => !r.getRanges().some((rango) => rango.getColumn() === indiceColumna_('Categoria_IA')));
  const reglasCategoria = Object.keys(ESTILO_CATEGORIA).map((categoria) =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(categoria)
      .setBackground(ESTILO_CATEGORIA[categoria].fondo)
      .setFontColor(ESTILO_CATEGORIA[categoria].texto)
      .setBold(true)
      .setRanges([rangoCategoria])
      .build(),
  );
  sheet.setConditionalFormatRules(reglasExistentes.concat(reglasCategoria));

  Logger.log('Formato de "Registros" aplicado.');
}

function indiceColumna_(nombreEncabezado) {
  return ENCABEZADOS.indexOf(nombreEncabezado) + 1;
}

/**
 * Resumen real para el mini tablero dentro de la app. Solo usa filas Cierre,
 * porque son las únicas que ya tienen Horas_Segmento consolidado, y las filtra
 * por el operario y la máquina en la que está trabajando.
 */
function resumenOperativo_(cedulaFiltro, maquinaFiltro) {
  const sheet = getSheet();
  const ultimaFila = sheet.getLastRow();
  const resumenVacio = {
    cedula: String(cedulaFiltro || ''),
    maquina: String(maquinaFiltro || ''),
    totalHoras: 0,
    horasProductivas: 0,
    horasImproductivas: 0,
    eficiencia: 0,
    totalParadas: 0,
    operacionesRegistradas: 0,
    topCausa: null,
    porCausa: [],
    registrosConsiderados: 0,
    actualizadoEn: new Date().toISOString(),
  };
  if (ultimaFila < 2) return resumenVacio;

  const encabezados = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), ENCABEZADOS.length)).getValues()[0];
  const indice = {};
  ENCABEZADOS.forEach((nombre, posicionRespaldo) => {
    const posicion = encabezados.indexOf(nombre);
    indice[nombre] = posicion >= 0 ? posicion : posicionRespaldo;
  });

  const datos = sheet.getRange(2, 1, ultimaFila - 1, Math.max(sheet.getLastColumn(), ENCABEZADOS.length)).getValues();
  const cedulaBuscada = String(cedulaFiltro || '').trim();
  const maquinaBuscada = String(maquinaFiltro || '').trim().toLowerCase();
  if (!cedulaBuscada || !maquinaBuscada) return resumenVacio;

  const porCausa = {};
  const operaciones = {};
  let totalHoras = 0;
  let horasProductivas = 0;
  let horasImproductivas = 0;
  let totalParadas = 0;
  let registrosConsiderados = 0;

  datos.forEach((fila) => {
    const tipoEvento = String(fila[indice.Tipo_Evento] || '').trim();
    const cedula = String(fila[indice.Cedula] || '').trim();
    if (cedula !== cedulaBuscada) return;
    const maquinaFila = String(fila[indice.Maquina] || '').trim();
    if (maquinaFila.toLowerCase() !== maquinaBuscada) return;

    const op = String(fila[indice.OP] || '').trim();
    if (op && (tipoEvento === 'Inicio' || tipoEvento === 'Cierre')) {
      operaciones[op] = true;
    }
    if (tipoEvento !== 'Cierre') return;

    const horas = Number(fila[indice.Horas_Segmento]);
    if (!Number.isFinite(horas) || horas <= 0) return;

    const categoria = String(fila[indice.Categoria_IA] || 'Sin categoría').trim();
    const productiva = categoria === 'Producción Activa';

    registrosConsiderados += 1;
    totalHoras += horas;
    if (productiva) {
      horasProductivas += horas;
    } else {
      horasImproductivas += horas;
      totalParadas += 1;
      porCausa[categoria] = porCausa[categoria] || { categoria, horas: 0, eventos: 0 };
      porCausa[categoria].horas += horas;
      porCausa[categoria].eventos += 1;
    }
  });

  const listaCausas = Object.keys(porCausa)
    .map((clave) => porCausa[clave])
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 6)
    .map((item) => ({
      categoria: item.categoria,
      horas: Math.round(item.horas * 100) / 100,
      eventos: item.eventos,
    }));
  return {
    cedula: cedulaBuscada,
    maquina: String(maquinaFiltro || '').trim(),
    totalHoras: Math.round(totalHoras * 100) / 100,
    horasProductivas: Math.round(horasProductivas * 100) / 100,
    horasImproductivas: Math.round(horasImproductivas * 100) / 100,
    eficiencia: totalHoras > 0 ? Math.round((horasProductivas / totalHoras) * 1000) / 10 : 0,
    totalParadas: totalParadas,
    operacionesRegistradas: Object.keys(operaciones).length,
    topCausa: listaCausas.length ? listaCausas[0] : null,
    porCausa: listaCausas,
    registrosConsiderados: registrosConsiderados,
    actualizadoEn: new Date().toISOString(),
  };
}

/**
 * Ejecutar UNA VEZ desde Apps Script para quitar las filas creadas por las
 * mediciones de latencia. Solo elimina registros con nombre u OP de prueba;
 * nunca toca los datos demo usados en el pitch.
 */
function limpiarPruebasLatencia() {
  const sheet = getSheet();
  let eliminadas = 0;
  for (let fila = sheet.getLastRow(); fila >= 2; fila--) {
    const nombre = String(sheet.getRange(fila, 3).getValue() || '').trim().toUpperCase();
    const op = String(sheet.getRange(fila, 4).getValue() || '').trim().toUpperCase();
    if (nombre === 'PRUEBA-LATENCIA' || op.indexOf('TEST-LAT-') === 0) {
      sheet.deleteRow(fila);
      eliminadas += 1;
    }
  }
  Logger.log('Filas de prueba de latencia eliminadas: ' + eliminadas);
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

  // Todas las novedades se clasifican en paralelo usando Groq para mantener
  // el sembrado rápido dentro del límite de ejecución de Apps Script.
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
 * Groq es el único proveedor remoto. Si no está configurado o falla, el
 * clasificador local por palabras clave mantiene disponible la app sin
 * agregar una segunda cola lenta al pitch.
 */
function proveedores_() {
  const props = PropertiesService.getScriptProperties();
  const groq = props.getProperty('GROQ_API_KEY');
  return groq
    ? [{ nombre: 'groq', key: groq, url: GROQ_ENDPOINT, modelo: modeloGroq_() }]
    : [];
}

/** Ejecutar una vez para borrar del proyecto las propiedades del proveedor retirado. */
function eliminarConfiguracionIAObsoleta() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('NVIDIA_API_KEY');
  props.deleteProperty('NVIDIA_MODEL');
  Logger.log('Configuración del proveedor retirado eliminada.');
}

/**
 * Clasifica el texto libre del operario en una de las CATEGORIAS usando Groq.
 * Si Groq no está disponible o devuelve una respuesta inválida, cae
 * inmediatamente al clasificador local por palabras clave.
 */
function clasificarConIA(texto) {
  if (!texto) {
    return { categoria: 'Instrucciones / Coordinación', confianza: 'vacío', proveedor: 'vacío', tiempoMs: 0 };
  }
  const provs = proveedores_();
  for (let i = 0; i < provs.length; i++) {
    const prov = provs[i];
    const inicio = Date.now();
    try {
      const respuesta = UrlFetchApp.fetch(prov.url, pedidoIA_(texto, prov));
      const tiempoMs = Date.now() - inicio;
      const clasificacion = intentarInterpretar_(respuesta, prov);
      if (clasificacion) {
        clasificacion.proveedor = prov.nombre;
        clasificacion.tiempoMs = tiempoMs;
        Logger.log('clasificarConIA: ' + prov.nombre + ' respondió en ' + tiempoMs + ' ms → ' + clasificacion.categoria);
        return clasificacion;
      }
      Logger.log(
        'clasificarConIA: ' + prov.nombre + ' no dio resultado válido en ' + tiempoMs +
        ' ms (HTTP ' + respuesta.getResponseCode() + '): ' + respuesta.getContentText().slice(0, 300)
      );
    } catch (err) {
      Logger.log('clasificarConIA: ' + prov.nombre + ' falló después de ' + (Date.now() - inicio) + ' ms: ' + err);
    }
  }

  const respaldo = clasificarPorPalabrasClave(texto);
  respaldo.proveedor = 'palabras-clave';
  respaldo.tiempoMs = 0;
  return respaldo;
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
    'Eres un clasificador de causas de parada para una planta industrial. ' +
    'Elige EXACTAMENTE una categoría de esta lista: ' + CATEGORIAS.join(' | ') + '.\n' +
    'Aplica la CAUSA mencionada, no la máquina donde ocurrió. Reglas prioritarias:\n' +
    '- Si falta una broca, pieza, material, insumo o transporte, o se espera que lo lleven: Espera de Materiales / Logística.\n' +
    '- Solo es Falla Técnica / Mantenimiento si el equipo está dañado, no enciende o tiene una falla eléctrica/mecánica.\n' +
    '- Montaje, ajuste, calibración, cambio de matriz o preparación antes de producir: Alistamiento y Preparación (Setup).\n' +
    '- Inspección, metrología o visto bueno de calidad: Calidad y Aprobación.\n' +
    '- Baño, agua, descanso o ausencia del operario: Ausencia del Operario / Descanso.\n' +
    '- Duda, supervisor, reunión o plano sin coordinar: Instrucciones / Coordinación.\n' +
    '- Si describe trabajo normal ya en marcha: Producción Activa.\n' +
    'Responde SOLO con un JSON válido: {"categoria": "...", "confianza": "alta|media|baja"}.\n' +
    'Reporte del operario: "' + texto + '"';

  const payload = {
    model: prov.modelo,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    // Los modelos gpt-oss gastan tokens ocultos de "razonamiento" antes del
    // JSON final; con 120 se truncaba la respuesta y parecía que la IA
    // fallaba cuando en realidad el JSON venía incompleto.
    max_tokens: 300,
  };

  // Groq garantiza JSON válido con esto (la palabra "JSON" ya está en el
  // prompt, requisito de la API para poder usar este modo).
  payload.response_format = { type: 'json_object' };

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
 * ejecución. Confirma la latencia de Groq y si clasifica correctamente el
 * reporte de ejemplo.
 */
function probarIA() {
  const provs = proveedores_();
  if (provs.length === 0) {
    Logger.log('No hay GROQ_API_KEY en Propiedades del script: se usa solo el respaldo por palabras clave.');
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
  Logger.log('Orden de uso real: Groq → palabras clave');
}

function clasificarPorPalabrasClave(texto) {
  const t = texto.toLowerCase();
  const reglas = [
    { cat: 'Ausencia del Operario / Descanso', kw: ['baño', 'sanitario', 'tomar agua', 'hidratar', 'descanso', 'pausa activa', 'me ausento', 'permiso', 'salgo un momento', 'ir al médico', 'enfermería'] },
    { cat: 'Espera de Materiales / Logística', kw: ['tornillo', 'tuerca', 'arandela', 'perno', 'bulón', 'material', 'broca', 'insumo', 'pieza', 'herramienta', 'grúa', 'montacargas', 'falta', 'faltó', 'faltan', 'esperando que traigan', 'no han traído', 'no llegó', 'no hay'] },
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
