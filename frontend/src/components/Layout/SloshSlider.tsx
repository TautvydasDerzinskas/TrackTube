import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

interface SloshSliderProps {
  // 0–1, same scale as PlayerContext's volume.
  value: number;
  onChange: (value: number) => void;
  'aria-label'?: string;
  // Short synthesized tick every 5% while adjusting — no audio files.
  enableSound?: boolean;
}

const TRACK_HEIGHT = 28;
// Keeps the rigid handle clear of the track's rounded ends.
const HANDLE_INSET = 6;
const KEY_STEP = 0.05;
const PAGE_STEP = 0.1;
const TICK_STEP = 0.05;

// The fill is a spring chasing the handle — a slightly underdamped one, so it
// lags while dragging and overshoots a touch when the handle stops.
const FILL_STIFFNESS = 150;
const FILL_DAMPING = 16;
// The fill's leading edge leans with its speed (px of lean per px/s), and
// that lean is itself a loosely damped spring — which is the actual "slosh"
// back and forth once the fill comes to rest.
const LEAN_PER_VELOCITY = 0.025;
const MAX_LEAN = TRACK_HEIGHT * 0.8;
const LEAN_STIFFNESS = 240;
const LEAN_DAMPING = 7;
// A meniscus bulge on the edge, kicked by the lean lagging its target.
const BULGE_STIFFNESS = 320;
const BULGE_DAMPING = 9;
const BULGE_PER_LEAN_ERROR = 0.6;
const MAX_BULGE = 10;

const REST_EPSILON = 0.05;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface Sim {
  pos: number; vel: number;
  lean: number; leanVel: number;
  bulge: number; bulgeVel: number;
}

function edgePath(x: number, lean: number, bulge: number, height: number) {
  const top = x + lean / 2;
  const bottom = x - lean / 2;
  return `M0 0 H${top} C${top + bulge} ${height * 0.35} ${bottom + bulge} ${height * 0.65} ${bottom} ${height} H0 Z`;
}

export function SloshSlider({ value, onChange, 'aria-label': ariaLabel, enableSound = true }: SloshSliderProps) {
  const theme = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<SVGPathElement>(null);
  const backRef = useRef<SVGPathElement>(null);
  const widthRef = useRef(0);
  const targetRef = useRef(0);
  const simRef = useRef<Sim>({ pos: 0, vel: 0, lean: 0, leanVel: 0, bulge: 0, bulgeVel: 0 });
  const frameRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>();
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const audioCtxRef = useRef<AudioContext>();
  const lastTickRef = useRef(Math.round(value / TICK_STEP));

  const draw = useCallback(() => {
    const { pos, lean, bulge } = simRef.current;
    frontRef.current?.setAttribute('d', edgePath(pos, lean, bulge, TRACK_HEIGHT));
    // A fainter layer sloshing in counter-phase gives the liquid some depth.
    backRef.current?.setAttribute('d', edgePath(pos + 1, -lean * 0.7, -bulge * 0.8, TRACK_HEIGHT));
  }, []);

  const step = useCallback((now: number) => {
    const dt = Math.min((now - (lastFrameTimeRef.current ?? now)) / 1000, 1 / 30);
    lastFrameTimeRef.current = now;
    const s = simRef.current;
    const target = targetRef.current;

    s.vel += (FILL_STIFFNESS * (target - s.pos) - FILL_DAMPING * s.vel) * dt;
    s.pos += s.vel * dt;

    const leanTarget = clamp(s.vel * LEAN_PER_VELOCITY, -MAX_LEAN, MAX_LEAN);
    s.leanVel += (LEAN_STIFFNESS * (leanTarget - s.lean) - LEAN_DAMPING * s.leanVel) * dt;
    s.lean = clamp(s.lean + s.leanVel * dt, -MAX_LEAN, MAX_LEAN);

    const bulgeTarget = clamp((leanTarget - s.lean) * BULGE_PER_LEAN_ERROR, -MAX_BULGE, MAX_BULGE);
    s.bulgeVel += (BULGE_STIFFNESS * (bulgeTarget - s.bulge) - BULGE_DAMPING * s.bulgeVel) * dt;
    s.bulge = clamp(s.bulge + s.bulgeVel * dt, -MAX_BULGE, MAX_BULGE);

    const atRest = Math.abs(target - s.pos) < REST_EPSILON && Math.abs(s.vel) < REST_EPSILON
      && Math.abs(s.lean) < REST_EPSILON && Math.abs(s.leanVel) < REST_EPSILON
      && Math.abs(s.bulge) < REST_EPSILON && Math.abs(s.bulgeVel) < REST_EPSILON;
    if (atRest) {
      simRef.current = { pos: target, vel: 0, lean: 0, leanVel: 0, bulge: 0, bulgeVel: 0 };
      draw();
      frameRef.current = undefined;
      lastFrameTimeRef.current = undefined;
      return;
    }
    draw();
    frameRef.current = requestAnimationFrame(step);
  }, [draw]);

  // Only ticks while something is actually moving — idle sliders cost nothing.
  const kick = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      simRef.current = { pos: targetRef.current, vel: 0, lean: 0, leanVel: 0, bulge: 0, bulgeVel: 0 };
      draw();
      return;
    }
    if (frameRef.current === undefined) frameRef.current = requestAnimationFrame(step);
  }, [draw, step]);

  // Measures the track and snaps the fill straight to the current value on
  // first layout (no slosh just from the popover opening).
  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const isFirst = widthRef.current === 0;
      widthRef.current = entry.contentRect.width;
      targetRef.current = value * widthRef.current;
      if (isFirst) {
        simRef.current.pos = targetRef.current;
        draw();
      } else {
        kick();
      }
    });
    observer.observe(trackEl);
    return () => observer.disconnect();
    // value is read only to seed the first measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, kick]);

  useEffect(() => {
    // Presets / global shortcuts move the value too — don't tick for those
    // on the next drag.
    lastTickRef.current = Math.round(value / TICK_STEP);
    if (!widthRef.current) return;
    targetRef.current = value * widthRef.current;
    kick();
  }, [value, kick]);

  useEffect(() => () => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  const playTick = (v: number) => {
    if (!enableSound) return;
    const ctx = audioCtxRef.current ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.type = 'triangle';
    // Pitch rises with the level, so the ticks themselves hint at loudness.
    osc.frequency.setValueAtTime(900 + v * 900, t);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  };

  const emit = (raw: number) => {
    const next = Math.round(clamp(raw, 0, 1) * 100) / 100;
    if (next === value) return;
    const tick = Math.round(next / TICK_STEP);
    if (tick !== lastTickRef.current) {
      lastTickRef.current = tick;
      playTick(next);
    }
    onChange(next);
  };

  const valueFromClientX = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    draggingRef.current = true;
    setDragging(true);
    emit(valueFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) emit(valueFromClientX(e.clientX));
  };

  const handlePointerEnd = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Cmd/Ctrl+arrows are the global next/previous/volume shortcuts.
    if (e.metaKey || e.ctrlKey) return;
    const deltas: Record<string, number> = {
      ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP,
      PageUp: PAGE_STEP, PageDown: -PAGE_STEP,
    };
    if (e.key in deltas) emit(value + deltas[e.key]);
    else if (e.key === 'Home') emit(0);
    else if (e.key === 'End') emit(1);
    else return;
    e.preventDefault();
  };

  const accent = theme.palette.primary.main;
  const percent = Math.round(value * 100);

  return (
    <Box
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      sx={{
        position: 'relative', height: TRACK_HEIGHT, borderRadius: `${TRACK_HEIGHT / 2}px`,
        overflow: 'hidden', cursor: 'pointer', touchAction: 'none', outline: 'none',
        bgcolor: 'action.hover',
        boxShadow: `inset 0 1px 2px ${alpha(theme.palette.common.black, 0.15)}`,
        '&:focus-visible': { boxShadow: `0 0 0 3px ${alpha(accent, 0.35)}` },
      }}
    >
      <svg width="100%" height={TRACK_HEIGHT} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden>
        <path ref={backRef} fill={alpha(accent, 0.35)} />
        <path ref={frontRef} fill={accent} />
      </svg>
      {/* Rigid — tracks the value directly, never the spring. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute', top: '50%',
          left: `clamp(${HANDLE_INSET}px, ${value * 100}%, calc(100% - ${HANDLE_INSET}px))`,
          width: 4, height: dragging ? 20 : 16, borderRadius: 2,
          bgcolor: 'common.white',
          boxShadow: `0 1px 3px ${alpha(theme.palette.common.black, 0.35)}`,
          transform: 'translate(-50%, -50%)',
          transition: 'height 120ms ease',
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}
