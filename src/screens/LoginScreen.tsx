import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { Operario, buscarNombrePorCedula, recordarOperario } from '../storage';
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

  const puedeContinuar = cedula.trim().length > 0 && nombre.trim().length > 0;

  /**
   * Si este celular ya vio esta cédula antes, autocompleta el nombre — no es
   * una base de datos de la empresa, solo la memoria local del teléfono.
   */
  async function alSalirDeCedula() {
    const c = cedula.trim();
    if (!c || nombre.trim()) {
      return;
    }
    const conocido = await buscarNombrePorCedula(c);
    if (conocido) {
      setNombre(conocido);
      setReconocido(true);
    }
  }

  async function ingresar() {
    const op = { cedula: cedula.trim(), nombre: nombre.trim() };
    await recordarOperario(op);
    onIngresar(op);
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
            onChangeText={(v) => {
              setCedula(v);
              setReconocido(false);
            }}
            onBlur={alSalirDeCedula}
            keyboardType="number-pad"
            placeholder="Ej. 72234621"
            placeholderTextColor={COLOR.textFaint}
          />

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
            disabled={!puedeContinuar}
            onPress={ingresar}>
            <Text style={styles.botonTexto}>Empezar turno</Text>
          </Pressable>
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
  pie: {
    color: COLOR.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACE.xxl,
    letterSpacing: 0.3,
  },
});
