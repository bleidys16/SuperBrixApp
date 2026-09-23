/**
 * SuperBrix - Control digital de tiempos de taller
 * Reto de Innovación y Digitalización Industrial (24h)
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import CapturaScreen from './src/screens/CapturaScreen';
import { Operario, guardarOperario, obtenerOperario, limpiarOperario } from './src/storage';
import { COLOR } from './src/theme';

function App() {
  const [operario, setOperario] = useState<Operario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerOperario().then((op) => {
      setOperario(op);
      setCargando(false);
    });
  }, []);

  async function ingresar(op: Operario) {
    await guardarOperario(op);
    setOperario(op);
  }

  async function cambiarOperario() {
    await limpiarOperario();
    setOperario(null);
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {cargando ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLOR.brand} size="large" />
        </View>
      ) : operario ? (
        <CapturaScreen operario={operario} onCambiarOperario={cambiarOperario} />
      ) : (
        <LoginScreen onIngresar={ingresar} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: COLOR.bg, justifyContent: 'center' },
});

export default App;
