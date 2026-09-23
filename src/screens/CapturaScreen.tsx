import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Operario, guardarMaquina, obtenerMaquina } from '../storage';
import { enviarEvento } from '../api';
import TextoModal from '../components/TextoModal';
import BannerClasificacion from '../components/BannerClasificacion';
import { colorCategoria } from '../categorias';
import { COLOR, RADIUS, SPACE } from '../theme';
import { useSensorVibracion, NivelSensibilidad } from '../hooks/useSensorVibracion';

interface Props {
  operario: Operario;
  onCambiarOperario: () => void;
}

interface SegmentoActivo {
  op: string;
  maquina: string;
  categoria: string;
  inicioMs: number;
}

// Puestos de trabajo de la planta; se eligen con un toque, sin escribir.
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
const CAUSAS_RAPIDAS: Array<{ categoria: string; icono: string; etiqueta: string }> = [
  { categoria: 'Falla Técnica / Mantenimiento', icono: 'build', etiqueta: 'Falla técnica' },
  { categoria: 'Espera de Materiales / Logística', icono: 'local-shipping', etiqueta: 'Espera material' },
  { categoria: CATEGORIA_SETUP, icono: 'settings', etiqueta: 'Setup' },
];

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Jerarquía de 3 niveles, para que el ojo sepa de un vistazo cuál es LA
 * acción de ese momento y cuáles son alternativas:
 *  - primaria: 1 sola, rellena de naranja, grande. La acción más probable.
 *  - secundaria: contorno, más chica, pensada para ir en fila (no apilada).
 *  - terciaria: texto simple, sin relleno ni borde, separada del resto.
 *    Para acciones raras o de cierre (ej. Finalizar OP) que no deben
 *    competir visualmente con el flujo principal.
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

function BotonAccion({ icono, texto, onPress, disabled, variante = 'primaria', colorTerciaria, estiloExtra }: BotonAccionProps) {
  const colorContenido =
    variante === 'primaria' ? '#ffffff' : variante === 'terciaria' ? colorTerciaria || COLOR.textMuted : COLOR.ink;
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
      onPress={onPress}>
      <Icon name={icono} size={variante === 'terciaria' ? 16 : 20} color={colorContenido} style={styles.botonIcono} />
      <Text
        style={[
          styles.botonTexto,
          variante === 'terciaria' && styles.botonTextoTerciaria,
          { color: colorContenido },
        ]}
        numberOfLines={2}>
        {texto}
      </Text>
    </Pressable>
  );
}

const NIVELES_SENSIBILIDAD: Array<{ valor: NivelSensibilidad; etiqueta: string }> = [
  { valor: 'suave', etiqueta: 'Suave' },
  { valor: 'medio', etiqueta: 'Medio' },
  { valor: 'fuerte', etiqueta: 'Fuerte' },
];

interface SensorPanelProps {
  activo: boolean;
  onToggle: () => void;
  sensibilidad: NivelSensibilidad;
  onSensibilidad: (n: NivelSensibilidad) => void;
  nivel: number;
  umbral: number;
  sinLecturas: boolean;
  estado?: string;
}

/**
 * Fase 2 del reto (sensores/cámaras) llevada al MVP: usa el acelerómetro
 * real del celular donde ya corre la app — mismo principio de "detectar
 * solo, sin que el operario toque nada", pero sin hardware nuevo.
 */
function SensorPanel({ activo, onToggle, sensibilidad, onSensibilidad, nivel, umbral, sinLecturas, estado }: SensorPanelProps) {
  const pct = Math.min(100, (nivel / (umbral * 2)) * 100);
  return (
    <View style={styles.sensorPanel}>
      <Pressable style={styles.sensorFilaToggle} onPress={onToggle}>
        <Icon name="sensors" size={18} color={activo ? COLOR.brand : COLOR.textMuted} />
        <Text style={styles.sensorTitulo}>Modo sensor (beta)</Text>
        <View style={[styles.sensorSwitch, activo && styles.sensorSwitchActivo]}>
          <View style={[styles.sensorSwitchBola, activo && styles.sensorSwitchBolaActiva]} />
        </View>
      </Pressable>
      {activo && (
        <View style={styles.sensorCuerpo}>
          {estado && <Text style={styles.sensorEstado}>{estado}</Text>}
          <View style={styles.sensorBarraFondo}>
            <View style={[styles.sensorBarraRelleno, { width: `${pct}%` }, nivel > umbral && styles.sensorBarraSobre]} />
          </View>
          {sinLecturas && (
            <Text style={styles.sensorAviso}>No se detecta el acelerómetro (¿estás en un emulador?)</Text>
          )}
          <View style={styles.filaSensibilidad}>
            {NIVELES_SENSIBILIDAD.map((n) => (
              <Pressable
                key={n.valor}
                style={[styles.chipSensibilidad, sensibilidad === n.valor && styles.chipSensibilidadActivo]}
                onPress={() => onSensibilidad(n.valor)}>
                <Text style={[styles.chipSensibilidadTexto, sensibilidad === n.valor && styles.chipTextoActivo]}>
                  {n.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function CapturaScreen({ operario, onCambiarOperario }: Props) {
  const insets = useSafeAreaInsets();
  const [op, setOp] = useState('');
  const [maquina, setMaquina] = useState('');
  const [segmento, setSegmento] = useState<SegmentoActivo | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Aparte de "enviando": solo se prende cuando el texto pasa por la IA, que
  // puede tardar varios segundos. Sirve para mostrar un mensaje que explique
  // la espera en vez de dejar solo un spinner sin contexto.
  const [clasificandoIA, setClasificandoIA] = useState(false);
  const [modalVisible, setModalVisible] = useState<'inicio' | 'novedad' | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState('00:00');
  const [clasificacion, setClasificacion] = useState<{ categoria: string; confianza: string } | null>(null);

  // --- Sensor de vibración (Fase 2: sensores + cámaras) -----------------
  // Detecta solo "vibra / no vibra" con el acelerómetro real del celular.
  // Es adicional al flujo manual, nunca lo reemplaza: si algo falla o se
  // apaga, los botones de siempre siguen funcionando exactamente igual.
  const [modoSensor, setModoSensor] = useState(false);
  const [sensibilidad, setSensibilidad] = useState<NivelSensibilidad>('suave');
  const [sensorPidiendoCausa, setSensorPidiendoCausa] = useState(false);

  const { nivel, umbral, sinLecturas } = useSensorVibracion({
    armado: modoSensor,
    sensibilidad,
    onArranque: () => {
      setSensorPidiendoCausa(false);
      if (!segmento) {
        if (datosCompletos()) {
          iniciarConCategoria('Producción Activa');
        }
      } else if (segmento.categoria !== 'Producción Activa') {
        cambiarCategoriaSegmento('Producción Activa');
      }
    },
    onParada: () => {
      if (segmento && segmento.categoria === 'Producción Activa') {
        setSensorPidiendoCausa(true);
      }
    },
  });

  useEffect(() => {
    obtenerMaquina().then(setMaquina);
  }, []);

  function elegirMaquina(m: string) {
    setMaquina(m);
    guardarMaquina(m);
  }

  /** Valida OP y máquina antes de abrir un segmento nuevo. */
  function datosCompletos(): boolean {
    if (!op.trim()) {
      Alert.alert('Falta la OP', 'Escribe el número de orden de producción (OP#).');
      return false;
    }
    if (!maquina) {
      Alert.alert('Falta la máquina', 'Toca la máquina o puesto donde vas a trabajar.');
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

  const horasSegmentoActual = () =>
    segmento ? (Date.now() - segmento.inicioMs) / 1000 / 3600 : undefined;

  async function iniciarConCategoria(categoria: string) {
    if (!datosCompletos()) {
      return;
    }
    setEnviando(true);
    try {
      await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: op.trim(),
        maquina,
        abreNuevoSegmento: true,
        categoria,
      });
      setSegmento({ op: op.trim(), maquina, categoria, inicioMs: Date.now() });
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function iniciarConTexto(texto: string) {
    setModalVisible(null);
    if (!datosCompletos()) {
      return;
    }
    setEnviando(true);
    setClasificandoIA(true);
    try {
      const resp = await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: op.trim(),
        maquina,
        abreNuevoSegmento: true,
        texto,
      });
      setSegmento({
        op: op.trim(),
        maquina,
        categoria: resp.categoria || 'Producción Activa',
        inicioMs: Date.now(),
      });
      if (resp.categoria) {
        setClasificacion({ categoria: resp.categoria, confianza: resp.confianza || '' });
      }
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
      setClasificandoIA(false);
    }
  }

  async function reportarNovedad(texto: string) {
    setModalVisible(null);
    if (!segmento) {
      return;
    }
    setEnviando(true);
    setClasificandoIA(true);
    try {
      const resp = await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: segmento.op,
        maquina: segmento.maquina,
        categoriaCerrada: segmento.categoria,
        horasCerradas: horasSegmentoActual(),
        abreNuevoSegmento: true,
        texto,
      });
      const nuevaCategoria = resp.categoria || 'Instrucciones / Coordinación';
      setSegmento({ ...segmento, categoria: nuevaCategoria, inicioMs: Date.now() });
      setClasificacion({ categoria: nuevaCategoria, confianza: resp.confianza || '' });
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
      setClasificandoIA(false);
    }
  }

  async function cambiarCategoriaSegmento(categoria: string) {
    if (!segmento) {
      return;
    }
    setEnviando(true);
    try {
      await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: segmento.op,
        maquina: segmento.maquina,
        categoriaCerrada: segmento.categoria,
        horasCerradas: horasSegmentoActual(),
        abreNuevoSegmento: true,
        categoria,
      });
      setSegmento({ ...segmento, categoria, inicioMs: Date.now() });
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function finalizarOp() {
    if (!segmento) {
      return;
    }
    setEnviando(true);
    try {
      await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: segmento.op,
        maquina: segmento.maquina,
        categoriaCerrada: segmento.categoria,
        horasCerradas: horasSegmentoActual(),
        abreNuevoSegmento: false,
      });
      setSegmento(null);
      setOp('');
      // Se apaga el sensor al cerrar la OP: la próxima OP necesita que el
      // operario confirme OP/máquina antes de dejar que algo arranque solo.
      setModoSensor(false);
      setSensorPidiendoCausa(false);
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.root}>
      {/* El banner flota sobre todo, pero respeta el notch/barra de estado
          real del celular (insets.top) en vez de un número fijo a ciegas. */}
      {clasificacion && (
        <View style={[styles.bannerWrap, { top: insets.top + SPACE.sm }]} pointerEvents="box-none">
          <BannerClasificacion
            categoria={clasificacion.categoria}
            confianza={clasificacion.confianza}
            onOcultar={() => setClasificacion(null)}
          />
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACE.lg }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerMarca}>
            <Image source={require('../assets/logo-isotipo.jpg')} style={styles.logoIsotipo} />
            <Text style={styles.marca}>SUPERBRIX</Text>
          </View>
          <Pressable
            onPress={onCambiarOperario}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <Text style={styles.cambiar}>Cambiar</Text>
          </Pressable>
        </View>
        <View style={styles.headerOperario}>
          <Text style={styles.saludo}>{operario.nombre}</Text>
          <Text style={styles.cedula}>CC {operario.cedula}</Text>
        </View>

        {!segmento ? (
          <View style={styles.card}>
            <Text style={styles.label}>Orden de producción (OP#)</Text>
            <View style={styles.inputConIcono}>
              <Icon name="search" size={18} color={COLOR.textFaint} style={styles.inputIcono} />
              <TextInput
                style={styles.inputTexto}
                value={op}
                onChangeText={setOp}
                placeholder="Ej. 62611"
                placeholderTextColor={COLOR.textFaint}
                keyboardType="number-pad"
              />
            </View>

            <Text style={styles.labelConEspacio}>Máquina / puesto</Text>
            <View style={styles.chips}>
              {MAQUINAS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, maquina === m && styles.chipActivo]}
                  onPress={() => elegirMaquina(m)}>
                  <Text style={[styles.chipTexto, maquina === m && styles.chipTextoActivo]}>{m}</Text>
                </Pressable>
              ))}
            </View>

            {op.trim() && maquina && (
              <>
                <View style={styles.divisor} />
                <SensorPanel
                  activo={modoSensor}
                  onToggle={() => setModoSensor((v) => !v)}
                  sensibilidad={sensibilidad}
                  onSensibilidad={setSensibilidad}
                  nivel={nivel}
                  umbral={umbral}
                  sinLecturas={sinLecturas}
                  estado={modoSensor ? 'Esperando que empieces a trabajar…' : undefined}
                />
              </>
            )}

            <View style={styles.divisor} />

            {/* Nivel 1 — primaria: la acción más probable, sola y grande. */}
            <BotonAccion
              icono="play-arrow"
              texto="Iniciar Producción Activa"
              variante="primaria"
              disabled={enviando}
              onPress={() => iniciarConCategoria('Producción Activa')}
            />

            {/* Nivel 2 — secundarias: alternativas rápidas, en fila para no apilar. */}
            <View style={styles.filaSecundarias}>
              <BotonAccion
                icono="build"
                texto="Setup"
                variante="secundaria"
                estiloExtra={styles.mitad}
                disabled={enviando}
                onPress={() => iniciarConCategoria(CATEGORIA_SETUP)}
              />
              <BotonAccion
                icono="mic"
                texto="Otra actividad"
                variante="secundaria"
                estiloExtra={styles.mitad}
                disabled={enviando}
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
                  { borderColor: colorCategoria(segmento.categoria), backgroundColor: colorCategoria(segmento.categoria) + '1A' },
                ]}>
                <Text style={[styles.pillCategoriaTexto, { color: colorCategoria(segmento.categoria) }]} numberOfLines={2}>
                  {segmento.categoria}
                </Text>
              </View>
            </View>

            <Text style={styles.timer}>{elapsedLabel}</Text>

            <SensorPanel
              activo={modoSensor}
              onToggle={() => setModoSensor((v) => !v)}
              sensibilidad={sensibilidad}
              onSensibilidad={setSensibilidad}
              nivel={nivel}
              umbral={umbral}
              sinLecturas={sinLecturas}
              estado={
                modoSensor
                  ? segmento.categoria === 'Producción Activa'
                    ? 'Vigilando — avisa si se detiene'
                    : 'Detenido — reanuda la herramienta para seguir'
                  : undefined
              }
            />
            {modoSensor && <View style={styles.divisor} />}

            {/* Nivel 1 — primaria: reportar es la acción central del trabajo. */}
            <BotonAccion
              icono="mic"
              texto="Pausar / reportar novedad"
              variante="primaria"
              disabled={enviando}
              onPress={() => setModalVisible('novedad')}
            />
            {/* Respaldo: si no quiere hablar o la IA falla, un toque directo
                sin pasar por texto ni por la IA. También es lo que usa el
                sensor: cuando detecta que la herramienta se detuvo, resalta
                esto mismo en vez de abrir algo nuevo. */}
            <Text style={[styles.subLabelCentrado, sensorPidiendoCausa && styles.subLabelSensorActivo]}>
              {sensorPidiendoCausa ? '🔬 El sensor detectó que se detuvo — ¿por qué?' : '¿No quieres hablar? Toca la causa'}
            </Text>
            <View style={styles.filaCausasRapidas}>
              {CAUSAS_RAPIDAS.map((c) => (
                <Pressable
                  key={c.categoria}
                  style={[styles.causaRapida, sensorPidiendoCausa && styles.causaRapidaResaltada]}
                  disabled={enviando}
                  onPress={() => {
                    setSensorPidiendoCausa(false);
                    cambiarCategoriaSegmento(c.categoria);
                  }}>
                  <Icon name={c.icono} size={18} color={sensorPidiendoCausa ? COLOR.brand : COLOR.textMuted} />
                  <Text style={[styles.causaRapidaTexto, sensorPidiendoCausa && { color: COLOR.brandDark }]} numberOfLines={1}>{c.etiqueta}</Text>
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
                disabled={enviando}
                onPress={() => cambiarCategoriaSegmento('Producción Activa')}
              />
            ) : (
              <BotonAccion
                icono="exit-to-app"
                texto="Salgo un momento"
                variante="secundaria"
                estiloExtra={styles.botonConEspacio}
                disabled={enviando}
                onPress={() => cambiarCategoriaSegmento(CATEGORIA_AUSENCIA)}
              />
            )}

            <View style={styles.divisor} />

            {/* Nivel 3 — terciaria: cierre del ciclo, raro y separado a
                propósito para que no compita con el flujo de trabajo. */}
            <BotonAccion
              icono="stop-circle"
              texto="Finalizar OP"
              variante="terciaria"
              colorTerciaria={COLOR.danger}
              disabled={enviando}
              onPress={finalizarOp}
            />
          </View>
        )}

        {enviando && (
          <View style={styles.esperaWrap}>
            <ActivityIndicator color={COLOR.brand} />
            <Text style={styles.esperaTexto}>
              {clasificandoIA ? '🤖 Analizando con IA…' : 'Enviando…'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
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
  logoIsotipo: { width: 20, height: 20, borderRadius: 5 },
  marca: { color: COLOR.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
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
  labelConEspacio: { color: COLOR.textMuted, fontSize: 13, marginBottom: SPACE.sm, marginTop: SPACE.xl },
  subLabelCentrado: { color: COLOR.textFaint, fontSize: 12, textAlign: 'center', marginTop: SPACE.md, marginBottom: SPACE.xs },
  subLabelSensorActivo: { color: COLOR.brandDark, fontWeight: '700' },
  causaRapidaResaltada: { borderColor: COLOR.brand, backgroundColor: COLOR.brandTint, borderWidth: 1.5 },
  sensorPanel: { marginTop: SPACE.sm },
  sensorFilaToggle: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  sensorTitulo: { flex: 1, color: COLOR.text, fontSize: 14, fontWeight: '700' },
  sensorSwitch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLOR.border,
    padding: 2,
    justifyContent: 'center',
  },
  sensorSwitchActivo: { backgroundColor: COLOR.brand },
  sensorSwitchBola: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' },
  sensorSwitchBolaActiva: { transform: [{ translateX: 18 }] },
  sensorCuerpo: { marginTop: SPACE.md },
  sensorEstado: { color: COLOR.textMuted, fontSize: 12, marginBottom: SPACE.sm },
  sensorBarraFondo: { height: 8, borderRadius: 4, backgroundColor: COLOR.bgElevated, overflow: 'hidden' },
  sensorBarraRelleno: { height: '100%', backgroundColor: COLOR.info, borderRadius: 4 },
  sensorBarraSobre: { backgroundColor: COLOR.brand },
  sensorAviso: { color: COLOR.warn, fontSize: 11, marginTop: SPACE.xs },
  filaSensibilidad: { flexDirection: 'row', gap: SPACE.xs, marginTop: SPACE.sm },
  chipSensibilidad: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACE.xs + 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.bgElevated,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  chipSensibilidadActivo: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipSensibilidadTexto: { color: COLOR.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.sm,
    padding: SPACE.md,
    fontSize: 16,
    color: COLOR.text,
    borderWidth: 1,
    borderColor: COLOR.border,
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
  inputTexto: { flex: 1, paddingVertical: SPACE.md, fontSize: 16, color: COLOR.text },
  divisor: { height: 1, backgroundColor: COLOR.border, marginVertical: SPACE.xl },
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
  boton_secundaria: { backgroundColor: COLOR.bg, borderWidth: 1.5, borderColor: COLOR.borderStrong },
  boton_terciaria: { backgroundColor: 'transparent', paddingVertical: SPACE.sm, minHeight: 0 },
  botonPresionado: { opacity: 0.75 },
  botonDeshabilitado: { opacity: 0.4 },
  botonConEspacio: { marginTop: SPACE.sm },
  botonIcono: { marginRight: SPACE.sm },
  botonTexto: { fontWeight: '700', fontSize: 15, flexShrink: 1, textAlign: 'center' },
  botonTextoTerciaria: { fontSize: 13, fontWeight: '600' },
  bannerWrap: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, zIndex: 20 },
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
  opActiva: { color: COLOR.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
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
