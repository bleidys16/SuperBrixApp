import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Operario, buscarNombrePorCedula, recordarOperario } from '../storage';
import { OPERARIOS_DEMO, buscarOperarioDemo } from '../operariosDemo';
import { COLOR, FONT, RADIUS, SPACE } from '../theme';
import { dictarAudio } from '../nativo/voz';
import { extraerNumeroOp } from '../utils/numeroVoz';

interface Props {
  onIngresar: (operario: Operario) => void;
}

/**
 * Reemplaza el encabezado manual de la tarjeta física (Cédula + Nombre).
 * Se llena una sola vez por turno; queda guardado en el celular.
 */
export default function LoginScreen({ onIngresar }: Props) {
  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState('');
  const [reconocido, setReconocido] = useState(false);
  const [operacionPendiente, setOperacionPendiente] = useState(false);
  const [escuchandoCedula, setEscuchandoCedula] = useState(false);
  const [escuchandoNombre, setEscuchandoNombre] = useState(false);

  const operarioDemo = buscarOperarioDemo(cedula);
  const puedeContinuar = cedula.trim().length > 0 && nombre.trim().length > 0;

  function capitalizarNombre(texto: string): string {
    return texto
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  /**
   * Si este celular ya vio esta cédula antes, autocompleta el nombre — no es
   * una base de datos de la empresa, solo la memoria local del teléfono.
   */
  async function completarCredenciales(cedulaIngresada: string) {
    const demo = buscarOperarioDemo(cedulaIngresada);
    if (demo) {
      setNombre(demo.nombre);
      setReconocido(true);
      return;
    }

    const conocido = await buscarNombrePorCedula(cedulaIngresada);
    if (conocido) {
      setNombre(conocido);
      setReconocido(true);
    }
  }

  async function alSalirDeCedula() {
    const c = cedula.trim();
    if (!c || nombre.trim()) {
      return;
    }
    await completarCredenciales(c);
  }

  function seleccionarOperarioDemo(operario: Operario) {
    setCedula(operario.cedula);
    setNombre(operario.nombre);
    setReconocido(true);
  }

  async function ingresarOperario(operario: Operario) {
    setOperacionPendiente(true);
    try {
      await recordarOperario(operario);
      onIngresar(operario);
    } finally {
      setOperacionPendiente(false);
    }
  }

  async function ingresar() {
    const op = operarioDemo || { cedula: cedula.trim(), nombre: nombre.trim() };
    setCedula(op.cedula);
    setNombre(op.nombre);
    await ingresarOperario(op);
  }

  async function dictarCedulaPorVoz() {
    Keyboard.dismiss();
    setEscuchandoCedula(true);
    try {
      const texto = await dictarAudio('Di tu número de cédula');
      const digitos = extraerNumeroOp(texto) || texto.replace(/\D/g, '');
      if (digitos) {
        setCedula(digitos);
        setReconocido(false);
        const demo = buscarOperarioDemo(digitos);
        if (demo) {
          setNombre(demo.nombre);
          setReconocido(true);
        } else {
          await completarCredenciales(digitos);
        }
      } else {
        Alert.alert(
          'Cédula no reconocida',
          `Escuchamos: "${texto}". Por favor repite claramente los números de tu cédula.`,
        );
      }
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : String(err);
      if (!mensaje.includes('cancelado') && !mensaje.includes('CANCELADO')) {
        Alert.alert('Dictado por voz', mensaje);
      }
    } finally {
      setEscuchandoCedula(false);
    }
  }

  async function dictarNombrePorVoz() {
    Keyboard.dismiss();
    setEscuchandoNombre(true);
    try {
      const texto = await dictarAudio('Di tu nombre y apellido');
      if (texto && texto.trim()) {
        const nombreLimpio = capitalizarNombre(texto);
        setNombre(nombreLimpio);
        setReconocido(false);
      } else {
        Alert.alert(
          'Nombre no reconocido',
          'Por favor di claramente tu nombre y apellidos.',
        );
      }
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : String(err);
      if (!mensaje.includes('cancelado') && !mensaje.includes('CANCELADO')) {
        Alert.alert('Dictado por voz', mensaje);
      }
    } finally {
      setEscuchandoNombre(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          {/* El logo ya trae fondo blanco: sobre un fondo blanco se integra
              solo, sin necesitar una tarjeta/sombra alrededor. */}
          <Image
            source={require('../assets/logo.jpg')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <Text style={styles.subtitulo}>Control digital de tiempos de taller</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Cédula del empleado</Text>
          <View style={styles.campoConMic}>
            <TextInput
              style={styles.inputConMic}
              value={cedula}
              onChangeText={async (v) => {
                setCedula(v);
                setReconocido(false);
                const demo = buscarOperarioDemo(v);
                if (demo) {
                  setNombre(demo.nombre);
                  setReconocido(true);
                } else if (operarioDemo) {
                  setNombre('');
                }
              }}
              onBlur={alSalirDeCedula}
              keyboardType="number-pad"
              placeholder="Ej. 1098765432"
              placeholderTextColor={COLOR.textFaint}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dictar cédula por voz"
              style={({ pressed }) => [
                styles.btnMicInput,
                escuchandoCedula && styles.btnMicInputActivo,
                pressed && styles.botonPresionado,
              ]}
              disabled={escuchandoCedula || escuchandoNombre}
              onPress={dictarCedulaPorVoz}>
              {escuchandoCedula ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Icon name="mic" size={20} color={COLOR.brandDark} />
              )}
            </Pressable>
          </View>
          {operarioDemo && (
            <View style={styles.demoDetectado}>
              <Text style={styles.demoDetectadoIcono}>✓</Text>
              <View style={styles.demoDetectadoTexto}>
                <Text style={styles.demoDetectadoTitulo}>Operario de demostración</Text>
                <Text style={styles.demoDetectadoDetalle}>{operarioDemo.nombre} · Ya puedes iniciar turno</Text>
              </View>
            </View>
          )}

          <Text style={styles.label}>Nombre y apellidos</Text>
          <View style={styles.campoConMic}>
            <TextInput
              style={styles.inputConMic}
              value={nombre}
              onChangeText={(v) => {
                setNombre(v);
                setReconocido(false);
              }}
              placeholder="Ej. Maria Gomez"
              placeholderTextColor={COLOR.textFaint}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dictar nombre por voz"
              style={({ pressed }) => [
                styles.btnMicInput,
                escuchandoNombre && styles.btnMicInputActivo,
                pressed && styles.botonPresionado,
              ]}
              disabled={escuchandoCedula || escuchandoNombre}
              onPress={dictarNombrePorVoz}>
              {escuchandoNombre ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Icon name="mic" size={20} color={COLOR.brandDark} />
              )}
            </Pressable>
          </View>
          {reconocido && (
            <Text style={styles.reconocido}>✓ Te reconocimos por tu cédula en este celular</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.boton,
              !puedeContinuar && styles.botonDeshabilitado,
              pressed && puedeContinuar && styles.botonPresionado,
            ]}
            disabled={!puedeContinuar || operacionPendiente}
            onPress={ingresar}>
            <Text style={styles.botonTexto}>
              {operacionPendiente ? 'Ingresando…' : operarioDemo ? 'Entrar con acceso rápido' : 'Empezar turno'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.accesoRapido}>
          <View style={styles.accesoRapidoEncabezado}>
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeTexto}>DEMO</Text>
            </View>
            <View style={styles.accesoRapidoTitulos}>
              <Text style={styles.accesoRapidoTitulo}>Acceso rápido</Text>
              <Text style={styles.accesoRapidoSubtitulo}>Toca el perfil de Maria Gomez para iniciar turno en un solo toque.</Text>
            </View>
          </View>

          <View style={styles.listaOperariosDemo}>
            {OPERARIOS_DEMO.map((operario) => {
              const seleccionado = operarioDemo?.cedula === operario.cedula;
              const iniciales = operario.nombre
                .split(' ')
                .slice(0, 2)
                .map((parte) => parte[0])
                .join('')
                .toUpperCase();
              return (
                <Pressable
                  key={operario.cedula}
                  testID={`operario-demo-${operario.cedula}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Acceder como ${operario.nombre}`}
                  style={({ pressed }) => [
                    styles.operarioDemo,
                    seleccionado && styles.operarioDemoSeleccionado,
                    pressed && styles.operarioDemoPresionado,
                  ]}
                  disabled={operacionPendiente}
                  onPress={async () => {
                    Keyboard.dismiss();
                    seleccionarOperarioDemo(operario);
                    await ingresarOperario(operario);
                  }}>
                  <View style={[styles.avatarDemo, seleccionado && styles.avatarDemoSeleccionado]}>
                    <Text style={styles.avatarDemoTexto}>{iniciales}</Text>
                  </View>
                  <View style={styles.operarioDemoInfo}>
                    <Text style={styles.operarioDemoNombre}>{operario.nombre}</Text>
                    <Text style={styles.operarioDemoCedula}>CC. {operario.cedula}</Text>
                  </View>
                  <Text style={[styles.operarioDemoAccion, seleccionado && styles.operarioDemoAccionActiva]}>
                    {seleccionado ? '✓' : 'Entrar'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.pie}>Reto de Innovación y Digitalización Industrial</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.xxl,
  },
  hero: { alignItems: 'center', marginBottom: SPACE.xxl },
  // El archivo ya viene recortado a su contenido real (411x101), se respeta
  // esa proporción (~4.07:1) para que no vuelva a verse con relleno blanco.
  logoImg: { width: 280, height: 280 / (411 / 101), marginBottom: SPACE.md },
  subtitulo: {
    fontSize: 14,
    color: COLOR.textMuted,
    textAlign: 'center',
    letterSpacing: 0.2,
    fontFamily: FONT.regular,
  },
  form: {
    backgroundColor: COLOR.surfaceAlt,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    borderWidth: 1,
    borderColor: COLOR.border,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    shadowColor: COLOR.ink,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  label: { color: COLOR.textMuted, fontSize: 13, marginBottom: SPACE.xs, marginTop: SPACE.md, fontFamily: FONT.medium },
  reconocido: { color: COLOR.success, fontSize: 12, marginTop: SPACE.xs, fontFamily: FONT.bold },
  input: {
    backgroundColor: COLOR.bg,
    borderRadius: RADIUS.sm,
    padding: SPACE.md,
    fontSize: 16,
    color: COLOR.text,
    borderWidth: 1,
    borderColor: COLOR.border,
    fontFamily: FONT.regular,
  },
  campoConMic: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLOR.border,
    paddingRight: SPACE.xs,
  },
  inputConMic: {
    flex: 1,
    padding: SPACE.md,
    fontSize: 16,
    color: COLOR.text,
    fontFamily: FONT.regular,
  },
  btnMicInput: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.brandTint,
    borderWidth: 1,
    borderColor: '#F4D1AC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnMicInputActivo: {
    backgroundColor: COLOR.brand,
    borderColor: COLOR.brandDark,
  },
  boton: {
    backgroundColor: COLOR.brand,
    borderRadius: RADIUS.sm,
    padding: SPACE.md + 2,
    marginTop: SPACE.xl,
    alignItems: 'center',
  },
  botonPresionado: { backgroundColor: COLOR.brandDark },
  botonDeshabilitado: { opacity: 0.35 },
  botonTexto: { color: '#ffffff', fontFamily: FONT.bold, fontSize: 16, letterSpacing: 0.3 },
  demoDetectado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.sm,
    padding: SPACE.sm + 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.successBg,
    borderWidth: 1,
    borderColor: '#B9DFC6',
  },
  demoDetectadoIcono: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLOR.success,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontFamily: FONT.bold,
  },
  demoDetectadoTexto: { flex: 1 },
  demoDetectadoTitulo: { color: COLOR.success, fontSize: 12, fontFamily: FONT.bold },
  demoDetectadoDetalle: { color: COLOR.textMuted, fontSize: 11, marginTop: 1, fontFamily: FONT.regular },
  accesoRapido: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginTop: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.brandTint,
    shadowColor: COLOR.brand,
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  accesoRapidoEncabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  demoBadge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.brand,
  },
  demoBadgeTexto: { color: '#ffffff', fontSize: 10, fontFamily: FONT.bold, letterSpacing: 0.8 },
  accesoRapidoTitulos: { flex: 1 },
  accesoRapidoTitulo: { color: COLOR.text, fontSize: 15, fontFamily: FONT.bold },
  accesoRapidoSubtitulo: { color: COLOR.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2, fontFamily: FONT.regular },
  listaOperariosDemo: { gap: SPACE.sm, marginTop: SPACE.md },
  operarioDemo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.bg,
  },
  operarioDemoSeleccionado: { borderColor: COLOR.brand, backgroundColor: COLOR.brandTint },
  operarioDemoPresionado: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  avatarDemo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.bgElevated,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  avatarDemoSeleccionado: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  avatarDemoTexto: { color: COLOR.textMuted, fontSize: 12, fontFamily: FONT.bold },
  operarioDemoInfo: { flex: 1, marginLeft: SPACE.sm + 2 },
  operarioDemoNombre: { color: COLOR.text, fontSize: 14, fontFamily: FONT.bold },
  operarioDemoCedula: { color: COLOR.textFaint, fontSize: 11, marginTop: 2, fontFamily: FONT.regular },
  operarioDemoAccion: { color: COLOR.brand, fontSize: 12, fontFamily: FONT.bold, paddingHorizontal: SPACE.xs },
  operarioDemoAccionActiva: { color: COLOR.success, fontSize: 16 },
  pie: {
    color: COLOR.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACE.xxl,
    letterSpacing: 0.3,
    fontFamily: FONT.regular,
  },
});
