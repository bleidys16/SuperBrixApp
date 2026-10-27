import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { obtenerResumenOperativo, ResumenOperativo } from '../api';
import { colorCategoria } from '../categorias';
import { Operario } from '../storage';
import { COLOR, FONT, RADIUS, SPACE } from '../theme';

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
  const totalMin = Math.round(horas * 60);
  if (totalMin <= 0) {
    return '0 min';
  }
  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, [maquina, operario.cedula]);

  const activarModoDemo = () => {
    setResumen(crearResumenVistaDemo(maquina));
    setVistaDemo(true);
    setError('');
  };

  useEffect(() => {
    if (visible) {
      cargar().catch(() => undefined);
    }
  }, [visible, cargar]);

  const causasHoras = (resumen?.porCausa || []).map((item) => item.horas);
  const maxCausa = causasHoras.length > 0 ? Math.max(...causasHoras, 0.01) : 1;
  const porcentajeEficiencia = Math.max(0, Math.min(100, resumen?.eficiencia || 0));
  const topCausa = resumen?.topCausa;

  const lectura = topCausa
    ? `${topCausa.categoria} representa el mayor cuello de botella, acumulando ${formatearHoras(topCausa.horas)} de parada en ${topCausa.eventos} ${topCausa.eventos === 1 ? 'evento' : 'eventos'}.`
    : `Aún no hay paradas cerradas para ${operario.nombre} en ${maquina}. Inicia una OP para comenzar.`;

  const primerNombre = operario.nombre.split(' ')[0] || operario.nombre;
  const mensajeMotivacional =
    porcentajeEficiencia >= 70
      ? `¡Excelente turno, ${primerNombre}! 🚀 La máquina estuvo produciendo activamente el ${resumen?.eficiencia.toLocaleString('es-CO', { maximumFractionDigits: 1 })}% del tiempo.`
      : `Atención en taller ⚠️ Conviene revisar ${topCausa?.categoria || 'las causas de parada'} para elevar la productividad.`;

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alternar datos en vivo o demostración"
            style={[styles.badgeEnVivo, vistaDemo && styles.badgeDemo]}
            onPress={() => {
              if (vistaDemo) {
                cargar();
              } else {
                activarModoDemo();
              }
            }}>
            <View style={[styles.puntoEnVivo, vistaDemo && styles.puntoDemo]} />
            <Text style={[styles.badgeEnVivoTexto, vistaDemo && styles.badgeDemoTexto]}>
              {vistaDemo ? 'MODO DEMO' : 'EN VIVO'}
            </Text>
          </Pressable>
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
            <Pressable style={styles.botonModoDemo} onPress={activarModoDemo}>
              <Icon name="visibility" size={18} color={COLOR.brandDark} />
              <Text style={styles.botonModoDemoTexto}>Ver simulación de taller (Modo Pitch)</Text>
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
                  <Text style={styles.heroMetricaEtiqueta}>tiempo de turno</Text>
                </View>
                <View style={styles.heroSeparador} />
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor}>{formatearHoras(resumen.horasProductivas)}</Text>
                  <Text style={styles.heroMetricaEtiqueta}>produciendo</Text>
                </View>
                <View style={styles.heroSeparador} />
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor}>{formatearHoras(resumen.horasImproductivas)}</Text>
                  <Text style={styles.heroMetricaEtiqueta}>en paradas</Text>
                </View>
              </View>
            </View>

            {vistaDemo && (
              <View style={styles.avisoVistaDemo}>
                <Icon name="visibility" size={19} color={COLOR.brandDark} />
                <View style={styles.avisoVistaDemoTextoWrap}>
                  <Text style={styles.avisoVistaDemoTitulo}>Simulación de Taller (Modo Pitch)</Text>
                  <Text style={styles.avisoVistaDemoTexto}>
                    Datos de ejemplo preparados para la demostración ejecutiva. Se sincronizan en vivo con Google Sheets al registrar nuevas órdenes.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.insightCard}>
              <View style={styles.insightIcono}>
                <Icon name="insights" size={22} color={COLOR.brand} />
              </View>
              <View style={styles.insightTextoWrap}>
                <Text style={styles.insightEtiqueta}>DIAGNÓSTICO DEL TURNO</Text>
                <Text style={styles.insightTexto}>{lectura}</Text>
                <Text style={styles.insightMotivacional}>{mensajeMotivacional}</Text>
              </View>
            </View>

            <View style={styles.tarjetasFila}>
              <View style={styles.estadisticaCard}>
                <View style={[styles.estadisticaIcono, { backgroundColor: COLOR.infoBg }]}>
                  <Icon name="inventory-2" size={20} color={COLOR.info} />
                </View>
                <Text style={styles.estadisticaValor}>{resumen.operacionesRegistradas}</Text>
                <Text style={styles.estadisticaEtiqueta}>OP trabajadas</Text>
              </View>
              <View style={styles.estadisticaCard}>
                <View style={[styles.estadisticaIcono, { backgroundColor: COLOR.dangerBg }]}>
                  <Icon name="warning-amber" size={20} color={COLOR.danger} />
                </View>
                <Text style={styles.estadisticaValor}>{resumen.totalParadas}</Text>
                <Text style={styles.estadisticaEtiqueta}>paradas de máquina</Text>
              </View>
            </View>

            <View style={styles.seccionEncabezado}>
              <View>
                <Text style={styles.seccionTitulo}>Cuellos de botella en máquina</Text>
                <Text style={styles.seccionSubtitulo}>Ordenadas de mayor a menor tiempo perdido</Text>
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

            {resumen.registrosConsiderados === 0 && !vistaDemo && (
              <Pressable style={styles.bannerSugerenciaDemo} onPress={activarModoDemo}>
                <Icon name="tips-and-updates" size={20} color={COLOR.brand} />
                <View style={styles.bannerSugerenciaTexto}>
                  <Text style={styles.bannerSugerenciaTitulo}>¿Estás en la presentación ejecutiva?</Text>
                  <Text style={styles.bannerSugerenciaDetalle}>
                    Toca aquí para cargar datos simulados de 19.6 h de taller con Pareto y cuellos de botella.
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color={COLOR.brand} />
              </Pressable>
            )}

            {error && (
              <Pressable style={styles.avisoActualizacion} onPress={cargar}>
                <Icon name="sync" size={16} color={COLOR.warn} />
                <Text style={styles.avisoActualizacionTexto}>Se mostró la última carga. Toca para actualizar.</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.botonLooker}
              onPress={() => {
                Linking.openURL('https://lookerstudio.google.com').catch(() => {
                  Alert.alert('Looker Studio', 'Abre Looker Studio desde el navegador para consultar el informe.');
                });
              }}>
              <Icon name="open-in-new" size={18} color={COLOR.brand} />
              <Text style={styles.botonLookerTexto}>Abrir Tablero en Looker Studio</Text>
            </Pressable>

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
  headerTitulo: { color: COLOR.text, fontSize: 17, fontFamily: FONT.bold },
  headerSubtitulo: { color: COLOR.textMuted, fontSize: 11, marginTop: 2, fontFamily: FONT.regular },
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
  badgeEnVivoTexto: { color: COLOR.success, fontSize: 9, fontFamily: FONT.bold, letterSpacing: 0.7 },
  badgeDemo: { backgroundColor: COLOR.brandTint },
  puntoDemo: { backgroundColor: COLOR.brand },
  badgeDemoTexto: { color: COLOR.brandDark, fontFamily: FONT.bold },
  estadoCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl },
  estadoTitulo: { color: COLOR.text, fontSize: 18, fontFamily: FONT.bold, marginTop: SPACE.lg },
  estadoDetalle: {
    color: COLOR.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: SPACE.sm,
    maxWidth: 320,
    fontFamily: FONT.regular,
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
  botonReintentarTexto: { color: '#ffffff', fontFamily: FONT.bold, fontSize: 14 },
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
  heroEtiqueta: { color: '#F4C18D', fontSize: 10, fontFamily: FONT.bold, letterSpacing: 0.8 },
  heroActualizado: { color: '#AAA69E', fontSize: 9, fontFamily: FONT.regular },
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
  contextoMaquinaTexto: { color: '#F7E2CB', fontSize: 11, fontFamily: FONT.bold, maxWidth: 260 },
  heroNumero: {
    color: '#FFFFFF',
    fontSize: 54,
    lineHeight: 62,
    fontFamily: FONT.bold,
    letterSpacing: -1,
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
  avisoVistaDemoTitulo: { color: COLOR.brandDarker, fontSize: 12, fontFamily: FONT.bold },
  avisoVistaDemoTexto: { color: COLOR.textMuted, fontSize: 10, lineHeight: 15, marginTop: 2, fontFamily: FONT.regular },
  heroMetricas: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.xl },
  heroMetrica: { flex: 1, alignItems: 'center' },
  heroMetricaValor: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT.bold },
  heroMetricaEtiqueta: { color: '#AAA69E', fontSize: 9, marginTop: 3, textAlign: 'center', fontFamily: FONT.regular },
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
  insightEtiqueta: { color: COLOR.brandDark, fontSize: 9, fontFamily: FONT.bold, letterSpacing: 0.8 },
  insightTexto: { color: COLOR.text, fontSize: 13, lineHeight: 19, marginTop: 4, fontFamily: FONT.medium },
  insightMotivacional: {
    color: COLOR.brandDarker,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT.bold,
    marginTop: SPACE.xs + 2,
    paddingTop: SPACE.xs + 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(236, 140, 43, 0.25)',
  },
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
  estadisticaValor: { color: COLOR.text, fontSize: 24, fontFamily: FONT.bold },
  estadisticaEtiqueta: { color: COLOR.textMuted, fontSize: 11, marginTop: 2, fontFamily: FONT.regular },
  seccionEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACE.sm,
  },
  seccionTitulo: { color: COLOR.text, fontSize: 17, fontFamily: FONT.bold },
  seccionSubtitulo: { color: COLOR.textMuted, fontSize: 11, marginTop: 2, fontFamily: FONT.regular },
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
  nombreCausaTexto: { flex: 1, color: COLOR.text, fontSize: 12, fontFamily: FONT.bold },
  horasCausa: { fontSize: 13, fontFamily: FONT.bold },
  barraFondo: { height: 6, borderRadius: 3, backgroundColor: COLOR.bgElevated, marginTop: SPACE.sm, overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: 3 },
  eventosCausa: { color: COLOR.textFaint, fontSize: 9, marginTop: 5, fontFamily: FONT.regular },
  sinDatos: { color: COLOR.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: SPACE.xl, fontFamily: FONT.regular },
  avisoActualizacion: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md },
  avisoActualizacionTexto: { flex: 1, color: COLOR.textMuted, fontSize: 11, fontFamily: FONT.regular },
  botonModoDemo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLOR.brandTint,
    borderWidth: 1,
    borderColor: '#F4D1AC',
  },
  botonModoDemoTexto: { color: COLOR.brandDark, fontFamily: FONT.bold, fontSize: 13 },
  bannerSugerenciaDemo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.brandTint,
    borderWidth: 1,
    borderColor: '#F4D1AC',
  },
  bannerSugerenciaTexto: { flex: 1 },
  bannerSugerenciaTitulo: { color: COLOR.brandDark, fontSize: 13, fontFamily: FONT.bold },
  bannerSugerenciaDetalle: { color: COLOR.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16, fontFamily: FONT.regular },
  botonLooker: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.surface,
    borderWidth: 1.5,
    borderColor: COLOR.brand,
  },
  botonLookerTexto: { color: COLOR.brand, fontSize: 14, fontFamily: FONT.bold },
  botonVolverTurno: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.brand,
  },
  botonVolverTurnoTexto: { color: '#ffffff', fontSize: 15, fontFamily: FONT.bold },
});
