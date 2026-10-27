import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  BackHandler,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLOR, FONT, RADIUS, SPACE } from '../theme';
import { dictarAudio } from '../nativo/voz';

interface Props {
  visible: boolean;
  titulo: string;
  placeholder: string;
  onCancelar: () => void;
  onConfirmar: (texto: string) => void;
}

/**
 * Overlay de texto libre con soporte de dictado por voz nativo.
 */
export default function TextoModal({
  visible,
  titulo,
  placeholder,
  onCancelar,
  onConfirmar,
}: Props) {
  const insets = useSafeAreaInsets();
  const [texto, setTexto] = useState('');
  const [escuchandoVoz, setEscuchandoVoz] = useState(false);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') {
      return;
    }
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancelar();
      return true;
    });
    return () => suscripcion.remove();
  }, [visible, onCancelar]);

  if (!visible) {
    return null;
  }

  async function dictarPorVoz() {
    setEscuchandoVoz(true);
    try {
      const promptVoz = titulo ? `${titulo} (habla con naturalidad)` : 'Cuéntanos qué pasó en la máquina';
      const capturado = await dictarAudio(promptVoz);
      if (capturado && capturado.trim()) {
        setTexto((actual) => (actual ? `${actual} ${capturado.trim()}` : capturado.trim()));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('cancelado') && !msg.includes('CANCELADO')) {
        Alert.alert('Dictado por voz', msg);
      }
    } finally {
      setEscuchandoVoz(false);
    }
  }

  const confirmar = () => {
    if (!texto.trim()) {
      return;
    }
    onConfirmar(texto.trim());
    setTexto('');
  };

  return (
    <View style={styles.overlayAbs} pointerEvents="box-none">
      <Pressable
        style={styles.fondo}
        accessibilityLabel="Cerrar"
        onPress={onCancelar}
      />
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom, SPACE.xl) },
          ]}
        >
          <View style={styles.manija} />
          <View style={styles.headerModal}>
            <Text style={styles.titulo}>{titulo}</Text>
          </View>

          {/* Botón de Dictado por Voz Directo */}
          <Pressable
            style={({ pressed }) => [
              styles.botonVozNativo,
              escuchandoVoz && styles.botonVozNativoActivo,
              pressed && styles.botonPresionado,
            ]}
            disabled={escuchandoVoz}
            onPress={dictarPorVoz}
          >
            {escuchandoVoz ? (
              <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: SPACE.xs }} />
            ) : (
              <Icon name="mic" size={20} color="#ffffff" style={{ marginRight: SPACE.xs }} />
            )}
            <Text style={styles.botonVozNativoTexto}>
              {escuchandoVoz ? 'Escuchando tu voz…' : 'Dictar por voz ahora'}
            </Text>
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={COLOR.textFaint}
            multiline
            autoFocus
            value={texto}
            onChangeText={setTexto}
            selectionColor={COLOR.brand}
          />

          <View style={styles.hintFila}>
            <Icon name="info-outline" size={13} color={COLOR.textFaint} />
            <Text style={styles.hint}>
              Puedes hablar o escribir. La IA clasificará la causa automáticamente.
            </Text>
          </View>

          <View style={styles.botones}>
            <Pressable
              style={[styles.boton, styles.botonCancelar]}
              onPress={() => {
                setTexto('');
                onCancelar();
              }}
            >
              <Text style={styles.botonTextoCancelar}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.boton,
                styles.botonConfirmar,
                !texto.trim() && styles.botonDeshabilitado,
              ]}
              disabled={!texto.trim() || escuchandoVoz}
              onPress={confirmar}
            >
              <Icon
                name="send"
                size={16}
                color="#ffffff"
                style={{ marginRight: SPACE.xs }}
              />
              <Text style={styles.botonTexto}>Enviar a IA</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayAbs: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  fondo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 8, 5, 0.6)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLOR.surface,
    borderTopLeftRadius: RADIUS.lg + 4,
    borderTopRightRadius: RADIUS.lg + 4,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderBottomWidth: 0,
    padding: SPACE.xl,
    shadowColor: COLOR.ink,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  manija: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLOR.border,
    alignSelf: 'center',
    marginBottom: SPACE.lg,
  },
  headerModal: {
    marginBottom: SPACE.sm,
  },
  titulo: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLOR.text,
  },
  botonVozNativo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.brand,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    marginBottom: SPACE.md,
    shadowColor: COLOR.brand,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  botonVozNativoActivo: {
    backgroundColor: COLOR.danger,
  },
  botonVozNativoTexto: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: FONT.bold,
  },
  botonPresionado: {
    opacity: 0.8,
  },
  input: {
    minHeight: 85,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontSize: 15,
    color: COLOR.text,
    fontFamily: FONT.regular,
    textAlignVertical: 'top',
  },
  hintFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginTop: SPACE.xs + 2,
  },
  hint: { fontSize: 11, color: COLOR.textFaint, flexShrink: 1, fontFamily: FONT.regular },
  botones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACE.lg,
    gap: SPACE.sm,
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md - 2,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.sm,
  },
  botonCancelar: {
    backgroundColor: COLOR.bgElevated,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  botonConfirmar: { backgroundColor: COLOR.brand },
  botonDeshabilitado: { opacity: 0.4 },
  botonTexto: { color: '#ffffff', fontFamily: FONT.bold },
  botonTextoCancelar: { color: COLOR.textMuted, fontFamily: FONT.medium },
});
