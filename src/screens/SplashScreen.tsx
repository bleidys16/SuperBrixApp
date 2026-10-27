import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import SuperBrixLogo from '../components/SuperBrixLogo';
import { COLOR } from '../theme';

interface SplashScreenProps {
  onFinish: () => void;
}

/**
 * Pantalla de inicio animada (Splash Screen)
 * Presenta con elegancia únicamente el logotipo oficial de SuperBrix
 * con una transición de entrada suave (fade + escala) y desvanecimiento
 * hacia la aplicación principal.
 */
export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    // 1. Animación de entrada: fade in + ligero zoom hacia escala natural (1.0)
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.back(1.05)),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Pausa para apreciar el logo (~1000ms)
      const timer = setTimeout(() => {
        // 3. Animación de salida: suave desvanecimiento hacia la app
        Animated.parallel([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1.04,
            duration: 380,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          onFinish();
        });
      }, 1000);

      return () => clearTimeout(timer);
    });
  }, [opacityAnim, scaleAnim, onFinish]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}>
        <SuperBrixLogo width={300} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
