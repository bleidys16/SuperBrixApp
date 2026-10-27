import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLOR, FONT, RADIUS, SPACE } from '../theme';

interface Props {
  visible: boolean;
  onCerrar: () => void;
  onDetectarOp: (opNumero: string, descripcion?: string) => void;
}

const ORDENES_TALLER_EJEMPLO = [
  { op: '62611', pieza: 'Tolva de Enfriamiento', puesto: 'Fresadora CNC' },
  { op: '48920', pieza: 'Sinfín Transportador', puesto: 'Torno' },
  { op: '31554', pieza: 'Cilindro Clasificador', puesto: 'Soldadora MIG' },
];

export default function ModalEscanerOP({
  visible,
  onCerrar,
  onDetectarOp,
}: Props) {
  const insets = useSafeAreaInsets();
  const lineaLaser = useRef(new Animated.Value(0)).current;
  const [opDetectada, setOpDetectada] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setOpDetectada(null);
      return;
    }

    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(lineaLaser, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(lineaLaser, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    );
    animacion.start();

    return () => animacion.stop();
  }, [visible, lineaLaser]);

  const simularEscaneo = (op: string, pieza: string) => {
    setOpDetectada(op);
    setTimeout(() => {
      onDetectarOp(op, pieza);
      onCerrar();
    }, 600);
  };

  const translateY = lineaLaser.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 190],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCerrar}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + SPACE.lg }]}>
        {/* Encabezado */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar escáner"
            style={({ pressed }) => [styles.btnCerrar, pressed && styles.btnPresionado]}
            onPress={onCerrar}
          >
            <Icon name="close" size={24} color="#ffffff" />
          </Pressable>
          <View style={styles.headerTextoWrap}>
            <Text style={styles.headerTitulo}>Escáner de Tarjeta de Taller</Text>
            <Text style={styles.headerSubtitulo}>Lectura automática de Código de Barras / QR</Text>
          </View>
        </View>

        {/* Visor de Cámara Industrial */}
        <View style={styles.camaraContenedor}>
          <View style={styles.camaraMarco}>
            {/* Esquinas del visor */}
            <View style={[styles.esquina, styles.esquinaTL]} />
            <View style={[styles.esquina, styles.esquinaTR]} />
            <View style={[styles.esquina, styles.esquinaBL]} />
            <View style={[styles.esquina, styles.esquinaBR]} />

            {/* Línea láser de escaneo */}
            <Animated.View
              style={[
                styles.lineaLaser,
                { transform: [{ translateY }] },
              ]}
            />

            {/* Mira central */}
            <View style={styles.miraCentral}>
              <Icon
                name={opDetectada ? 'check-circle' : 'qr-code-scanner'}
                size={opDetectada ? 46 : 38}
                color={opDetectada ? COLOR.success : 'rgba(255,255,255,0.35)'}
              />
              {opDetectada && (
                <Text style={styles.textoDetectado}>¡OP #{opDetectada} detectada!</Text>
              )}
            </View>
          </View>
          <Text style={styles.instruccionCamara}>
            Apunta la cámara al código impreso en la tarjeta física de la OP
          </Text>
        </View>

        {/* Órdenes físicas de taller para simular escaneo en el pitch */}
        <View style={styles.seccionSimulacion}>
          <View style={styles.etiquetaDemoFila}>
            <Icon name="touch-app" size={16} color={COLOR.brand} />
            <Text style={styles.etiquetaDemoTitulo}>Toca una tarjeta para simular el escaneo:</Text>
          </View>

          <View style={styles.listaTarjetas}>
            {ORDENES_TALLER_EJEMPLO.map((item) => (
              <Pressable
                key={item.op}
                style={({ pressed }) => [
                  styles.tarjetaItem,
                  opDetectada === item.op && styles.tarjetaItemActiva,
                  pressed && styles.btnPresionado,
                ]}
                onPress={() => simularEscaneo(item.op, item.pieza)}
              >
                <View style={styles.tarjetaIcono}>
                  <Icon name="qr-code-2" size={24} color={COLOR.brand} />
                </View>
                <View style={styles.tarjetaInfo}>
                  <Text style={styles.tarjetaOp}>OP #{item.op}</Text>
                  <Text style={styles.tarjetaPieza}>{item.pieza} · {item.puesto}</Text>
                </View>
                <Icon name="chevron-right" size={20} color="rgba(255,255,255,0.4)" />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E131B',
    paddingHorizontal: SPACE.lg,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  btnCerrar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPresionado: {
    opacity: 0.7,
  },
  headerTextoWrap: {
    flex: 1,
  },
  headerTitulo: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: FONT.bold,
  },
  headerSubtitulo: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
    fontFamily: FONT.regular,
  },
  camaraContenedor: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACE.md,
  },
  camaraMarco: {
    width: 250,
    height: 220,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  esquina: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: COLOR.brand,
  },
  esquinaTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  esquinaTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  esquinaBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  esquinaBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  lineaLaser: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    height: 3,
    backgroundColor: COLOR.danger,
    shadowColor: COLOR.danger,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  miraCentral: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  textoDetectado: {
    color: COLOR.success,
    fontSize: 13,
    fontFamily: FONT.bold,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  instruccionCamara: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACE.md,
    maxWidth: 260,
    fontFamily: FONT.regular,
  },
  seccionSimulacion: {
    backgroundColor: '#161F2E',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  etiquetaDemoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACE.sm,
  },
  etiquetaDemoTitulo: {
    color: COLOR.brand,
    fontSize: 12,
    fontFamily: FONT.bold,
  },
  listaTarjetas: {
    gap: SPACE.xs + 2,
  },
  tarjetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tarjetaItemActiva: {
    borderColor: COLOR.success,
    backgroundColor: '#0F3923',
  },
  tarjetaIcono: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(236, 140, 43, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.sm,
  },
  tarjetaInfo: {
    flex: 1,
  },
  tarjetaOp: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: FONT.bold,
  },
  tarjetaPieza: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
    fontFamily: FONT.regular,
  },
});
