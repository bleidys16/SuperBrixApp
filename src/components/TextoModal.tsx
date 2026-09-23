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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLOR, RADIUS, SPACE } from '../theme';

interface Props {
  visible: boolean;
  titulo: string;
  placeholder: string;
  onCancelar: () => void;
  onConfirmar: (texto: string) => void;
}

/**
 * Overlay de texto libre. A propósito NO usa el <Modal> de React Native: en
 * Android el Modal abre una ventana nativa separada que no participa del
 * ajuste de teclado del KeyboardAvoidingView de la pantalla que lo llama, así
 * que el teclado terminaba tapando el campo de texto sin dejar ver lo que se
 * escribía. Al ser una vista normal dentro del mismo árbol que CapturaScreen,
 * hereda su mismo comportamiento de teclado.
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
          <Text style={styles.titulo}>{titulo}</Text>
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
            <Icon name="mic" size={14} color={COLOR.textFaint} />
            <Text style={styles.hint}>
              Usa el micrófono del teclado para dictar en vez de escribir
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
              disabled={!texto.trim()}
              onPress={confirmar}
            >
              <Icon
                name="send"
                size={16}
                color="#ffffff"
                style={{ marginRight: SPACE.xs }}
              />
              <Text style={styles.botonTexto}>Enviar</Text>
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
  titulo: {
    fontSize: 18,
    fontWeight: '700',
    color: COLOR.text,
    marginBottom: SPACE.md,
  },
  input: {
    minHeight: 90,
    maxHeight: 130,
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.bgElevated,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontSize: 16,
    color: COLOR.text,
    textAlignVertical: 'top',
  },
  hintFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginTop: SPACE.sm,
  },
  hint: { fontSize: 12, color: COLOR.textFaint, flexShrink: 1 },
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
  botonTexto: { color: '#ffffff', fontWeight: '700' },
  botonTextoCancelar: { color: COLOR.textMuted, fontWeight: '600' },
});
