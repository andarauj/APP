import { useState, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import type { Tempo } from '@/utils/calculators';
import { tempoSecondsPerRep } from '@/utils/calculators';

export type TempoPhase = 'eccentric' | 'pauseBottom' | 'concentric' | 'pauseTop';

export const PHASE_LABELS: Record<TempoPhase, string> = {
  eccentric: 'Descer',
  pauseBottom: 'Pausa',
  concentric: 'Subir',
  pauseTop: 'Pausa',
};

/**
 * Drives a rep-cadence metronome, e.g. 3-1-2-0 = 3s down, 1s pause, 2s up.
 * Phases with a duration of 0 are skipped so "X" (explosive) tempos work.
 * Uses an absolute clock rather than accumulating interval ticks, which would
 * drift over a long set.
 */
export function useTempoMetronome(tempo: Tempo | null, running: boolean, vibrate = true) {
  const [phase, setPhase] = useState<TempoPhase>('eccentric');
  const [phaseRemaining, setPhaseRemaining] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const startRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<TempoPhase | null>(null);

  useEffect(() => {
    if (!running || !tempo) {
      startRef.current = null;
      lastPhaseRef.current = null;
      setRepCount(0);
      return;
    }

    const perRep = tempoSecondsPerRep(tempo);
    if (perRep <= 0) return;

    startRef.current = Date.now();
    const allPhases: { key: TempoPhase; duration: number }[] = [
      { key: 'eccentric' as TempoPhase, duration: tempo.eccentric },
      { key: 'pauseBottom' as TempoPhase, duration: tempo.pauseBottom },
      { key: 'concentric' as TempoPhase, duration: tempo.concentric },
      { key: 'pauseTop' as TempoPhase, duration: tempo.pauseTop },
    ];
    const phases = allPhases.filter(p => p.duration > 0);

    if (phases.length === 0) return;

    const interval = setInterval(() => {
      if (!startRef.current) return;
      const elapsed = (Date.now() - startRef.current) / 1000;
      const reps = Math.floor(elapsed / perRep);
      const within = elapsed % perRep;

      let acc = 0;
      for (const p of phases) {
        if (within < acc + p.duration) {
          if (lastPhaseRef.current !== p.key) {
            // Short pulse on phase change, longer one when a rep completes.
            if (vibrate) {
              Vibration.vibrate(p.key === phases[0].key ? 120 : 40);
            }
            lastPhaseRef.current = p.key;
          }
          setPhase(p.key);
          setPhaseRemaining(Math.ceil(acc + p.duration - within));
          break;
        }
        acc += p.duration;
      }
      setRepCount(reps);
    }, 100);

    return () => clearInterval(interval);
  }, [running, tempo, vibrate]);

  return { phase, phaseRemaining, repCount };
}
