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
} from 'react-native';
import { Operario, buscarNombrePorCedula, recordarOperario } from '../storage';
import { OPERARIOS_DEMO, buscarOperarioDemo } from '../operariosDemo';
import { COLOR, RADIUS, SPACE } from '../theme';

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

  const operarioDemo = buscarOperarioDemo(cedula);
  const puedeContinuar = cedula.trim().length > 0 && nombre.trim().length > 0;

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
          <TextInput
            style={styles.input}
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
            placeholder="Ej. 72234621"
            placeholderTextColor={COLOR.textFaint}
          />
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
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={(v) => {
              setNombre(v);
              setReconocido(false);
            }}
            placeholder="Ej. Juan Pérez"
            placeholderTextColor={COLOR.textFaint}
          />
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
              <Text style={styles.accesoRapidoTitulo}>Accesos rápidos para el pitch</Text>
              <Text style={styles.accesoRapidoSubtitulo}>Toca un operario: solo coloca su cédula y el nombre se completa automáticamente.</Text>
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
  label: { color: COLOR.textMuted, fontSize: 13, marginBottom: SPACE.xs, marginTop: SPACE.md },
  reconocido: { color: COLOR.success, fontSize: 12, marginTop: SPACE.xs, fontWeight: '600' },
  input: {
    backgroundColor: COLOR.bg,
    borderRadius: RADIUS.sm,
    padding: SPACE.md,
    fontSize: 16,
    color: COLOR.text,
    borderWidth: 1,
    borderColor: COLOR.border,
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
  botonTexto: { color: '#ffffff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
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
    fontWeight: '800',
  },
  demoDetectadoTexto: { flex: 1 },
  demoDetectadoTitulo: { color: COLOR.success, fontSize: 12, fontWeight: '800' },
  demoDetectadoDetalle: { color: COLOR.textMuted, fontSize: 11, marginTop: 1 },
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
  demoBadgeTexto: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  accesoRapidoTitulos: { flex: 1 },
  accesoRapidoTitulo: { color: COLOR.text, fontSize: 15, fontWeight: '800' },
  accesoRapidoSubtitulo: { color: COLOR.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
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
  avatarDemoTexto: { color: COLOR.textMuted, fontSize: 12, fontWeight: '900' },
  operarioDemoInfo: { flex: 1, marginLeft: SPACE.sm + 2 },
  operarioDemoNombre: { color: COLOR.text, fontSize: 14, fontWeight: '800' },
  operarioDemoCedula: { color: COLOR.textFaint, fontSize: 11, marginTop: 2 },
  operarioDemoAccion: { color: COLOR.brand, fontSize: 12, fontWeight: '800', paddingHorizontal: SPACE.xs },
  operarioDemoAccionActiva: { color: COLOR.success, fontSize: 16 },
  pie: {
    color: COLOR.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACE.xxl,
    letterSpacing: 0.3,
  },
});
