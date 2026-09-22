import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';

interface Props {
  visible: boolean;
  titulo: string;
  placeholder: string;
  onCancelar: () => void;
  onConfirmar: (texto: string) => void;
}

/**
 * Modal de texto libre. El TextInput multiline de Android ya trae el botón
 * de dictado por voz en el teclado del sistema, así que no se necesita
 * ninguna librería extra para cumplir "captura por voz".
 */
export default function TextoModal({
  visible,
  titulo,
  placeholder,
  onCancelar,
  onConfirmar,
}: Props) {
  const [texto, setTexto] = useState('');

  const confirmar = () => {
    if (!texto.trim()) {
      return;
    }
    onConfirmar(texto.trim());
    setTexto('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>{titulo}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#9ca3af"
            multiline
            autoFocus
            value={texto}
            onChangeText={setTexto}
          />
          <Text style={styles.hint}>
            Tip: usa el micrófono del teclado para dictar en vez de escribir.
          </Text>
          <View style={styles.botones}>
            <Pressable
              style={[styles.boton, styles.botonCancelar]}
              onPress={() => {
                setTexto('');
                onCancelar();
              }}>
              <Text style={styles.botonTextoCancelar}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.boton, styles.botonConfirmar]}
              onPress={confirmar}>
              <Text style={styles.botonTexto}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  titulo: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    textAlignVertical: 'top',
  },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18, gap: 10 },
  boton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  botonCancelar: { backgroundColor: '#f3f4f6' },
  botonConfirmar: { backgroundColor: '#f97316' },
  botonTexto: { color: '#ffffff', fontWeight: '700' },
  botonTextoCancelar: { color: '#374151', fontWeight: '600' },
});
