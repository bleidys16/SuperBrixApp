import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Operario, guardarMaquina, obtenerMaquina } from '../storage';
import { enviarEvento, ReporteEvento, RespuestaBackend } from '../api';
import TextoModal from '../components/TextoModal';
import BannerClasificacion from '../components/BannerClasificacion';
import ResumenScreen from './ResumenScreen';
import { colorCategoria } from '../categorias';
import { COLOR, RADIUS, SPACE } from '../theme';
import { dictarAudio } from '../nativo/voz';
import { extraerNumeroOp } from '../utils/numeroVoz';

interface Props {
  operario: Operario;
  onCambiarOperario: () => void;
}

interface SegmentoActivo {
  id: number;
  op: string;
  maquina: string;
  categoria: string;
  inicioMs: number;
}

// Puestos de trabajo de la planta; se eligen con un solo toque, sin escribir.
const MAQUINAS = [
  'Fresadora CNC',
  'Torno',
  'Soldadora MIG',
  'Prensa dobladora',
  'Cortadora plasma',
  'Ensamble',
  'Pintura',
];

const CATEGORIA_SETUP = 'Alistamiento y Preparación (Setup)';
const CATEGORIA_AUSENCIA = 'Ausencia del Operario / Descanso';

// Respaldo rápido al reportar novedad: si el operario no quiere hablar o la
// IA falla, un toque directo — sin pasar por texto ni por la IA.
const CAUSAS_RAPIDAS: Array<{
  categoria: string;
  icono: string;
  etiqueta: string;
}> = [
  {
    categoria: 'Falla Técnica / Mantenimiento',
    icono: 'build',
    etiqueta: 'Falla técnica',
  },
  {
    categoria: 'Espera de Materiales / Logística',
    icono: 'local-shipping',
    etiqueta: 'Espera material',
  },
  { categoria: CATEGORIA_SETUP, icono: 'settings', etiqueta: 'Setup' },
];

function clasificarTextoLocal(texto: string): {
  categoria: string;
  confianza: string;
} {
  const t = texto.toLowerCase();
  if (
    /baño|sanitario|tomar agua|descanso|pausa activa|me ausento|permiso/.test(t)
  ) {
    return { categoria: CATEGORIA_AUSENCIA, confianza: 'preliminar' };
  }
  if (
    /tornillo|tuerca|arandela|perno|bul[oó]n|broca|insumo|material|pieza|herramienta|gr[úu]a|montacargas|falta|falt[oó]|faltan|est[aá] esperando|no han tra[íi]do|no lleg[oó]|no hay/.test(
      t,
    )
  ) {
    return {
      categoria: 'Espera de Materiales / Logística',
      confianza: 'preliminar',
    };
  }
  if (
    /falla|ruido|eléctrico|fuga|mantenimiento|dañad|no enciende|se apagó/.test(
      t,
    )
  ) {
    return {
      categoria: 'Falla Técnica / Mantenimiento',
      confianza: 'preliminar',
    };
  }
  if (/calidad|inspección|visto bueno|metrología|plano aprobado/.test(t)) {
    return { categoria: 'Calidad y Aprobación', confianza: 'preliminar' };
  }
  if (/alistamiento|calibr|ajuste|matriz|mordaza|setup|montaje/.test(t)) {
    return { categoria: CATEGORIA_SETUP, confianza: 'preliminar' };
  }
  if (/duda|reunión|supervisor|plano|coordinación/.test(t)) {
    return {
      categoria: 'Instrucciones / Coordinación',
      confianza: 'preliminar',
    };
  }
  return { categoria: 'Instrucciones / Coordinación', confianza: 'preliminar' };
}

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Jerarquía visual de 3 niveles:
 *  - primaria: 1 sola, rellena de naranja, grande. La acción más probable.
 *  - secundaria: contorno, en fila para no apilar.
 *  - terciaria: texto simple, sin relleno ni borde, separada del resto.
 */
type Variante = 'primaria' | 'secundaria' | 'terciaria';

interface BotonAccionProps {
  icono: string;
  texto: string;
  onPress: () => void;
  disabled?: boolean;
  variante?: Variante;
  colorTerciaria?: string;
  estiloExtra?: object;
}

function BotonAccion({
  icono,
  texto,
  onPress,
  disabled,
  variante = 'primaria',
  colorTerciaria,
  estiloExtra,
}: BotonAccionProps) {
  const colorContenido =
    variante === 'primaria'
      ? '#ffffff'
      : variante === 'terciaria'
      ? colorTerciaria || COLOR.textMuted
      : COLOR.ink;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.boton,
        styles[`boton_${variante}` as const],
        pressed && !disabled && styles.botonPresionado,
        disabled && styles.botonDeshabilitado,
        estiloExtra,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon
        name={icono}
        size={variante === 'terciaria' ? 16 : 20}
        color={colorContenido}
        style={styles.botonIcono}
      />
      <Text
        style={[
          styles.botonTexto,
          variante === 'terciaria' && styles.botonTextoTerciaria,
          { color: colorContenido },
        ]}
        numberOfLines={2}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

export default function CapturaScreen({ operario, onCambiarOperario }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [op, setOp] = useState('');
  const [maquina, setMaquina] = useState('');
  const [segmento, setSegmento] = useState<SegmentoActivo | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [iaPendiente, setIaPendiente] = useState(false);
  const [modalVisible, setModalVisible] = useState<'inicio' | 'novedad' | null>(
    null,
  );
  const [resumenVisible, setResumenVisible] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState('00:00');
  const [clasificacion, setClasificacion] = useState<{
    categoria: string;
    confianza: string;
  } | null>(null);
  const siguienteSegmentoId = useRef(1);
  const colaSync = useRef<Promise<void>>(Promise.resolve());
  const pendientesSync = useRef(0);
  const pendientesIA = useRef(0);
  const maquinaResumen = segmento?.maquina || maquina;

  // --- Captura de OP por Voz (Flujo 100% Sin Escritura) ---
  const [escuchandoOp, setEscuchandoOp] = useState(false);
  const [modoTecladoOp, setModoTecladoOp] = useState(false);
  const [opPorVoz, setOpPorVoz] = useState(false);

  useEffect(() => {
    obtenerMaquina().then(setMaquina);
  }, []);

  function elegirMaquina(m: string) {
    setMaquina(m);
    guardarMaquina(m);
  }

  async function capturarOpPorVoz() {
    setEscuchandoOp(true);
    try {
      const texto = await dictarAudio(
        'Di el número de la orden de producción (ej. 62611)',
      );
      const numero = extraerNumeroOp(texto);
      if (numero) {
        setOp(numero);
        setModoTecladoOp(false);
        setOpPorVoz(true);
      } else {
        Alert.alert(
          'No se reconoció un número de OP',
          `Escuchamos: "${texto}". Di claramente los dígitos, por ejemplo: "62611" o "seis dos seis once".`,
        );
      }
    } catch (err: unknown) {
      const mensaje = mensajeError(err);
      if (!mensaje.includes('cancelado') && !mensaje.includes('CANCELADO')) {
        Alert.alert('Dictado por voz', mensaje);
      }
    } finally {
      setEscuchandoOp(false);
    }
  }

  /** Valida OP y máquina antes de abrir un segmento nuevo. */
  function datosCompletos(): boolean {
    if (!op.trim()) {
      Alert.alert(
        'Falta la OP',
        'Dicta el número de orden de producción usando el botón de audio.',
      );
      return false;
    }
    if (!maquina) {
      Alert.alert(
        'Falta la máquina',
        'Toca la máquina o puesto donde vas a trabajar.',
      );
      return false;
    }
    return true;
  }

  useEffect(() => {
    if (!segmento) {
      return;
    }
    const id = setInterval(() => {
      const totalSeg = Math.floor((Date.now() - segmento.inicioMs) / 1000);
      const min = String(Math.floor(totalSeg / 60)).padStart(2, '0');
      const seg = String(totalSeg % 60).padStart(2, '0');
      setElapsedLabel(`${min}:${seg}`);
    }, 1000);
    return () => clearInterval(id);
  }, [segmento]);

  function crearSegmentoLocal(
    categoria: string,
    actual?: SegmentoActivo | null,
  ): SegmentoActivo {
    siguienteSegmentoId.current += 1;
    return {
      id: siguienteSegmentoId.current,
      op: actual?.op || op.trim(),
      maquina: actual?.maquina || maquina,
      categoria,
      inicioMs: Date.now(),
    };
  }

  function sincronizarEnSegundoPlano(
    evento: ReporteEvento,
    alResponder?: (respuesta: RespuestaBackend) => void,
    clasificaConIA = false,
  ) {
    pendientesSync.current += 1;
    setSincronizando(true);
    if (clasificaConIA) {
      pendientesIA.current += 1;
      setIaPendiente(true);
    }

    colaSync.current = colaSync.current
      .catch(() => undefined)
      .then(() => enviarEvento(evento))
      .then(respuesta => {
        if (alResponder) alResponder(respuesta);
      })
      .catch(err => {
        // Si se agotaron los reintentos, este evento NO quedó en Sheets.
        // Antes esto se descartaba en silencio y el operario nunca se
        // enteraba de que faltaba una fila. Ahora se avisa y se puede
        // reintentar sin perder el registro.
        Alert.alert(
          'No se guardó en Sheets',
          `${mensajeError(err)}\n\nEl registro sigue en el celular. Revisa la conexión y toca "Reintentar".`,
          [
            { text: 'Descartar', style: 'destructive' },
            {
              text: 'Reintentar',
              onPress: () => sincronizarEnSegundoPlano(evento, alResponder, clasificaConIA),
            },
          ],
        );
      })
      .finally(() => {
        pendientesSync.current = Math.max(0, pendientesSync.current - 1);
        setSincronizando(pendientesSync.current > 0);
        if (clasificaConIA) {
          pendientesIA.current = Math.max(0, pendientesIA.current - 1);
          setIaPendiente(pendientesIA.current > 0);
        }
      });
  }

  function iniciarConCategoria(categoria: string) {
    if (!datosCompletos()) return;
    const nuevoSegmento = crearSegmentoLocal(categoria);
    setSegmento(nuevoSegmento);
    sincronizarEnSegundoPlano({
      cedula: operario.cedula,
      nombre: operario.nombre,
      op: nuevoSegmento.op,
      maquina: nuevoSegmento.maquina,
      abreNuevoSegmento: true,
      categoria,
    });
  }

  function iniciarConTexto(texto: string) {
    setModalVisible(null);
    if (!datosCompletos()) return;
    const preliminar = clasificarTextoLocal(texto);
    const nuevoSegmento = crearSegmentoLocal(preliminar.categoria);
    setSegmento(nuevoSegmento);
    sincronizarEnSegundoPlano(
      {
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: nuevoSegmento.op,
        maquina: nuevoSegmento.maquina,
        abreNuevoSegmento: true,
        texto,
      },
      respuesta => {
        if (respuesta.proveedor !== 'groq' || !respuesta.categoria) return;
        setSegmento(actual =>
          actual?.id === nuevoSegmento.id
            ? {
                ...actual,
                categoria: respuesta.categoria || preliminar.categoria,
              }
            : actual,
        );
        setClasificacion({
          categoria: respuesta.categoria,
          confianza: respuesta.confianza || '',
        });
      },
      true,
    );
  }

  function reportarNovedad(texto: string) {
    setModalVisible(null);
    if (!segmento) return;
    const anterior = segmento;
    const preliminar = clasificarTextoLocal(texto);
    const nuevoSegmento = crearSegmentoLocal(preliminar.categoria, anterior);
    setSegmento(nuevoSegmento);
    sincronizarEnSegundoPlano(
      {
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: anterior.op,
        maquina: anterior.maquina,
        categoriaCerrada: anterior.categoria,
        horasCerradas: (Date.now() - anterior.inicioMs) / 1000 / 3600,
        abreNuevoSegmento: true,
        texto,
      },
      respuesta => {
        if (respuesta.proveedor !== 'groq' || !respuesta.categoria) return;
        setSegmento(actual =>
          actual?.id === nuevoSegmento.id
            ? {
                ...actual,
                categoria: respuesta.categoria || preliminar.categoria,
              }
            : actual,
        );
        setClasificacion({
          categoria: respuesta.categoria,
          confianza: respuesta.confianza || '',
        });
      },
      true,
    );
  }

  function cambiarCategoriaSegmento(categoria: string) {
    if (!segmento) return;
    const anterior = segmento;
    const nuevoSegmento = crearSegmentoLocal(categoria, anterior);
    setSegmento(nuevoSegmento);
    sincronizarEnSegundoPlano({
      cedula: operario.cedula,
      nombre: operario.nombre,
      op: anterior.op,
      maquina: anterior.maquina,
      categoriaCerrada: anterior.categoria,
      horasCerradas: (Date.now() - anterior.inicioMs) / 1000 / 3600,
      abreNuevoSegmento: true,
      categoria,
    });
  }

  function finalizarOp() {
    if (!segmento) return;
    const anterior = segmento;
    setSegmento(null);
    setOp('');
    sincronizarEnSegundoPlano({
      cedula: operario.cedula,
      nombre: operario.nombre,
      op: anterior.op,
      maquina: anterior.maquina,
      categoriaCerrada: anterior.categoria,
      horasCerradas: (Date.now() - anterior.inicioMs) / 1000 / 3600,
      abreNuevoSegmento: false,
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {clasificacion && (
        <View
          style={[styles.bannerWrap, { top: insets.top + SPACE.sm }]}
          pointerEvents="box-none"
        >
          <BannerClasificacion
            categoria={clasificacion.categoria}
            confianza={clasificacion.confianza}
            onOcultar={() => setClasificacion(null)}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + SPACE.lg,
            paddingBottom: insets.bottom + SPACE.xxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View style={styles.header}>
          <View style={styles.headerMarca}>
            <Image
              source={require('../assets/logo-isotipo.jpg')}
              style={styles.logoIsotipo}
            />
            <Text style={styles.marca}>SUPERBRIX</Text>
          </View>
          <View style={styles.headerAcciones}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir resumen operativo"
              style={({ pressed }) => [
                styles.botonResumen,
                pressed && styles.botonPresionado,
              ]}
              onPress={() => {
                if (!maquinaResumen) {
                  Alert.alert(
                    'Selecciona una máquina',
                    'El resumen analiza únicamente la máquina en la que estás trabajando.',
                  );
                  return;
                }
                setResumenVisible(true);
              }}
            >
              <Icon name="insights" size={16} color={COLOR.brand} />
              <Text style={styles.botonResumenTexto}>Resumen</Text>
            </Pressable>
            <Pressable
              onPress={onCambiarOperario}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <Text style={styles.cambiar}>Cambiar</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.headerOperario}>
          <Text style={styles.saludo}>{operario.nombre}</Text>
          <Text style={styles.cedula}>CC {operario.cedula}</Text>
        </View>

        {!segmento ? (
          <View style={styles.card}>
            <Text style={styles.label}>Orden de producción (OP#)</Text>

            {/* --- INGRESO DE OP POR AUDIO (Voz nativa, cero fricción) --- */}
            {/* modoTecladoOp mantiene visible el campo mientras se escribe:
                sin esto, apenas se tecleaba el primer dígito `op` dejaba de
                estar vacío y la vista saltaba a la tarjeta "confirmada",
                perdiendo el TextInput a mitad de escritura. */}
            {!op.trim() || modoTecladoOp ? (
              <View style={styles.opCardVoz}>
                <Pressable
                  style={({ pressed }) => [
                    styles.btnVozOp,
                    escuchandoOp && styles.btnVozOpEscuchando,
                    pressed && styles.botonPresionado,
                  ]}
                  disabled={escuchandoOp}
                  onPress={capturarOpPorVoz}
                >
                  <View
                    style={[
                      styles.iconoVozWrap,
                      escuchandoOp && styles.iconoVozWrapEscuchando,
                    ]}
                  >
                    <Icon
                      name={escuchandoOp ? 'graphic-eq' : 'mic'}
                      size={28}
                      color="#ffffff"
                    />
                  </View>
                  <View style={styles.textoVozWrap}>
                    <Text style={styles.btnVozOpTitulo}>
                      {escuchandoOp
                        ? 'Escuchando tu voz…'
                        : 'Dictar OP por audio'}
                    </Text>
                    <Text style={styles.btnVozOpSubtitulo}>
                      {escuchandoOp
                        ? 'Di los números ahora (ej. "62611")'
                        : 'Toca aquí y di el número de orden'}
                    </Text>
                  </View>
                </Pressable>

                {/* Respaldo de contingencia: solo si no hay micrófono o hay ruido extremo */}
                {modoTecladoOp ? (
                  <View style={styles.modoTecladoWrap}>
                    <View style={styles.inputConIcono}>
                      <Icon
                        name="edit"
                        size={18}
                        color={COLOR.textFaint}
                        style={styles.inputIcono}
                      />
                      <TextInput
                        style={styles.inputTexto}
                        value={op}
                        onChangeText={v => {
                          setOp(v);
                          setOpPorVoz(false);
                        }}
                        placeholder="Escribe la OP (ej. 62611)"
                        placeholderTextColor={COLOR.textFaint}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        autoFocus
                        selectionColor={COLOR.brand}
                        onFocus={() => {
                          setTimeout(
                            () =>
                              scrollRef.current?.scrollTo({
                                y: 0,
                                animated: true,
                              }),
                            250,
                          );
                        }}
                        onSubmitEditing={() => {
                          Keyboard.dismiss();
                          if (op.trim()) setModoTecladoOp(false);
                        }}
                      />
                    </View>
                    <Pressable
                      style={styles.linkTeclado}
                      onPress={() => setModoTecladoOp(false)}
                    >
                      <Text style={styles.linkTecladoTexto}>
                        Ocultar teclado manual
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.linkTeclado}
                    onPress={() => setModoTecladoOp(true)}
                  >
                    <Icon name="keyboard" size={14} color={COLOR.textFaint} />
                    <Text style={styles.linkTecladoTexto}>
                      ¿No puedes usar el micrófono? Escribir a mano
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={styles.opConfirmadaCard}>
                <View style={styles.opConfirmadaInfo}>
                  <View style={styles.badgeVozWrap}>
                    <Icon name="check-circle" size={14} color={COLOR.success} />
                    <Text style={styles.opConfirmadaBadge}>
                      {opPorVoz ? 'Ingresada por voz' : 'Ingresada a mano'}
                    </Text>
                  </View>
                  <Text style={styles.opConfirmadaNumero}>OP# {op}</Text>
                </View>
                <View style={styles.opConfirmadaAcciones}>
                  <Pressable
                    style={styles.opAccionBoton}
                    onPress={capturarOpPorVoz}
                    disabled={escuchandoOp}
                  >
                    <Icon name="mic" size={16} color={COLOR.brand} />
                    <Text style={styles.opAccionBotonTexto}>Cambiar</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.opAccionBoton, styles.opAccionBorrar]}
                    onPress={() => {
                      setOp('');
                      setOpPorVoz(false);
                    }}
                  >
                    <Icon name="close" size={16} color={COLOR.textMuted} />
                    <Text
                      style={[
                        styles.opAccionBotonTexto,
                        { color: COLOR.textMuted },
                      ]}
                    >
                      Borrar
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={styles.labelConEspacio}>Máquina / puesto</Text>
            <View style={styles.chips}>
              {MAQUINAS.map(m => (
                <Pressable
                  key={m}
                  style={[styles.chip, maquina === m && styles.chipActivo]}
                  onPress={() => elegirMaquina(m)}
                >
                  <Text
                    style={[
                      styles.chipTexto,
                      maquina === m && styles.chipTextoActivo,
                    ]}
                  >
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divisor} />

            {/* Nivel 1 — primaria: la acción principal de arranque. */}
            <BotonAccion
              icono="play-arrow"
              texto="Iniciar Producción Activa"
              variante="primaria"
              onPress={() => iniciarConCategoria('Producción Activa')}
            />

            {/* Nivel 2 — secundarias: alternativas rápidas sin escribir. */}
            <View style={styles.filaSecundarias}>
              <BotonAccion
                icono="build"
                texto="Setup"
                variante="secundaria"
                estiloExtra={styles.mitad}
                onPress={() => iniciarConCategoria(CATEGORIA_SETUP)}
              />
              <BotonAccion
                icono="mic"
                texto="Otra actividad"
                variante="secundaria"
                estiloExtra={styles.mitad}
                onPress={() => setModalVisible('inicio')}
              />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.filaOp}>
              <View style={styles.filaOpInfo}>
                <Text style={styles.label}>OP en curso</Text>
                <Text style={styles.opActiva}>OP# {segmento.op}</Text>
                <Text style={styles.maquinaActiva}>{segmento.maquina}</Text>
              </View>
              <View
                style={[
                  styles.pillCategoria,
                  {
                    borderColor: colorCategoria(segmento.categoria),
                    backgroundColor: colorCategoria(segmento.categoria) + '1A',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillCategoriaTexto,
                    { color: colorCategoria(segmento.categoria) },
                  ]}
                  numberOfLines={2}
                >
                  {segmento.categoria}
                </Text>
              </View>
            </View>

            <Text style={styles.timer}>{elapsedLabel}</Text>

            {/* Nivel 1 — primaria: reportar novedad por voz. */}
            <BotonAccion
              icono="mic"
              texto="Pausar / reportar novedad"
              variante="primaria"
              onPress={() => setModalVisible('novedad')}
            />

            {/* Respaldo: 1 toque directo sin pasar por texto ni IA. */}
            <Text style={styles.subLabelCentrado}>
              ¿No quieres hablar? Toca la causa directa
            </Text>
            <View style={styles.filaCausasRapidas}>
              {CAUSAS_RAPIDAS.map(c => (
                <Pressable
                  key={c.categoria}
                  style={styles.causaRapida}
                  onPress={() => cambiarCategoriaSegmento(c.categoria)}
                >
                  <Icon name={c.icono} size={18} color={COLOR.textMuted} />
                  <Text style={styles.causaRapidaTexto} numberOfLines={1}>
                    {c.etiqueta}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Nivel 2 — secundaria: salir un momento / reanudar. */}
            {segmento.categoria === CATEGORIA_AUSENCIA ? (
              <BotonAccion
                icono="play-arrow"
                texto="Volví, reanudar Producción Activa"
                variante="secundaria"
                estiloExtra={styles.botonConEspacio}
                onPress={() => cambiarCategoriaSegmento('Producción Activa')}
              />
            ) : (
              <BotonAccion
                icono="exit-to-app"
                texto="Salgo un momento"
                variante="secundaria"
                estiloExtra={styles.botonConEspacio}
                onPress={() => cambiarCategoriaSegmento(CATEGORIA_AUSENCIA)}
              />
            )}

            <View style={styles.divisor} />

            {/* Nivel 3 — terciaria: cierre de la OP. */}
            <BotonAccion
              icono="stop-circle"
              texto="Finalizar OP"
              variante="terciaria"
              colorTerciaria={COLOR.danger}
              onPress={finalizarOp}
            />
          </View>
        )}

        {sincronizando && (
          <View style={styles.esperaWrap}>
            <ActivityIndicator size="small" color={COLOR.brand} />
            <Text style={styles.esperaTexto}>
              {iaPendiente
                ? 'IA actualizando la categoría en segundo plano…'
                : 'Sincronizando con Sheets…'}
            </Text>
          </View>
        )}
      </ScrollView>

      <TextoModal
        visible={modalVisible === 'inicio'}
        titulo="¿Qué vas a hacer?"
        placeholder='Ej. "Voy a hacer el alistamiento de la fresadora"'
        onCancelar={() => setModalVisible(null)}
        onConfirmar={iniciarConTexto}
      />
      <TextoModal
        visible={modalVisible === 'novedad'}
        titulo="Cuéntanos qué pasó"
        placeholder='Ej. "Paré la fresadora porque estoy esperando la broca de 1/2 pulgada"'
        onCancelar={() => setModalVisible(null)}
        onConfirmar={reportarNovedad}
      />
      <ResumenScreen
        visible={resumenVisible}
        operario={operario}
        maquina={maquinaResumen}
        onCerrar={() => setResumenVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF8F3' },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.xxl,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerMarca: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  headerAcciones: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  logoIsotipo: { width: 20, height: 20, borderRadius: 5 },
  marca: {
    color: COLOR.textFaint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  botonResumen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACE.sm + 2,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.brandTint,
    borderWidth: 1,
    borderColor: '#F4D1AC',
  },
  botonResumenTexto: {
    color: COLOR.brandDark,
    fontSize: 11,
    fontWeight: '800',
  },
  cambiar: { color: COLOR.brand, fontSize: 13, fontWeight: '700' },
  headerOperario: { marginTop: SPACE.sm, marginBottom: SPACE.xl },
  saludo: { color: COLOR.text, fontSize: 20, fontWeight: '800' },
  cedula: { color: COLOR.textMuted, fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    borderWidth: 1,
    borderColor: COLOR.border,
    shadowColor: COLOR.ink,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  label: { color: COLOR.textMuted, fontSize: 13, marginBottom: SPACE.sm },
  labelConEspacio: {
    color: COLOR.textMuted,
    fontSize: 13,
    marginBottom: SPACE.sm,
    marginTop: SPACE.xl,
  },
  subLabelCentrado: {
    color: COLOR.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
  },

  // --- Estilos de Captura de OP por Voz ---
  opCardVoz: {
    gap: SPACE.sm,
  },
  btnVozOp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.brand,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.md + 2,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
    shadowColor: COLOR.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnVozOpEscuchando: {
    backgroundColor: COLOR.warn,
  },
  iconoVozWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconoVozWrapEscuchando: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  textoVozWrap: {
    flex: 1,
  },
  btnVozOpTitulo: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnVozOpSubtitulo: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  linkTeclado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACE.xs,
    marginTop: 2,
  },
  linkTecladoTexto: {
    color: COLOR.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  modoTecladoWrap: {
    marginTop: SPACE.xs,
    gap: SPACE.xs,
  },
  opConfirmadaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderWidth: 1.5,
    borderColor: COLOR.brandTint,
    borderLeftWidth: 4,
    borderLeftColor: COLOR.brand,
  },
  opConfirmadaInfo: {
    flex: 1,
  },
  badgeVozWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  opConfirmadaBadge: {
    color: COLOR.success,
    fontSize: 11,
    fontWeight: '700',
  },
  opConfirmadaNumero: {
    color: COLOR.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  opConfirmadaAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  opAccionBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACE.xs + 2,
    paddingHorizontal: SPACE.sm + 2,
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  opAccionBorrar: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  opAccionBotonTexto: {
    color: COLOR.brand,
    fontSize: 12,
    fontWeight: '700',
  },

  inputConIcono: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLOR.border,
    paddingHorizontal: SPACE.md,
  },
  inputIcono: { marginRight: SPACE.xs },
  inputTexto: {
    flex: 1,
    paddingVertical: SPACE.md,
    fontSize: 16,
    color: COLOR.text,
  },
  divisor: {
    height: 1,
    backgroundColor: COLOR.border,
    marginVertical: SPACE.xl,
  },
  filaCausasRapidas: { flexDirection: 'row', gap: SPACE.sm },
  causaRapida: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.bgElevated,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  causaRapidaTexto: { color: COLOR.textMuted, fontSize: 11, fontWeight: '600' },
  filaSecundarias: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  mitad: { flex: 1 },
  boton: {
    borderRadius: RADIUS.sm,
    padding: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  boton_primaria: { backgroundColor: COLOR.brand },
  boton_secundaria: {
    backgroundColor: COLOR.bg,
    borderWidth: 1.5,
    borderColor: COLOR.borderStrong,
  },
  boton_terciaria: {
    backgroundColor: 'transparent',
    paddingVertical: SPACE.sm,
    minHeight: 0,
  },
  botonPresionado: { opacity: 0.75 },
  botonDeshabilitado: { opacity: 0.4 },
  botonConEspacio: { marginTop: SPACE.sm },
  botonIcono: { marginRight: SPACE.sm },
  botonTexto: {
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
  },
  botonTextoTerciaria: { fontSize: 13, fontWeight: '600' },
  bannerWrap: {
    position: 'absolute',
    left: SPACE.xl,
    right: SPACE.xl,
    zIndex: 20,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    backgroundColor: COLOR.bgElevated,
    borderWidth: 1,
    borderColor: COLOR.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActivo: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipTexto: { color: COLOR.textMuted, fontSize: 14 },
  chipTextoActivo: { color: '#ffffff', fontWeight: '700' },
  filaOp: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  filaOpInfo: { flex: 1 },
  pillCategoria: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.md,
    maxWidth: 150,
  },
  pillCategoriaTexto: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  maquinaActiva: { color: COLOR.textMuted, fontSize: 14, marginTop: 2 },
  opActiva: {
    color: COLOR.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  timer: {
    color: COLOR.text,
    fontSize: 44,
    fontWeight: '200',
    marginTop: SPACE.xl,
    marginBottom: SPACE.lg,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  esperaWrap: { marginTop: SPACE.lg, alignItems: 'center' },
  esperaTexto: { color: COLOR.textMuted, fontSize: 13, marginTop: SPACE.sm },
});
