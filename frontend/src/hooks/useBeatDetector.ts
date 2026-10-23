import { useEffect } from 'react';

// Live beat detection off the playing <audio> element — there's no stored
// BPM per track, so beats are found as spikes in bass energy relative to the
// last second or so of the same track. Anything can listen via
// subscribeToBeats (see WaterRipple); detection itself runs once, from
// PlayerProvider.

type BeatListener = (strength: number) => void;
const listeners = new Set<BeatListener>();

export function subscribeToBeats(listener: BeatListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emitBeat(strength: number) {
  listeners.forEach(listener => listener(strength));
}

// Kick drums and bass sit roughly under this.
const BASS_HZ = 150;
// ~1s of frames at 60fps to average against.
const HISTORY_SIZE = 60;
const HISTORY_MIN = 20;
// Energy has to jump this far over the recent average to count as a beat…
const BEAT_THRESHOLD = 1.3;
// …and this far to count as a full-strength one.
const STRONG_BEAT_RATIO = 2.5;
const MIN_ENERGY = 400;
// Caps detection at 200 BPM, so one kick's decay never double-fires.
const MIN_BEAT_GAP_MS = 300;
// Steady pulse used wherever the audio can't be analysed.
const FALLBACK_INTERVAL_MS = 600;
const FALLBACK_STRENGTH = 0.5;
const RESUME_TIMEOUT_MS = 300;

// Routing an element through Web Audio hands its output to the AudioContext,
// and iOS suspends that context whenever the page is backgrounded — which
// would cut the music off on screen lock. iOS gets the fallback pulse instead.
const isIOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// One context + analyser for the app's lifetime. createMediaElementSource
// can only ever be called once per element, so sources are cached — the
// mobile/desktop MiniPlayer layouts each mount their own <audio>.
let audioCtx: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
let connectedEl: HTMLMediaElement | null = null;

async function connect(el: HTMLMediaElement): Promise<boolean> {
  if (isIOS) return false;
  try {
    audioCtx ??= new AudioContext();
    // resume() stays pending forever without a user gesture — time it out.
    if (audioCtx.state !== 'running') {
      await Promise.race([audioCtx.resume(), new Promise(resolve => setTimeout(resolve, RESUME_TIMEOUT_MS))]);
    }
    // Never reroute the element into a context that isn't running — it
    // would play silently.
    if (audioCtx.state !== 'running') return false;
    if (!analyser) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      analyser.connect(audioCtx.destination);
    }
    if (connectedEl !== el) {
      let source = sources.get(el);
      if (!source) {
        source = audioCtx.createMediaElementSource(el);
        sources.set(el, source);
      }
      source.connect(analyser);
      connectedEl = el;
    }
    return true;
  } catch {
    return false;
  }
}

export function useBeatDetector(audioRef: React.RefObject<HTMLAudioElement>, isPlaying: boolean) {
  useEffect(() => {
    const el = audioRef.current;
    if (!isPlaying || !el) return;
    let cancelled = false;
    let frame: number | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;

    connect(el).then(ok => {
      if (cancelled) return;
      if (!ok || !analyser || !audioCtx) {
        fallback = setInterval(() => emitBeat(FALLBACK_STRENGTH), FALLBACK_INTERVAL_MS);
        return;
      }
      const node = analyser;
      const bins = new Uint8Array(node.frequencyBinCount);
      const maxBin = Math.max(1, Math.round(BASS_HZ / (audioCtx.sampleRate / node.fftSize)));
      const history: number[] = [];
      let historySum = 0;
      let previous = 0;
      let lastBeat = 0;

      const tick = (now: number) => {
        // A layout swap mid-playback mounts a fresh <audio> — follow it.
        if (audioRef.current && audioRef.current !== connectedEl) connect(audioRef.current);

        node.getByteFrequencyData(bins);
        let energy = 0;
        // Bin 0 is DC — skip it.
        for (let i = 1; i <= maxBin; i++) energy += bins[i] * bins[i];
        energy /= maxBin;

        const average = historySum / (history.length || 1);
        const ratio = average > 0 ? energy / average : 0;
        if (history.length >= HISTORY_MIN && ratio > BEAT_THRESHOLD && energy > previous
          && energy > MIN_ENERGY && now - lastBeat > MIN_BEAT_GAP_MS) {
          lastBeat = now;
          const t = Math.min(1, (ratio - BEAT_THRESHOLD) / (STRONG_BEAT_RATIO - BEAT_THRESHOLD));
          emitBeat(0.3 + 0.7 * t);
        }

        previous = energy;
        history.push(energy);
        historySum += energy;
        if (history.length > HISTORY_SIZE) historySum -= history.shift()!;
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearInterval(fallback);
    };
  }, [audioRef, isPlaying]);
}
