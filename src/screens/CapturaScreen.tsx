import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Operario } from '../storage';
import { enviarEvento } from '../api';
import TextoModal from '../components/TextoModal';

interface Props {
  operario: Operario;
  onCambiarOperario: () => void;
}

interface SegmentoActivo {
  op: string;
  categoria: string;
  inicioMs: number;
}

const CATEGORIAS_RAPIDAS = ['Producción Activa', 'Alistamiento y Preparación (Setup)'];
const CATEGORIA_AUSENCIA = 'Ausencia del Operario / Descanso';

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface BotonAccionProps {
  icono: string;
  texto: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
}

function BotonAccion({ icono, texto, onPress, disabled, style }: BotonAccionProps) {
  return (
    <Pressable
      style={[styles.botonRapido, style]}
      disabled={disabled}
      onPress={onPress}>
      <Icon name={icono} size={20} color="#ffffff" style={styles.botonIcono} />
      <Text style={styles.botonRapidoTexto}>{texto}</Text>
    </Pressable>
  );
}

export default function CapturaScreen({ operario, onCambiarOperario }: Props) {
  const [op, setOp] = useState('');
  const [segmento, setSegmento] = useState<SegmentoActivo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modalVisible, setModalVisible] = useState<'inicio' | 'novedad' | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState('00:00');

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
    if (!op.trim()) {
      Alert.alert('Falta la OP', 'Escribe el número de orden de producción (OP#).');
      return;
    }
    setEnviando(true);
    try {
      await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: op.trim(),
        abreNuevoSegmento: true,
        categoria,
      });
      setSegmento({ op: op.trim(), categoria, inicioMs: Date.now() });
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function iniciarConTexto(texto: string) {
    setModalVisible(null);
    if (!op.trim()) {
      Alert.alert('Falta la OP', 'Escribe el número de orden de producción (OP#).');
      return;
    }
    setEnviando(true);
    try {
      const resp = await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: op.trim(),
        abreNuevoSegmento: true,
        texto,
      });
      setSegmento({
        op: op.trim(),
        categoria: resp.categoria || 'Producción Activa',
        inicioMs: Date.now(),
      });
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function reportarNovedad(texto: string) {
    setModalVisible(null);
    if (!segmento) {
      return;
    }
    setEnviando(true);
    try {
      const resp = await enviarEvento({
        cedula: operario.cedula,
        nombre: operario.nombre,
        op: segmento.op,
        categoriaCerrada: segmento.categoria,
        horasCerradas: horasSegmentoActual(),
        abreNuevoSegmento: true,
        texto,
      });
      const nuevaCategoria = resp.categoria || 'Instrucciones / Coordinación';
      setSegmento({ op: segmento.op, categoria: nuevaCategoria, inicioMs: Date.now() });
      Alert.alert('Registrado', `La IA clasificó esto como: "${nuevaCategoria}"`);
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
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
        categoriaCerrada: segmento.categoria,
        horasCerradas: horasSegmentoActual(),
        abreNuevoSegmento: true,
        categoria,
      });
      setSegmento({ op: segmento.op, categoria, inicioMs: Date.now() });
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
        categoriaCerrada: segmento.categoria,
        horasCerradas: horasSegmentoActual(),
        abreNuevoSegmento: false,
      });
      setSegmento(null);
      setOp('');
    } catch (err) {
      Alert.alert('Error de conexión', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>{operario.nombre}</Text>
          <Text style={styles.cedula}>CC {operario.cedula}</Text>
        </View>
        <Pressable
          onPress={onCambiarOperario}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={styles.cambiar}>Cambiar</Text>
        </Pressable>
      </View>

      {!segmento ? (
        <View style={styles.card}>
          <Text style={styles.label}>Orden de producción (OP#)</Text>
          <TextInput
            style={styles.input}
            value={op}
            onChangeText={setOp}
            placeholder="Ej. 62611"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
          />

          <Text style={[styles.label, { marginTop: 20 }]}>Iniciar labor</Text>
          {CATEGORIAS_RAPIDAS.map((cat) => (
            <BotonAccion
              key={cat}
              icono="play-arrow"
              texto={cat}
              disabled={enviando}
              onPress={() => iniciarConCategoria(cat)}
            />
          ))}
          <BotonAccion
            icono="mic"
            texto="Describir otra actividad"
            style={styles.botonSecundario}
            disabled={enviando}
            onPress={() => setModalVisible('inicio')}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>OP en curso</Text>
          <Text style={styles.opActiva}>OP# {segmento.op}</Text>
          <Text style={styles.categoriaActiva}>{segmento.categoria}</Text>
          <Text style={styles.timer}>{elapsedLabel}</Text>

          {segmento.categoria === CATEGORIA_AUSENCIA ? (
            <BotonAccion
              icono="play-arrow"
              texto="Volví, reanudar Producción Activa"
              style={styles.botonReanudar}
              disabled={enviando}
              onPress={() => cambiarCategoriaSegmento('Producción Activa')}
            />
          ) : (
            <BotonAccion
              icono="exit-to-app"
              texto="Salgo un momento"
              style={styles.botonAusencia}
              disabled={enviando}
              onPress={() => cambiarCategoriaSegmento(CATEGORIA_AUSENCIA)}
            />
          )}

          <BotonAccion
            icono="mic"
            texto="Pausar / reportar novedad"
            style={styles.botonNovedad}
            disabled={enviando}
            onPress={() => setModalVisible('novedad')}
          />

          <BotonAccion
            icono="check-circle"
            texto="Finalizar OP"
            style={styles.botonFinalizar}
            disabled={enviando}
            onPress={finalizarOp}
          />
        </View>
      )}

      {enviando && <ActivityIndicator style={styles.spinner} color="#f97316" />}

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
  container: { flex: 1, backgroundColor: '#111827', padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  saludo: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  cedula: { color: '#9ca3af', fontSize: 13 },
  cambiar: { color: '#f97316', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20 },
  label: { color: '#d1d5db', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
  },
  botonRapido: {
    backgroundColor: '#374151',
    borderRadius: 10,
    padding: 16,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonIcono: { marginRight: 8 },
  botonSecundario: { backgroundColor: '#4b5563' },
  botonAusencia: { backgroundColor: '#1d4ed8', marginTop: 20 },
  botonReanudar: { backgroundColor: '#047857', marginTop: 20 },
  botonNovedad: { backgroundColor: '#b45309' },
  botonFinalizar: { backgroundColor: '#7f1d1d' },
  botonRapidoTexto: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  opActiva: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginTop: 4 },
  categoriaActiva: { color: '#fbbf24', fontSize: 15, marginTop: 4 },
  timer: { color: '#ffffff', fontSize: 40, fontWeight: '200', marginTop: 16, textAlign: 'center' },
  spinner: { marginTop: 16 },
});
