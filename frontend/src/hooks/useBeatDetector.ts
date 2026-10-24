import { useEffect } from 'react';

// Live beat detection off the playing <audio> element — there's no stored
// BPM per track, so beats are found as onsets: moments where the spectrum
// suddenly rises compared with the frame before, judged against how much it
// has been rising over the last second and a half of the same track.
// Anything can listen via subscribeToBeats (see WaterRipple); detection
// itself runs once, from PlayerProvider.

type BeatListener = (strength: number) => void;
const listeners = new Set<BeatListener>();

export function subscribeToBeats(listener: BeatListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emitBeat(strength: number) {
  listeners.forEach(listener => listener(strength));
}

// Kicks, then snares/claps/clicks — each band judged against its own recent
// history, so a busy bass line can't drown out a snare or the other way
// round. Hats and cymbals (above the mid band) are left out: they'd ripple
// on every 8th or 16th note.
const BANDS = [{ fromHz: 30, toHz: 200 }, { fromHz: 200, toHz: 2500 }];
// Log-compresses magnitudes, so a quiet hit still registers next to a loud
// one. Magnitudes are first taken relative to the track's recent peak
// loudness, so the player's own volume (applied before the analyser) doesn't
// move any of the thresholds below.
const COMPRESSION = 10;
// ~1.5s of frames at 60fps for the adaptive threshold.
const HISTORY_SIZE = 90;
const HISTORY_MIN = 20;
// A beat is a rise this many median absolute deviations over the band's
// recent median. Median-based on purpose: a track's few huge hits (kick +
// snare together) would inflate a mean/standard deviation until every
// ordinary kick fell under it.
const THRESHOLD_DEVIATIONS = 3;
// Floor for a near-constant passage (a held note), whose median and
// deviation are ~0 and would otherwise let any wobble through.
const MIN_FLUX = 3;
// Caps detection at 240 BPM, so one hit's tail never double-fires.
const MIN_BEAT_GAP_MS = 250;
// Ignores frames quieter than this fraction of the track's recent peak
// level — the noise floor in a true silence.
const SILENCE_GATE = 0.02;
const PEAK_DECAY = 0.9995;
// Steady pulse used wherever the audio can't be analysed.
const FALLBACK_INTERVAL_MS = 600;
const FALLBACK_STRENGTH = 0.5;
const RESUME_TIMEOUT_MS = 300;
export const ANALYSER_FFT_SIZE = 1024;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The per-frame half of detection, kept free of Web Audio so it can be fed
 * frames offline. Takes the analyser's float spectrum in dB — not the byte
 * one, which clips at the analyser's -30 dB ceiling: a mastered track's bass
 * sits above that, so those bins pin at 255 and stop changing.
 *
 * Per band, the onset signal is spectral flux: how much the (compressed)
 * spectrum rose since the previous frame. A held bass note adds nothing;
 * a new hit does.
 */
export function createBeatDetector(sampleRate: number, fftSize: number) {
  const binHz = sampleRate / fftSize;
  const previous = new Float32Array(fftSize / 2);
  const bands = BANDS.map(({ fromHz, toHz }) => ({
    fromBin: Math.max(1, Math.round(fromHz / binHz)),
    toBin: Math.min(fftSize / 2 - 1, Math.round(toHz / binHz)),
    history: [] as number[],
    wasAbove: false,
  }));
  const binCount = bands.reduce((sum, band) => sum + band.toBin - band.fromBin, 0);
  let peakLevel = 0;
  let lastBeat = -Infinity;

  // Returns the beat's strength (0.3–1), or null for no beat this frame.
  return function process(spectrumDb: Float32Array, now: number): number | null {
    let level = 0;
    // Average bin magnitude at the recent peak; tiny before anything played.
    const reference = Math.max(peakLevel / binCount, 1e-9);
    const fluxes = bands.map(band => {
      let flux = 0;
      for (let i = band.fromBin; i < band.toBin; i++) {
        const db = spectrumDb[i];
        const magnitude = Number.isFinite(db) ? 10 ** (db / 20) : 0;
        level += magnitude;
        const compressed = Math.log1p((COMPRESSION * magnitude) / reference);
        if (compressed > previous[i]) flux += compressed - previous[i];
        previous[i] = compressed;
      }
      return flux;
    });
    peakLevel = Math.max(level, peakLevel * PEAK_DECAY);
    const audible = level > peakLevel * SILENCE_GATE;

    let strength: number | null = null;
    bands.forEach((band, b) => {
      const flux = fluxes[b];
      if (band.history.length >= HISTORY_MIN) {
        const median = medianOf(band.history);
        const deviation = medianOf(band.history.map(f => Math.abs(f - median)));
        const threshold = Math.max(median + THRESHOLD_DEVIATIONS * deviation, MIN_FLUX);
        const above = audible && flux > threshold;
        // Once per crossing, not on every frame a hit stays loud.
        if (above && !band.wasAbove) {
          const t = Math.min(1, (flux - threshold) / (3 * threshold));
          strength = Math.max(strength ?? 0, 0.3 + 0.7 * t);
        }
        band.wasAbove = above;
      }
      band.history.push(flux);
      if (band.history.length > HISTORY_SIZE) band.history.shift();
    });

    if (strength === null || now - lastBeat <= MIN_BEAT_GAP_MS) return null;
    lastBeat = now;
    return strength;
  };
}

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
      analyser.fftSize = ANALYSER_FFT_SIZE;
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
      const spectrum = new Float32Array(node.frequencyBinCount);
      const process = createBeatDetector(audioCtx.sampleRate, node.fftSize);

      const tick = (now: number) => {
        // A layout swap mid-playback mounts a fresh <audio> — follow it.
        if (audioRef.current && audioRef.current !== connectedEl) connect(audioRef.current);
        node.getFloatFrequencyData(spectrum);
        const strength = process(spectrum, now);
        if (strength !== null) emitBeat(strength);
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
