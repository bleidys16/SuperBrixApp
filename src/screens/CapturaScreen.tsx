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
  Animated,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Operario, guardarMaquina, obtenerMaquina } from '../storage';
import { enviarEvento, ReporteEvento, RespuestaBackend } from '../api';
import TextoModal from '../components/TextoModal';
import BannerClasificacion from '../components/BannerClasificacion';
import ResumenScreen from './ResumenScreen';
import { ANDON, COLOR, FONT, RADIUS, SPACE } from '../theme';
import { dictarAudio } from '../nativo/voz';
import { extraerNumeroOp } from '../utils/numeroVoz';
import ModalEscanerOP from '../components/ModalEscanerOP';

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

// Puestos de trabajo de la planta; se eligen con un solo toque, organizados en cuadrícula ergonómica.
const MAQUINAS: Array<{ id: string; nombre: string; icono: string }> = [
  { id: 'Fresadora CNC', nombre: 'Fresadora CNC', icono: 'precision-manufacturing' },
  { id: 'Torno', nombre: 'Torno', icono: 'settings' },
  { id: 'Soldadora MIG', nombre: 'Soldadora MIG', icono: 'flash-on' },
  { id: 'Prensa dobladora', nombre: 'Prensa dobladora', icono: 'compress' },
  { id: 'Cortadora plasma', nombre: 'Cortadora plasma', icono: 'electric-bolt' },
  { id: 'Ensamble', nombre: 'Ensamble', icono: 'handyman' },
  { id: 'Pintura', nombre: 'Pintura', icono: 'format-paint' },
];

const CATEGORIA_SETUP = 'Alistamiento y Preparación (Setup)';
const CATEGORIA_AUSENCIA = 'Ausencia del Operario / Descanso';

/**
 * Tarjetas 2x2 diseñadas para manipulación con guantes de carnaza en taller.
 * Con 1 toque directo el operario cambia el estado sin teclear ni hablar.
 */
const TARJETAS_PARADA = [
  {
    categoria: 'Falla Técnica / Mantenimiento',
    etiqueta: 'Falla Máquina',
    subtitulo: 'Mecánica o eléctrica',
    icono: 'build',
    tipo: 'falla' as const,
  },
  {
    categoria: 'Espera de Materiales / Logística',
    etiqueta: 'Falta Material',
    subtitulo: 'Piezas, insumos o grúa',
    icono: 'inventory-2',
    tipo: 'material' as const,
  },
  {
    categoria: CATEGORIA_SETUP,
    etiqueta: 'Setup / Ajuste',
    subtitulo: 'Calibración o mordaza',
    icono: 'tune',
    tipo: 'setup' as const,
  },
  {
    categoria: CATEGORIA_AUSENCIA,
    etiqueta: 'Salgo del Puesto',
    subtitulo: 'Pausa activa o baño',
    icono: 'directions-walk',
    tipo: 'pausa' as const,
  },
] as const;

function obtenerEstiloAndon(categoria: string) {
  if (categoria === 'Producción Activa') {
    return {
      andon: ANDON.produccion,
      icono: 'precision-manufacturing',
      etiquetaEstado: 'PRODUCCIÓN EN CURSO',
      esProduccion: true,
    };
  }
  if (categoria.includes('Falla') || categoria.includes('Mantenimiento')) {
    return {
      andon: ANDON.falla,
      icono: 'warning',
      etiquetaEstado: 'PARO TÉCNICO',
      esProduccion: false,
    };
  }
  if (categoria.includes('Material') || categoria.includes('Logística')) {
    return {
      andon: ANDON.material,
      icono: 'inventory-2',
      etiquetaEstado: 'ESPERA DE MATERIAL',
      esProduccion: false,
    };
  }
  if (categoria.includes('Setup') || categoria.includes('Alistamiento')) {
    return {
      andon: ANDON.setup,
      icono: 'tune',
      etiquetaEstado: 'ALISTAMIENTO (SETUP)',
      esProduccion: false,
    };
  }
  return {
    andon: ANDON.pausa,
    icono: 'pause-circle-filled',
    etiquetaEstado: 'PAUSA / NOVEDAD',
    esProduccion: false,
  };
}

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
    proveedor?: string;
    tiempoMs?: number;
  } | null>(null);
  const pulsoAnim = useRef(new Animated.Value(1)).current;
  const pulsoOpacidad = useRef(new Animated.Value(0.35)).current;
  const colonOpacidadAnim = useRef(new Animated.Value(1)).current;
  const siguienteSegmentoId = useRef(1);
  const colaSync = useRef<Promise<void>>(Promise.resolve());
  const pendientesSync = useRef(0);
  const pendientesIA = useRef(0);
  const maquinaResumen = segmento?.maquina || maquina;

  // --- Captura de OP por Voz y Código QR/Barras ---
  const [escuchandoOp, setEscuchandoOp] = useState(false);
  const [modoTecladoOp, setModoTecladoOp] = useState(false);
  const [opPorVoz, setOpPorVoz] = useState(false);
  const [opPorQr, setOpPorQr] = useState(false);
  const [opDetallePieza, setOpDetallePieza] = useState('');
  const [modalEscanerVisible, setModalEscanerVisible] = useState(false);

  useEffect(() => {
    obtenerMaquina().then(setMaquina);
  }, []);

  function elegirMaquina(m: string) {
    setMaquina(m);
    guardarMaquina(m);
  }

  function alEscanearOp(numero: string, descripcion?: string) {
    setOp(numero);
    setModoTecladoOp(false);
    setOpPorQr(true);
    setOpPorVoz(false);
    setOpDetallePieza(descripcion || '');
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
        setOpPorQr(false);
        setOpDetallePieza('');
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

  // Animaciones continuas: pulso luminoso Andon, parpadeo de dos puntos y halo del cronómetro
  useEffect(() => {
    if (!segmento) {
      return;
    }
    const loopAndon = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulsoAnim, {
            toValue: 1.45,
            duration: 1100,
            useNativeDriver: true,
          }),
          Animated.timing(pulsoAnim, {
            toValue: 1,
            duration: 1100,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulsoOpacidad, {
            toValue: 0.85,
            duration: 1100,
            useNativeDriver: true,
          }),
          Animated.timing(pulsoOpacidad, {
            toValue: 0.25,
            duration: 1100,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const loopColon = Animated.loop(
      Animated.sequence([
        Animated.timing(colonOpacidadAnim, {
          toValue: 0.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(colonOpacidadAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );

    loopAndon.start();
    loopColon.start();
    return () => {
      loopAndon.stop();
      loopColon.stop();
    };
  }, [segmento, pulsoAnim, pulsoOpacidad, colonOpacidadAnim]);

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
          proveedor: respuesta.proveedor,
          tiempoMs: respuesta.tiempoClasificacionMs,
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
          proveedor: respuesta.proveedor,
          tiempoMs: respuesta.tiempoClasificacionMs,
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
    Alert.alert(
      '¿Finalizar Orden de Producción?',
      `Se cerrará la OP #${segmento.op} en ${segmento.maquina} y se guardará el tiempo acumulado en Google Sheets.`,
      [
        { text: 'Continuar trabajando', style: 'cancel' },
        {
          text: 'Sí, finalizar OP',
          style: 'destructive',
          onPress: () => {
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
          },
        },
      ],
    );
  }

  function confirmarSalir() {
    Alert.alert(
      'Cerrar sesión',
      `¿Deseas salir del turno de ${operario.nombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: onCambiarOperario,
        },
      ],
    );
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
            proveedor={clasificacion.proveedor}
            tiempoMs={clasificacion.tiempoMs}
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
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión y salir"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [
                styles.botonSalir,
                pressed && styles.botonPresionado,
              ]}
              onPress={confirmarSalir}
            >
              <Icon name="logout" size={17} color={COLOR.textMuted} />
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
                <View style={styles.filaAccionesOp}>
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

                  <Pressable
                    style={({ pressed }) => [
                      styles.btnEscanerOp,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={() => setModalEscanerVisible(true)}
                  >
                    <View style={styles.iconoEscanerWrap}>
                      <Icon name="qr-code-scanner" size={26} color={COLOR.brandDark} />
                    </View>
                    <View style={styles.textoVozWrap}>
                      <Text style={styles.btnEscanerOpTitulo}>
                        Escanear tarjeta física
                      </Text>
                      <Text style={styles.btnEscanerOpSubtitulo}>
                        Lector de código de barras o QR
                      </Text>
                    </View>
                  </Pressable>
                </View>

                {/* Respaldo ordenado y limpio para ingreso con teclado */}
                {modoTecladoOp ? (
                  <View style={styles.modoTecladoWrap}>
                    <View style={styles.inputConIcono}>
                      <Icon
                        name="edit"
                        size={18}
                        color={COLOR.brand}
                        style={styles.inputIcono}
                      />
                      <TextInput
                        style={styles.inputTexto}
                        value={op}
                        onChangeText={v => {
                          setOp(v);
                          setOpPorVoz(false);
                          setOpPorQr(false);
                          setOpDetallePieza('');
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
                      {op.trim() ? (
                        <Pressable
                          style={styles.btnConfirmarTeclado}
                          onPress={() => {
                            Keyboard.dismiss();
                            setModoTecladoOp(false);
                          }}
                        >
                          <Text style={styles.btnConfirmarTecladoTexto}>Listo</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable
                      style={styles.btnOcultarTeclado}
                      onPress={() => setModoTecladoOp(false)}
                    >
                      <Icon name="close" size={14} color={COLOR.textMuted} />
                      <Text style={styles.btnOcultarTecladoTexto}>
                        Cancelar teclado manual
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnTecladoOpcion,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={() => setModoTecladoOp(true)}
                  >
                    <Icon name="keyboard" size={17} color={COLOR.textMuted} />
                    <Text style={styles.btnTecladoOpcionTexto}>
                      O escribir número de OP con teclado
                    </Text>
                    <Icon name="chevron-right" size={16} color={COLOR.textFaint} />
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={styles.opConfirmadaCard}>
                {/* Encabezado: Badge de origen + botón circular de borrar (X) */}
                <View style={styles.opConfirmadaHeader}>
                  <View style={styles.opConfirmadaBadgeWrap}>
                    <Icon
                      name={opPorQr ? 'qr-code-2' : opPorVoz ? 'mic' : 'check-circle'}
                      size={14}
                      color={COLOR.success}
                    />
                    <Text style={styles.opConfirmadaBadge}>
                      {opPorQr
                        ? 'Escaneada con Tarjeta (QR)'
                        : opPorVoz
                        ? 'Ingresada por voz'
                        : 'Ingresada con teclado'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Borrar número de orden"
                    style={({ pressed }) => [
                      styles.btnBorrarOpCircular,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={() => {
                      setOp('');
                      setOpPorVoz(false);
                      setOpPorQr(false);
                      setOpDetallePieza('');
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="close" size={16} color={COLOR.textMuted} />
                  </Pressable>
                </View>

                {/* Cuerpo: OP# grande y pieza */}
                <View style={styles.opConfirmadaCuerpo}>
                  <Text style={styles.opConfirmadaNumero}>OP# {op}</Text>
                  {opDetallePieza ? (
                    <View style={styles.opPiezaWrap}>
                      <Icon name="build" size={13} color={COLOR.brandDark} />
                      <Text style={styles.opConfirmadaDetallePieza}>
                        {opDetallePieza}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Acciones de cambio ordenadas sin desbordamiento */}
                <View style={styles.opConfirmadaAccionesFila}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.opAccionPill,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={() => setModalEscanerVisible(true)}
                  >
                    <Icon name="qr-code-scanner" size={15} color={COLOR.brandDark} />
                    <Text style={styles.opAccionPillTexto}>Cambiar por QR</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.opAccionPill,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={capturarOpPorVoz}
                    disabled={escuchandoOp}
                  >
                    <Icon name="mic" size={15} color={COLOR.brandDark} />
                    <Text style={styles.opAccionPillTexto}>
                      {escuchandoOp ? 'Escuchando...' : 'Cambiar por voz'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={styles.labelConEspacio}>Máquina / puesto</Text>
            <View style={styles.maquinasGrid}>
              {MAQUINAS.map((m, index) => {
                const seleccionada = maquina === m.nombre;
                const esUltimo =
                  index === MAQUINAS.length - 1 && MAQUINAS.length % 2 !== 0;
                return (
                  <Pressable
                    key={m.id}
                    style={({ pressed }) => [
                      styles.tarjetaMaquina,
                      esUltimo && styles.tarjetaMaquinaAnchoCompleto,
                      seleccionada && styles.tarjetaMaquinaActiva,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={() => elegirMaquina(m.nombre)}
                  >
                    <View
                      style={[
                        styles.tarjetaMaquinaIconoWrap,
                        seleccionada && styles.tarjetaMaquinaIconoWrapActiva,
                      ]}
                    >
                      <Icon
                        name={m.icono}
                        size={19}
                        color={seleccionada ? '#ffffff' : COLOR.brandDark}
                      />
                    </View>
                    <Text
                      style={[
                        styles.tarjetaMaquinaTexto,
                        seleccionada && styles.tarjetaMaquinaTextoActivo,
                      ]}
                      numberOfLines={1}
                    >
                      {m.nombre}
                    </Text>
                    {seleccionada ? (
                      <Icon
                        name="check-circle"
                        size={17}
                        color={COLOR.brand}
                        style={styles.tarjetaMaquinaCheck}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
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
          (() => {
            const estiloAndon = obtenerEstiloAndon(segmento.categoria);
            const partesTiempo = (elapsedLabel || '00:00').split(':');
            const minutosReloj = partesTiempo[0] || '00';
            const segundosReloj = partesTiempo[1] || '00';
            return (
              <View
                style={[
                  styles.card,
                  styles.cardAndon,
                  {
                    borderColor: estiloAndon.andon.border,
                    borderLeftColor: estiloAndon.andon.border,
                    borderRightColor: estiloAndon.andon.border,
                    borderTopColor: estiloAndon.andon.border,
                    borderBottomColor: estiloAndon.andon.border,
                    backgroundColor: estiloAndon.andon.bg,
                  },
                ]}
              >
                {/* Header Andon: Status pill with breathing pulse dot + OP and Machine */}
                <View style={styles.andonHeader}>
                  <View style={styles.filaOpInfo}>
                    <Text style={styles.andonOpLabel}>ORDEN EN CURSO</Text>
                    <Text style={styles.opActiva}>OP# {segmento.op}</Text>
                    <View style={styles.maquinaBadgeWrap}>
                      <Icon
                        name="precision-manufacturing"
                        size={15}
                        color={COLOR.textMuted}
                      />
                      <Text style={styles.maquinaActiva}>
                        {segmento.maquina}
                      </Text>
                    </View>
                  </View>

                  {/* Badge Andon con pulso luminoso */}
                  <View
                    style={[
                      styles.andonBadge,
                      {
                        backgroundColor: estiloAndon.andon.badgeBg,
                        borderColor: estiloAndon.andon.border,
                      },
                    ]}
                  >
                    <View style={styles.pulsoContenedor}>
                      <Animated.View
                        style={[
                          styles.pulsoHalo,
                          {
                            backgroundColor: estiloAndon.andon.border,
                            transform: [{ scale: pulsoAnim }],
                            opacity: pulsoOpacidad,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.pulsoPunto,
                          { backgroundColor: estiloAndon.andon.border },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.andonBadgeTexto,
                        { color: estiloAndon.andon.badgeTexto },
                      ]}
                      numberOfLines={1}
                    >
                      {estiloAndon.etiquetaEstado}
                    </Text>
                  </View>
                </View>

                {/* Temporizador Cockpit Digital de Alta Precisión con Animaciones */}
                <View
                  style={[
                    styles.timerCockpitContenedor,
                    {
                      borderColor: estiloAndon.andon.border,
                      borderLeftColor: estiloAndon.andon.border,
                      borderRightColor: estiloAndon.andon.border,
                      borderTopColor: estiloAndon.andon.border,
                      borderBottomColor: estiloAndon.andon.border,
                    },
                  ]}
                >
                  {/* Encabezado del cronómetro con badge de estado en vivo */}
                  <View style={styles.timerCockpitHeader}>
                    <View style={styles.timerLiveIndicadorWrap}>
                      <View style={styles.pulsoContenedor}>
                        <Animated.View
                          style={[
                            styles.pulsoHalo,
                            {
                              backgroundColor: estiloAndon.andon.border,
                              transform: [{ scale: pulsoAnim }],
                              opacity: pulsoOpacidad,
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.pulsoPunto,
                            { backgroundColor: estiloAndon.andon.border },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.timerCockpitTitulo,
                          { color: estiloAndon.andon.texto },
                        ]}
                      >
                        TIEMPO TRANSCURRIDO
                      </Text>
                    </View>
                  </View>

                  {/* Display digital cockpit con dígitos separados y dos puntos parpadeantes */}
                  <View style={styles.timerDisplayWrap}>
                    {/* Bloque Minutos */}
                    <View style={styles.timerBloqueTiempo}>
                      <View
                        style={[
                          styles.timerCajaDigitos,
                          {
                            borderColor: estiloAndon.andon.border,
                            backgroundColor: estiloAndon.andon.bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.timerDigitos,
                            { color: estiloAndon.andon.texto },
                          ]}
                        >
                          {minutosReloj}
                        </Text>
                      </View>
                      <Text style={styles.timerUnidadLabel}>MINUTOS</Text>
                    </View>

                    {/* Separador animado de dos puntos con parpadeo rítmico */}
                    <Animated.View
                      style={[
                        styles.timerSeparadorWrap,
                        { opacity: colonOpacidadAnim },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timerSeparadorTexto,
                          { color: estiloAndon.andon.border },
                        ]}
                      >
                        :
                      </Text>
                    </Animated.View>

                    {/* Bloque Segundos */}
                    <View style={styles.timerBloqueTiempo}>
                      <View
                        style={[
                          styles.timerCajaDigitos,
                          {
                            borderColor: estiloAndon.andon.border,
                            backgroundColor: estiloAndon.andon.bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.timerDigitos,
                            { color: estiloAndon.andon.texto },
                          ]}
                        >
                          {segundosReloj}
                        </Text>
                      </View>
                      <Text style={styles.timerUnidadLabel}>SEGUNDOS</Text>
                    </View>
                  </View>
                </View>

                {/* CAMBIO 2: Si NO está en producción (falla, material, setup, descanso),
                    BOTÓN MASIVO DE REANUDAR PRODUCCIÓN para volver con 1 solo toque */}
                {!estiloAndon.esProduccion ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnReanudarMasivo,
                      pressed && styles.botonPresionado,
                    ]}
                    onPress={() => cambiarCategoriaSegmento('Producción Activa')}
                  >
                    <View style={styles.btnReanudarIconoWrap}>
                      <Icon name="play-arrow" size={32} color="#ffffff" />
                    </View>
                    <View style={styles.btnReanudarTextoWrap}>
                      <Text style={styles.btnReanudarTitulo}>
                        ¡Listo, Reanudar Producción!
                      </Text>
                      <Text style={styles.btnReanudarSubtitulo}>
                        Toca aquí para volver a marcar tiempo activo
                      </Text>
                    </View>
                    <Icon name="arrow-forward" size={24} color="#ffffff" />
                  </Pressable>
                ) : null}

                {/* CAMBIO 3: Tarjetas 2x2 para Guantes de Carnaza */}
                <Text style={styles.seccionParadasTitulo}>
                  {estiloAndon.esProduccion
                    ? '¿Ocurrió alguna parada o novedad?'
                    : 'O cambia la causa de la parada:'}
                </Text>

                <View style={styles.gridTarjetasParada}>
                  {TARJETAS_PARADA.map(item => {
                    const esSeleccionado = segmento.categoria === item.categoria;
                    const andonItem = ANDON[item.tipo];
                    return (
                      <Pressable
                        key={item.categoria}
                        style={({ pressed }) => [
                          styles.tarjetaParada,
                          {
                            backgroundColor: esSeleccionado
                              ? andonItem.badgeBg
                              : COLOR.surface,
                            borderColor: esSeleccionado
                              ? andonItem.border
                              : COLOR.border,
                            borderWidth: esSeleccionado ? 2 : 1,
                          },
                          pressed && styles.botonPresionado,
                        ]}
                        onPress={() => cambiarCategoriaSegmento(item.categoria)}
                      >
                        <View style={styles.tarjetaParadaHeader}>
                          <View
                            style={[
                              styles.tarjetaParadaIconoWrap,
                              { backgroundColor: andonItem.badgeBg },
                            ]}
                          >
                            <Icon
                              name={item.icono}
                              size={20}
                              color={andonItem.texto}
                            />
                          </View>
                          {esSeleccionado && (
                            <View style={styles.badgeParadaActiva}>
                              <Text style={styles.badgeParadaActivaTexto}>
                                ACTIVO
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.tarjetaParadaTitulo} numberOfLines={1}>
                          {item.etiqueta}
                        </Text>
                        <Text
                          style={styles.tarjetaParadaSubtitulo}
                          numberOfLines={1}
                        >
                          {item.subtitulo}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Dictar otra novedad a la IA (Groq) */}
                <Pressable
                  style={({ pressed }) => [
                    styles.btnDictarIa,
                    pressed && styles.botonPresionado,
                  ]}
                  onPress={() => setModalVisible('novedad')}
                >
                  <View style={styles.btnDictarIaIconoWrap}>
                    <Icon name="mic" size={20} color={COLOR.brandDark} />
                  </View>
                  <View style={styles.btnDictarIaTextoWrap}>
                    <Text style={styles.btnDictarIaTitulo}>
                      Dictar otra novedad a la IA
                    </Text>
                    <Text style={styles.btnDictarIaSubtitulo}>
                      Clasifica automáticamente con Groq AI
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={COLOR.brandDark} />
                </Pressable>

                <View style={styles.divisorAndon} />

                {/* Finalizar OP */}
                <Pressable
                  style={({ pressed }) => [
                    styles.btnFinalizarOp,
                    pressed && styles.botonPresionado,
                  ]}
                  onPress={finalizarOp}
                >
                  <Icon name="stop-circle" size={18} color={COLOR.danger} />
                  <Text style={styles.btnFinalizarOpTexto}>
                    Finalizar Orden de Producción
                  </Text>
                </Pressable>
              </View>
            );
          })()
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
      <ModalEscanerOP
        visible={modalEscanerVisible}
        onCerrar={() => setModalEscanerVisible(false)}
        onDetectarOp={alEscanearOp}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF8F3' },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.xxl * 2,
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
  logoIsotipo: { width: 22, height: 22, borderRadius: 5 },
  marca: {
    color: COLOR.textFaint,
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
  },
  botonResumen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACE.sm + 2,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.brandTint,
    borderWidth: 1,
    borderColor: '#F4D1AC',
  },
  botonResumenTexto: {
    color: COLOR.brandDark,
    fontSize: 11,
    fontFamily: FONT.bold,
  },
  botonSalir: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOperario: { marginTop: SPACE.xs, marginBottom: SPACE.md },
  saludo: { color: COLOR.text, fontSize: 20, fontFamily: FONT.bold },
  cedula: { color: COLOR.textMuted, fontSize: 13, marginTop: 1, fontFamily: FONT.regular },
  card: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: COLOR.border,
    shadowColor: COLOR.ink,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  label: { color: COLOR.textMuted, fontSize: 13, marginBottom: SPACE.xs + 2, fontFamily: FONT.medium },
  labelConEspacio: {
    color: COLOR.textMuted,
    fontSize: 13,
    marginBottom: SPACE.xs + 2,
    marginTop: SPACE.md,
    fontFamily: FONT.medium,
  },
  subLabelCentrado: {
    color: COLOR.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.xs,
    fontFamily: FONT.regular,
  },

  // --- Estilos de Captura de OP por Voz ---
  opCardVoz: {
    gap: 8,
  },
  btnVozOp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.brand,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md + 2,
    gap: SPACE.md,
    shadowColor: COLOR.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  btnVozOpEscuchando: {
    backgroundColor: COLOR.warn,
  },
  iconoVozWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    fontSize: 15,
    fontFamily: FONT.bold,
    letterSpacing: 0.2,
  },
  btnVozOpSubtitulo: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    marginTop: 1,
    fontFamily: FONT.regular,
  },
  filaAccionesOp: {
    gap: 8,
  },
  btnEscanerOp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.brandTint,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md + 2,
    gap: SPACE.md,
    borderWidth: 1.5,
    borderColor: '#F4D1AC',
  },
  iconoEscanerWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLOR.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  btnEscanerOpTitulo: {
    color: COLOR.brandDark,
    fontSize: 15,
    fontFamily: FONT.bold,
  },
  btnEscanerOpSubtitulo: {
    color: COLOR.textMuted,
    fontSize: 12,
    marginTop: 1,
    fontFamily: FONT.regular,
  },

  // --- Barra de opción de teclado manual ---
  btnTecladoOpcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: SPACE.md,
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.border,
    marginTop: 2,
  },
  btnTecladoOpcionTexto: {
    color: COLOR.textMuted,
    fontSize: 13,
    fontFamily: FONT.medium,
  },
  modoTecladoWrap: {
    marginTop: 4,
    gap: 6,
  },
  btnConfirmarTeclado: {
    backgroundColor: COLOR.brand,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    marginLeft: SPACE.xs,
  },
  btnConfirmarTecladoTexto: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: FONT.bold,
  },
  btnOcultarTeclado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  btnOcultarTecladoTexto: {
    color: COLOR.textMuted,
    fontSize: 12,
    fontFamily: FONT.medium,
  },

  opConfirmadaCard: {
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderWidth: 1.5,
    borderColor: COLOR.brandTint,
    borderLeftWidth: 4,
    borderLeftColor: COLOR.brand,
    gap: SPACE.sm,
  },
  opConfirmadaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  opConfirmadaBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  opConfirmadaBadge: {
    color: COLOR.success,
    fontSize: 12,
    fontFamily: FONT.bold,
  },
  btnBorrarOpCircular: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opConfirmadaCuerpo: {
    paddingVertical: 2,
  },
  opConfirmadaNumero: {
    color: COLOR.text,
    fontSize: 26,
    fontFamily: FONT.bold,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  opPiezaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  opConfirmadaDetallePieza: {
    color: COLOR.brandDarker,
    fontSize: 13,
    fontFamily: FONT.medium,
  },
  opConfirmadaAccionesFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: 4,
  },
  opAccionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: SPACE.sm,
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  opAccionPillTexto: {
    color: COLOR.brandDark,
    fontSize: 12,
    fontFamily: FONT.bold,
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
    fontFamily: FONT.regular,
  },
  divisor: {
    height: 1,
    backgroundColor: COLOR.border,
    marginVertical: SPACE.md,
  },
  // --- Estilos Semáforo Andon y Tarjetas de Taller ---
  cardAndon: {
    borderWidth: 2,
    borderLeftWidth: 4,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  andonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  andonOpLabel: {
    color: COLOR.textMuted,
    fontSize: 11,
    fontFamily: FONT.bold,
    letterSpacing: 1,
  },
  maquinaBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  andonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  pulsoContenedor: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsoHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pulsoPunto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  andonBadgeTexto: {
    fontSize: 11,
    fontFamily: FONT.bold,
    letterSpacing: 0.4,
  },

  // --- Cronómetro Cockpit Digital Animado ---
  timerCockpitContenedor: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderLeftWidth: 2,
    shadowColor: COLOR.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  timerCockpitHeader: {
    marginBottom: SPACE.sm,
  },
  timerLiveIndicadorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  timerCockpitTitulo: {
    fontSize: 11,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
  },
  timerDisplayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timerBloqueTiempo: {
    alignItems: 'center',
  },
  timerCajaDigitos: {
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1.5,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerDigitos: {
    fontSize: 40,
    fontFamily: FONT.bold,
    letterSpacing: 1,
    textAlign: 'center',
    includeFontPadding: false,
  },
  timerUnidadLabel: {
    fontSize: 9,
    fontFamily: FONT.bold,
    color: COLOR.textMuted,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  timerSeparadorWrap: {
    paddingBottom: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerSeparadorTexto: {
    fontSize: 36,
    fontFamily: FONT.bold,
    textAlign: 'center',
    includeFontPadding: false,
  },

  // CAMBIO 2: Botón Masivo Reanudar Producción
  btnReanudarMasivo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.md + 2,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
    marginVertical: SPACE.sm,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnReanudarIconoWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnReanudarTextoWrap: {
    flex: 1,
  },
  btnReanudarTitulo: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: FONT.bold,
  },
  btnReanudarSubtitulo: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    marginTop: 2,
    fontFamily: FONT.regular,
  },

  // CAMBIO 3: Tarjetas 2x2 para Guantes de Carnaza
  seccionParadasTitulo: {
    color: COLOR.text,
    fontSize: 13,
    fontFamily: FONT.bold,
    marginTop: SPACE.md,
    marginBottom: SPACE.sm,
  },
  gridTarjetasParada: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    justifyContent: 'space-between',
  },
  tarjetaParada: {
    width: '48.5%',
    minHeight: 82,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    justifyContent: 'space-between',
    shadowColor: COLOR.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  tarjetaParadaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tarjetaParadaIconoWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeParadaActiva: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.ink,
  },
  badgeParadaActivaTexto: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: FONT.bold,
  },
  tarjetaParadaTitulo: {
    color: COLOR.text,
    fontSize: 13,
    fontFamily: FONT.bold,
  },
  tarjetaParadaSubtitulo: {
    color: COLOR.textMuted,
    fontSize: 10,
    marginTop: 2,
    fontFamily: FONT.regular,
  },

  // Botón dictar novedad a Groq AI
  btnDictarIa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderWidth: 1.5,
    borderColor: '#F4D1AC',
    gap: SPACE.md,
    marginTop: SPACE.md,
  },
  btnDictarIaIconoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLOR.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDictarIaTextoWrap: {
    flex: 1,
  },
  btnDictarIaTitulo: {
    color: COLOR.brandDark,
    fontSize: 13,
    fontFamily: FONT.bold,
  },
  btnDictarIaSubtitulo: {
    color: COLOR.textMuted,
    fontSize: 11,
    marginTop: 1,
    fontFamily: FONT.regular,
  },
  divisorAndon: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginVertical: SPACE.lg,
  },
  btnFinalizarOp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACE.sm,
  },
  btnFinalizarOpTexto: {
    color: COLOR.danger,
    fontSize: 13,
    fontFamily: FONT.bold,
  },

  filaSecundarias: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  mitad: { flex: 1 },
  boton: {
    borderRadius: RADIUS.sm,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
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
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: FONT.bold,
  },
  botonTextoTerciaria: { fontSize: 13, fontFamily: FONT.medium },
  bannerWrap: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
    zIndex: 20,
  },

  // --- Cuadrícula Ergonómica de Máquinas ---
  maquinasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  tarjetaMaquina: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: COLOR.border,
    minHeight: 52,
    gap: 8,
  },
  tarjetaMaquinaAnchoCompleto: {
    width: '100%',
  },
  tarjetaMaquinaActiva: {
    borderColor: COLOR.brand,
    backgroundColor: COLOR.brandTint,
    shadowColor: COLOR.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },
  tarjetaMaquinaIconoWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLOR.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tarjetaMaquinaIconoWrapActiva: {
    backgroundColor: COLOR.brand,
  },
  tarjetaMaquinaTexto: {
    flex: 1,
    color: COLOR.textMuted,
    fontSize: 13,
    fontFamily: FONT.medium,
  },
  tarjetaMaquinaTextoActivo: {
    color: COLOR.brandDarker,
    fontFamily: FONT.bold,
  },
  tarjetaMaquinaCheck: {
    marginLeft: 'auto',
  },

  filaOpInfo: { flex: 1 },
  maquinaActiva: { color: COLOR.textMuted, fontSize: 13, fontFamily: FONT.medium },
  opActiva: {
    color: COLOR.text,
    fontSize: 22,
    marginTop: 2,
    fontFamily: FONT.bold,
    letterSpacing: 0.5,
  },
  esperaWrap: { marginTop: SPACE.lg, alignItems: 'center' },
  esperaTexto: { color: COLOR.textMuted, fontSize: 13, marginTop: SPACE.sm, fontFamily: FONT.regular },
});
