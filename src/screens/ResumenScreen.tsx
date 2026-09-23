import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { obtenerResumenOperativo, ResumenOperativo } from '../api';
import { colorCategoria } from '../categorias';
import { Operario } from '../storage';
import { COLOR, RADIUS, SPACE } from '../theme';

interface Props {
  visible: boolean;
  operario: Operario;
  maquina: string;
  onCerrar: () => void;
}

function crearResumenVistaDemo(maquina: string): ResumenOperativo {
  return {
    cedula: 'demo',
    maquina,
    totalHoras: 19.6,
    horasProductivas: 13.8,
    horasImproductivas: 5.8,
    eficiencia: 70.5,
    totalParadas: 17,
    operacionesRegistradas: 5,
    topCausa: {
      categoria: 'Falla Técnica / Mantenimiento',
      horas: 1.17,
      eventos: 2,
    },
    porCausa: [
      { categoria: 'Falla Técnica / Mantenimiento', horas: 1.17, eventos: 2 },
      { categoria: 'Espera de Materiales / Logística', horas: 0.83, eventos: 1 },
      { categoria: 'Alistamiento y Preparación (Setup)', horas: 0.67, eventos: 1 },
      { categoria: 'Calidad y Aprobación', horas: 0.58, eventos: 1 },
      { categoria: 'Ausencia del Operario / Descanso', horas: 0.5, eventos: 1 },
    ],
    registrosConsiderados: 17,
    actualizadoEn: new Date().toISOString(),
  };
}

function formatearHoras(horas: number): string {
  if (horas < 1) {
    return `${Math.round(horas * 60)} min`;
  }
  return `${horas.toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} h`;
}

function horaActual(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'ahora';
  }
}

export default function ResumenScreen({ visible, operario, maquina, onCerrar }: Props) {
  const insets = useSafeAreaInsets();
  const [resumen, setResumen] = useState<ResumenOperativo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [vistaDemo, setVistaDemo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    setVistaDemo(false);
    try {
      setResumen(await obtenerResumenOperativo(operario.cedula, maquina));
    } catch (err) {
      if (__DEV__) {
        setResumen(crearResumenVistaDemo(maquina));
        setVistaDemo(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCargando(false);
    }
  }, [maquina, operario.cedula]);

  useEffect(() => {
    if (visible) {
      cargar().catch(() => undefined);
    }
  }, [visible, cargar]);

  const maxCausa = Math.max(...(resumen?.porCausa.map((item) => item.horas) || [1]));
  const porcentajeEficiencia = Math.max(0, Math.min(100, resumen?.eficiencia || 0));
  const topCausa = resumen?.topCausa;

  const lectura = topCausa
    ? `${topCausa.categoria} es la principal causa, con ${formatearHoras(topCausa.horas)} improductivas en ${topCausa.eventos} ${topCausa.eventos === 1 ? 'evento' : 'eventos'}.`
    : `Aún no hay cierres con horas para ${operario.nombre} en ${maquina}. Inicia una OP para comenzar.`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + SPACE.sm }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al turno"
            style={({ pressed }) => [styles.botonVolver, pressed && styles.botonPresionado]}
            onPress={onCerrar}>
            <Icon name="arrow-back" size={22} color={COLOR.text} />
          </Pressable>
          <View style={styles.headerTexto}>
            <Text style={styles.headerTitulo}>Pulso de la operación</Text>
            <Text style={styles.headerSubtitulo} numberOfLines={1}>
              {operario.nombre} · {maquina}
            </Text>
          </View>
          <View style={[styles.badgeEnVivo, vistaDemo && styles.badgeDemo]}>
            <View style={[styles.puntoEnVivo, vistaDemo && styles.puntoDemo]} />
            <Text style={[styles.badgeEnVivoTexto, vistaDemo && styles.badgeDemoTexto]}>
              {vistaDemo ? 'DEMO' : 'LIVE'}
            </Text>
          </View>
        </View>

        {cargando && !resumen ? (
          <View style={styles.estadoCentro}>
            <ActivityIndicator size="large" color={COLOR.brand} />
            <Text style={styles.estadoTitulo}>Calculando el pulso...</Text>
            <Text style={styles.estadoDetalle}>Consultando los cierres de {maquina}.</Text>
          </View>
        ) : error && !resumen ? (
          <View style={styles.estadoCentro}>
            <View style={styles.errorIcono}>
              <Icon name="cloud-off" size={30} color={COLOR.danger} />
            </View>
            <Text style={styles.estadoTitulo}>No pudimos abrir el resumen</Text>
            <Text style={styles.estadoDetalle}>{error}</Text>
            <Pressable style={styles.botonReintentar} onPress={cargar}>
              <Icon name="refresh" size={18} color="#ffffff" />
              <Text style={styles.botonReintentarTexto}>Intentar otra vez</Text>
            </Pressable>
          </View>
        ) : resumen ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + SPACE.xxl }]}
            showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <View style={styles.heroCirculoUno} />
              <View style={styles.heroCirculoDos} />
              <View style={styles.heroEtiquetaFila}>
                <Text style={styles.heroEtiqueta}>EFICIENCIA OPERATIVA</Text>
                <Text style={styles.heroActualizado}>
                  {vistaDemo ? 'Diseñado para el pitch' : `Actualizado ${horaActual(resumen.actualizadoEn)}`}
                </Text>
              </View>
              <View style={styles.contextoMaquina}>
                <Icon name="precision-manufacturing" size={15} color="#F4C18D" />
                <Text style={styles.contextoMaquinaTexto} numberOfLines={1}>{resumen.maquina}</Text>
              </View>
              <Text style={styles.heroNumero}>
                {resumen.eficiencia.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
                <Text style={styles.heroUnidad}>%</Text>
              </Text>
              <View style={styles.progresoFondo}>
                <View style={[styles.progresoRelleno, { width: `${porcentajeEficiencia}%` }]} />
              </View>
              <View style={styles.heroMetricas}>
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor}>{formatearHoras(resumen.totalHoras)}</Text>
                  <Text style={styles.heroMetricaEtiqueta}>tiempo medido</Text>
                </View>
                <View style={styles.heroSeparador} />
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor}>{formatearHoras(resumen.horasImproductivas)}</Text>
                  <Text style={styles.heroMetricaEtiqueta}>improductivas</Text>
                </View>
                <View style={styles.heroSeparador} />
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor}>{resumen.totalParadas}</Text>
                  <Text style={styles.heroMetricaEtiqueta}>paradas</Text>
                </View>
              </View>
            </View>

            {vistaDemo && (
              <View style={styles.avisoVistaDemo}>
                <Icon name="visibility" size={19} color={COLOR.brandDark} />
                <View style={styles.avisoVistaDemoTextoWrap}>
                  <Text style={styles.avisoVistaDemoTitulo}>Vista demostrativa</Text>
                  <Text style={styles.avisoVistaDemoTexto}>
                    Se muestran datos de ejemplo porque el backend publicado aún no incluye el resumen. Al crear la nueva versión de Apps Script, se reemplazarán automáticamente por datos reales.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.insightCard}>
              <View style={styles.insightIcono}>
                <Icon name="auto-awesome" size={20} color={COLOR.brand} />
              </View>
              <View style={styles.insightTextoWrap}>
                <Text style={styles.insightEtiqueta}>LECTURA RÁPIDA</Text>
                <Text style={styles.insightTexto}>{lectura}</Text>
              </View>
            </View>

            <View style={styles.tarjetasFila}>
              <View style={styles.estadisticaCard}>
                <View style={[styles.estadisticaIcono, { backgroundColor: COLOR.infoBg }]}>
                  <Icon name="inventory-2" size={20} color={COLOR.info} />
                </View>
                <Text style={styles.estadisticaValor}>{resumen.operacionesRegistradas}</Text>
                <Text style={styles.estadisticaEtiqueta}>OP registradas</Text>
              </View>
              <View style={styles.estadisticaCard}>
                <View style={[styles.estadisticaIcono, { backgroundColor: COLOR.dangerBg }]}>
                  <Icon name="warning-amber" size={20} color={COLOR.danger} />
                </View>
                <Text style={styles.estadisticaValor}>{resumen.registrosConsiderados}</Text>
                <Text style={styles.estadisticaEtiqueta}>segmentos cerrados</Text>
              </View>
            </View>

            <View style={styles.seccionEncabezado}>
              <View>
                <Text style={styles.seccionTitulo}>Causas de parada</Text>
                <Text style={styles.seccionSubtitulo}>Ordenadas por horas improductivas</Text>
              </View>
              <Icon name="bar-chart" size={22} color={COLOR.brand} />
            </View>

            <View style={styles.listaCard}>
              {resumen.porCausa.length ? (
                resumen.porCausa.map((item, index) => {
                  const acento = colorCategoria(item.categoria);
                  const porcentajeBarra = Math.max(6, (item.horas / maxCausa) * 100);
                  return (
                    <View
                      key={item.categoria}
                      style={[styles.filaCausa, index < resumen.porCausa.length - 1 && styles.filaSeparada]}>
                      <View style={styles.filaCausaEncabezado}>
                        <View style={styles.nombreCausa}>
                          <View style={[styles.puntoCategoria, { backgroundColor: acento }]} />
                          <Text style={styles.nombreCausaTexto} numberOfLines={1}>{item.categoria}</Text>
                        </View>
                        <Text style={[styles.horasCausa, { color: acento }]}>{formatearHoras(item.horas)}</Text>
                      </View>
                      <View style={styles.barraFondo}>
                        <View
                          style={[
                            styles.barraRelleno,
                            { backgroundColor: acento, width: `${porcentajeBarra}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.eventosCausa}>{item.eventos} evento{item.eventos === 1 ? '' : 's'}</Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.sinDatos}>No hay causas improductivas registradas todavía.</Text>
              )}
            </View>

            {error && (
              <Pressable style={styles.avisoActualizacion} onPress={cargar}>
                <Icon name="sync" size={16} color={COLOR.warn} />
                <Text style={styles.avisoActualizacionTexto}>Se mostró la última carga. Toca para actualizar.</Text>
              </Pressable>
            )}

            <Pressable style={styles.botonVolverTurno} onPress={onCerrar}>
              <Text style={styles.botonVolverTurnoTexto}>Volver al turno</Text>
              <Icon name="arrow-forward" size={20} color="#ffffff" />
            </Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EE' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.md,
    backgroundColor: COLOR.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  botonVolver: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.bgElevated,
  },
  botonPresionado: { opacity: 0.65 },
  headerTexto: { flex: 1, marginHorizontal: SPACE.sm },
  headerTitulo: { color: COLOR.text, fontSize: 17, fontWeight: '900' },
  headerSubtitulo: { color: COLOR.textMuted, fontSize: 11, marginTop: 2 },
  badgeEnVivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLOR.successBg,
  },
  puntoEnVivo: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLOR.success },
  badgeEnVivoTexto: { color: COLOR.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  badgeDemo: { backgroundColor: COLOR.brandTint },
  puntoDemo: { backgroundColor: COLOR.brand },
  badgeDemoTexto: { color: COLOR.brandDark },
  estadoCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl },
  estadoTitulo: { color: COLOR.text, fontSize: 18, fontWeight: '800', marginTop: SPACE.lg },
  estadoDetalle: {
    color: COLOR.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: SPACE.sm,
    maxWidth: 320,
  },
  errorIcono: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.dangerBg,
  },
  botonReintentar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.xl,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.brand,
  },
  botonReintentarTexto: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  scroll: { padding: SPACE.lg, gap: SPACE.lg },
  hero: {
    overflow: 'hidden',
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    backgroundColor: '#20201F',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 7,
  },
  heroCirculoUno: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -52,
    top: -65,
    backgroundColor: 'rgba(236, 140, 43, 0.16)',
  },
  heroCirculoDos: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    right: 62,
    bottom: -72,
    backgroundColor: 'rgba(236, 140, 43, 0.09)',
  },
  heroEtiquetaFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroEtiqueta: { color: '#F4C18D', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  heroActualizado: { color: '#AAA69E', fontSize: 9 },
  contextoMaquina: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.sm + 2,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  contextoMaquinaTexto: { color: '#F7E2CB', fontSize: 11, fontWeight: '800', maxWidth: 260 },
  heroNumero: {
    color: '#FFFFFF',
    fontSize: 58,
    lineHeight: 66,
    fontWeight: '900',
    letterSpacing: -2,
    marginTop: SPACE.sm,
    fontVariant: ['tabular-nums'],
  },
  heroUnidad: { color: COLOR.brand, fontSize: 25, letterSpacing: 0 },
  progresoFondo: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: SPACE.sm,
  },
  progresoRelleno: { height: '100%', borderRadius: 4, backgroundColor: COLOR.brand },
  avisoVistaDemo: {
    flexDirection: 'row',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFF8EF',
    borderWidth: 1,
    borderColor: '#F1D1A8',
  },
  avisoVistaDemoTextoWrap: { flex: 1 },
  avisoVistaDemoTitulo: { color: COLOR.brandDarker, fontSize: 12, fontWeight: '900' },
  avisoVistaDemoTexto: { color: COLOR.textMuted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  heroMetricas: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.xl },
  heroMetrica: { flex: 1, alignItems: 'center' },
  heroMetricaValor: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  heroMetricaEtiqueta: { color: '#AAA69E', fontSize: 9, marginTop: 3, textAlign: 'center' },
  heroSeparador: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.13)' },
  insightCard: {
    flexDirection: 'row',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLOR.brandTint,
    borderWidth: 1,
    borderColor: '#F5D4B0',
  },
  insightIcono: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.surface,
  },
  insightTextoWrap: { flex: 1 },
  insightEtiqueta: { color: COLOR.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  insightTexto: { color: COLOR.text, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  tarjetasFila: { flexDirection: 'row', gap: SPACE.md },
  estadisticaCard: {
    flex: 1,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  estadisticaIcono: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  estadisticaValor: { color: COLOR.text, fontSize: 25, fontWeight: '900' },
  estadisticaEtiqueta: { color: COLOR.textMuted, fontSize: 11, marginTop: 2 },
  seccionEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACE.sm,
  },
  seccionTitulo: { color: COLOR.text, fontSize: 17, fontWeight: '900' },
  seccionSubtitulo: { color: COLOR.textMuted, fontSize: 11, marginTop: 2 },
  listaCard: {
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  filaCausa: { paddingVertical: SPACE.md },
  filaSeparada: { borderBottomWidth: 1, borderBottomColor: COLOR.border },
  filaCausaEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nombreCausa: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginRight: SPACE.sm },
  puntoCategoria: { width: 9, height: 9, borderRadius: 5 },
  nombreCausaTexto: { flex: 1, color: COLOR.text, fontSize: 12, fontWeight: '700' },
  horasCausa: { fontSize: 13, fontWeight: '900' },
  barraFondo: { height: 6, borderRadius: 3, backgroundColor: COLOR.bgElevated, marginTop: SPACE.sm, overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: 3 },
  eventosCausa: { color: COLOR.textFaint, fontSize: 9, marginTop: 5 },
  sinDatos: { color: COLOR.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: SPACE.xl },
  avisoActualizacion: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md },
  avisoActualizacionTexto: { flex: 1, color: COLOR.textMuted, fontSize: 11 },
  botonVolverTurno: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.brand,
  },
  botonVolverTurnoTexto: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
});
