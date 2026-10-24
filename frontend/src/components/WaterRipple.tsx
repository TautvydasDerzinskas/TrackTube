import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { subscribeToBeats } from '../hooks/useBeatDetector';

interface WaterRippleProps {
  // The same image the child shows — redrawn on top of it, refracted by the
  // water, while there are waves. Without one, only the light on the waves
  // is drawn.
  src: string | null | undefined;
  // Only takes beats while true — i.e. this is the current track and it's
  // playing. Waves already running still settle after it turns false.
  active: boolean;
  // Theme spacing units, matching the child's own borderRadius.
  borderRadius?: number;
  children: React.ReactNode;
}

// Caps the simulated grid, so a large thumbnail (the track page header)
// costs about what a small one does: it just gets coarser cells.
const MAX_CELLS = 2500;

// Wave height kept per frame (lower = waves die out sooner).
const DAMPING = 0.96;
const DROP_RADIUS = 2.5;
const DROP_DEPTH = 28;
// Keeps drops off the very edges, where half the ripple would be lost.
const DROP_MARGIN = 0.15;
// Image shift in px per unit of water slope.
const REFRACTION = 0.1;
// Highlight/shadow alpha per unit of slope, lit from the top left.
const SHADE = 0.012;
const MAX_SHADE = 0.3;
const MIN_SHADE = 0.01;
// The loop stops once no point of the surface moves more than this.
const REST_EPSILON = 0.05;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface Water {
  drop: (strength: number) => void;
  dispose: () => void;
}

/**
 * Classic two-buffer height-field water, one cell per CSS px (coarser past
 * MAX_CELLS). The cover is
 * redrawn cell by cell with drawImage, offset by the surface's slope — it
 * never reads pixels back, so cross-origin thumbnails work without CORS.
 * Nothing runs while the surface is flat; the canvas is then cleared and the
 * plain image underneath shows through.
 */
function createWater(canvas: HTMLCanvasElement, getImage: () => HTMLImageElement | null): Water {
  const ctx = canvas.getContext('2d');
  let cols = 0;
  let rows = 0;
  let current = new Float32Array(0);
  let previous = new Float32Array(0);
  let frame: number | undefined;

  // Sized lazily on each drop, so a thumbnail that changed size (the
  // mobile/desktop MiniPlayer layouts differ) starts a fresh surface.
  const fit = () => {
    const { width, height } = canvas.getBoundingClientRect();
    const cell = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_CELLS)));
    const nextCols = Math.round(width / cell);
    const nextRows = Math.round(height / cell);
    if (nextCols === cols && nextRows === rows) return;
    cols = nextCols;
    rows = nextRows;
    current = new Float32Array(cols * rows);
    previous = new Float32Array(cols * rows);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // Everything below draws in cell units.
    if (cols && rows) ctx?.setTransform((width * dpr) / cols, 0, 0, (height * dpr) / rows, 0, 0);
  };

  const step = () => {
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        previous[i] = ((current[i - 1] + current[i + 1] + current[i - cols] + current[i + cols]) / 2 - previous[i]) * DAMPING;
      }
    }
    [current, previous] = [previous, current];
  };

  // Returns whether the surface is still moving.
  const draw = (): boolean => {
    if (!ctx) return false;
    ctx.clearRect(0, 0, cols, rows);
    const image = getImage();
    const ready = Boolean(image?.complete && image.naturalWidth);
    // object-fit: cover, as the Avatar's own <img> crops it.
    const scale = ready ? Math.max(cols / image!.naturalWidth, rows / image!.naturalHeight) : 1;
    const cell = 1 / scale;
    const sourceX = ready ? (image!.naturalWidth - cols * cell) / 2 : 0;
    const sourceY = ready ? (image!.naturalHeight - rows * cell) / 2 : 0;
    let peak = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const h = current[i];
        if (Math.abs(h) > peak) peak = Math.abs(h);
        const dx = (x > 0 ? current[i - 1] : h) - (x < cols - 1 ? current[i + 1] : h);
        const dy = (y > 0 ? current[i - cols] : h) - (y < rows - 1 ? current[i + cols] : h);
        if (ready) {
          const sx = clamp(sourceX + (x + dx * REFRACTION) * cell, 0, image!.naturalWidth - cell);
          const sy = clamp(sourceY + (y + dy * REFRACTION) * cell, 0, image!.naturalHeight - cell);
          ctx.drawImage(image!, sx, sy, cell, cell, x, y, 1, 1);
        }
        const shade = clamp((dx + dy) * SHADE, -MAX_SHADE, MAX_SHADE);
        if (Math.abs(shade) > MIN_SHADE) {
          ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade.toFixed(2)})` : `rgba(0,0,0,${(-shade).toFixed(2)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return peak > REST_EPSILON;
  };

  const tick = () => {
    step();
    if (draw()) {
      frame = requestAnimationFrame(tick);
    } else {
      ctx?.clearRect(0, 0, cols, rows);
      current.fill(0);
      previous.fill(0);
      frame = undefined;
    }
  };

  return {
    drop(strength) {
      fit();
      if (cols < 3 || rows < 3) return;
      const cx = cols * (DROP_MARGIN + Math.random() * (1 - 2 * DROP_MARGIN));
      const cy = rows * (DROP_MARGIN + Math.random() * (1 - 2 * DROP_MARGIN));
      const radius = DROP_RADIUS * (0.7 + 0.6 * strength);
      for (let y = Math.max(1, Math.floor(cy - radius)); y <= Math.min(rows - 2, Math.ceil(cy + radius)); y++) {
        for (let x = Math.max(1, Math.floor(cx - radius)); x <= Math.min(cols - 2, Math.ceil(cx + radius)); x++) {
          const distance = Math.hypot(x - cx, y - cy);
          if (distance < radius) current[y * cols + x] -= DROP_DEPTH * strength * (1 - distance / radius);
        }
      }
      if (frame === undefined) frame = requestAnimationFrame(tick);
    },
    dispose() {
      if (frame !== undefined) cancelAnimationFrame(frame);
    },
  };
}

/**
 * Turns a thumbnail into a water surface: every detected beat (see
 * useBeatDetector) drops into it at a random spot, and the ripples spread,
 * bounce off the edges and bend the artwork as they pass.
 */
export function WaterRipple({ src, active, borderRadius = 1, children }: WaterRippleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const waterRef = useRef<Water>();

  useEffect(() => {
    if (!src) {
      imageRef.current = null;
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    imageRef.current = image;
  }, [src]);

  // One surface for the component's lifetime, so pausing and resuming
  // carries on with the same water instead of starting a second loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const water = createWater(canvas, () => imageRef.current);
    waterRef.current = water;
    return () => water.dispose();
  }, []);

  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return subscribeToBeats(strength => waterRef.current?.drop(strength));
  }, [active]);

  return (
    <Box sx={{ position: 'relative', display: 'flex', flexShrink: 0, borderRadius, overflow: 'hidden' }}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </Box>
  );
}
