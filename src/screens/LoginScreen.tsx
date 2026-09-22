import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Operario } from '../storage';

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

  const puedeContinuar = cedula.trim().length > 0 && nombre.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.logo}>SuperBrix</Text>
      <Text style={styles.subtitulo}>Control digital de tiempos de taller</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Cédula del empleado</Text>
        <TextInput
          style={styles.input}
          value={cedula}
          onChangeText={setCedula}
          keyboardType="number-pad"
          placeholder="Ej. 72234621"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.label}>Nombre y apellidos</Text>
        <TextInput
          style={styles.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Ej. Juan Pérez"
          placeholderTextColor="#9ca3af"
        />

        <Pressable
          style={[styles.boton, !puedeContinuar && styles.botonDeshabilitado]}
          disabled={!puedeContinuar}
          onPress={() => onIngresar({ cedula: cedula.trim(), nombre: nombre.trim() })}>
          <Text style={styles.botonTexto}>Empezar turno</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 32, fontWeight: '800', color: '#f97316', textAlign: 'center' },
  subtitulo: { fontSize: 14, color: '#d1d5db', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  form: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20 },
  label: { color: '#d1d5db', fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
  },
  boton: { backgroundColor: '#f97316', borderRadius: 10, padding: 14, marginTop: 24, alignItems: 'center' },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
