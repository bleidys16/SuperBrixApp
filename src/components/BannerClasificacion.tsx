import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { colorCategoria } from '../categorias';
import { COLOR, RADIUS, SPACE } from '../theme';

interface Props {
  categoria: string;
  confianza: string;
  onOcultar: () => void;
}

const ETIQUETA_CONFIANZA: Record<string, string> = {
  alta: 'Confianza alta',
  media: 'Confianza media',
  baja: 'Confianza baja',
  manual: 'Elegida a mano',
  'baja (heurística sin IA)': 'Sin IA (palabras clave)',
};

/**
 * Reemplaza el Alert.alert() bloqueante que mostraba la categoría asignada
 * por la IA. Un Alert exige tocar "OK" para seguir trabajando, lo cual va
 * contra el criterio de "fricción mínima"; este banner aparece flotando
 * arriba, se lee en un vistazo y se oculta solo a los 4 segundos.
 */
export default function BannerClasificacion({ categoria, confianza, onOcultar }: Props) {
  const opacidad = useRef(new Animated.Value(0)).current;
  const desplazamiento = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacidad, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(desplazamiento, { toValue: 0, useNativeDriver: true, friction: 8 }),
    ]).start();
    const timeout = setTimeout(() => {
      Animated.timing(opacidad, { toValue: 0, duration: 220, useNativeDriver: true }).start(onOcultar);
    }, 4000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, confianza]);

  const acento = colorCategoria(categoria);

  return (
    <Animated.View
      style={[
        styles.banner,
        { opacity: opacidad, borderColor: acento, transform: [{ translateY: desplazamiento }] },
      ]}>
      <Icon name="auto-awesome" size={20} color={acento} style={styles.icono} />
      <Animated.View style={styles.texto}>
        <Text style={styles.etiqueta}>La IA clasificó esto como</Text>
        <Text style={styles.categoria} numberOfLines={2}>{categoria}</Text>
        <Text style={[styles.confianza, { color: acento }]}>{ETIQUETA_CONFIANZA[confianza] || confianza}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLOR.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: SPACE.md + 2,
    shadowColor: COLOR.ink,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  icono: { marginRight: SPACE.sm, marginTop: 1 },
  texto: { flex: 1 },
  etiqueta: { color: COLOR.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  categoria: { color: COLOR.text, fontSize: 16, fontWeight: '700', marginTop: 2 },
  confianza: { fontSize: 12, marginTop: 3, fontWeight: '600' },
});
