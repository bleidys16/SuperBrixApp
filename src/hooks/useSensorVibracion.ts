import { useEffect, useRef, useState } from 'react';
import {
  acelerometroDisponible,
  iniciarAcelerometro,
  detenerAcelerometro,
  suscribirAcelerometro,
} from '../nativo/acelerometro';

/**
 * Detecta "trabajando" vs "detenido" por vibración del celular, igual que
 * docs/sensor-demo.html (misma idea: diferencia entre lecturas consecutivas
 * del acelerómetro — así no importa en qué ángulo quede el celular pegado a
 * la herramienta, solo importa si vibra o no). Usa el módulo nativo propio
 * (src/nativo/acelerometro.ts) en vez de una librería de terceros.
 *
 * No se necesita pedir permiso: a diferencia de la ubicación o la cámara,
 * Android no protege el acelerómetro con un permiso en tiempo de ejecución.
 */

export type NivelSensibilidad = 'suave' | 'medio' | 'fuerte';

const UMBRAL_POR_NIVEL: Record<NivelSensibilidad, number> = {
  suave: 0.12,
  medio: 0.3,
  fuerte: 0.9,
};

const SOSTEN_ARRANQUE_MS = 300;
const SOSTEN_PARADA_MS = 2000;
const TAMANO_VENTANA = 8;

interface Opciones {
  armado: boolean;
  sensibilidad: NivelSensibilidad;
  onArranque: () => void;
  onParada: () => void;
}

export function useSensorVibracion({ armado, sensibilidad, onArranque, onParada }: Opciones) {
  const [nivel, setNivel] = useState(0);
  const [sinLecturas, setSinLecturas] = useState(!acelerometroDisponible());

  // Refs para que la suscripción (que se crea una sola vez) siempre lea el
  // valor más reciente sin tener que re-suscribirse en cada render.
  const armadoRef = useRef(armado);
  const umbralRef = useRef(UMBRAL_POR_NIVEL[sensibilidad]);
  const onArranqueRef = useRef(onArranque);
  const onParadaRef = useRef(onParada);
  armadoRef.current = armado;
  umbralRef.current = UMBRAL_POR_NIVEL[sensibilidad];
  onArranqueRef.current = onArranque;
  onParadaRef.current = onParada;

  useEffect(() => {
    if (!acelerometroDisponible()) {
      return;
    }

    let lastMag: number | null = null;
    const deltas: number[] = [];
    let vibrandoDesde: number | null = null;
    let quietoDesde: number | null = null;
    // 'esperando' = todavía no se ha confirmado ni arranque ni parada desde
    // que se armó; evita disparar onParada() apenas se activa el sensor.
    let fase: 'esperando' | 'activo' | 'detenido' = 'esperando';
    let recibioLectura = false;

    const avisoTimeout = setTimeout(() => {
      if (!recibioLectura) {
        setSinLecturas(true);
      }
    }, 3000);

    const suscripcion = suscribirAcelerometro(({ x, y, z }) => {
      recibioLectura = true;
      const mag = Math.sqrt(x * x + y * y + z * z);
      if (lastMag !== null) {
        const delta = Math.abs(mag - lastMag);
        deltas.push(delta);
        if (deltas.length > TAMANO_VENTANA) {
          deltas.shift();
        }
        const promedio = deltas.reduce((s, v) => s + v, 0) / deltas.length;
        setNivel(promedio);

        if (armadoRef.current) {
          const ahora = Date.now();
          if (promedio > umbralRef.current) {
            quietoDesde = null;
            if (vibrandoDesde === null) {
              vibrandoDesde = ahora;
            }
            if (ahora - vibrandoDesde > SOSTEN_ARRANQUE_MS && fase !== 'activo') {
              fase = 'activo';
              onArranqueRef.current();
            }
          } else {
            vibrandoDesde = null;
            if (quietoDesde === null) {
              quietoDesde = ahora;
            }
            if (ahora - quietoDesde > SOSTEN_PARADA_MS && fase === 'activo') {
              fase = 'detenido';
              onParadaRef.current();
            }
          }
        } else {
          fase = 'esperando';
          vibrandoDesde = null;
          quietoDesde = null;
        }
      }
      lastMag = mag;
    });

    iniciarAcelerometro();

    return () => {
      clearTimeout(avisoTimeout);
      suscripcion?.remove();
      detenerAcelerometro();
    };
    // Se suscribe una sola vez; arma/desarma y sensibilidad se leen de refs.
  }, []);

  return { nivel, umbral: UMBRAL_POR_NIVEL[sensibilidad], sinLecturas };
}
