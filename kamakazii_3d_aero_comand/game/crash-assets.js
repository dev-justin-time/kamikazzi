// ─── Canvas-generated crash assets ────────────────────────────
// Replaces the deleted /assets/image/1.webp (crash splash) and
// /assets/image/explode.gif (explosion animation) with procedurally
// generated canvas images. No external files needed.
//
// The splash image is a radial gradient explosion background.
// The explosion frames are canvas drawings that simulate a GIF-like
// sequence when cycled through by modals.js playExplodeStep().

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d');

// ─── CRASH_SPLASH_URL ─────────────────────────────────────────
// Generated PNG data URL: dark radial gradient with scattered
// orange/red particles, sized 291×230 (matching the original 1.webp).

let _splashDataUrl = null;

/**
 * Generate (or return cached) crash splash image as a data URL.
 * Radial gradient from bright orange center → dark red edges,
 * overlaid with random explosion particle dots.
 * @returns {string} data:image/png URL
 */
export function getCrashSplashUrl() {
  if (_splashDataUrl) return _splashDataUrl;

  _canvas.width = 291;
  _canvas.height = 230;
  const ctx = _ctx;

  // Dark background
  ctx.fillStyle = '#0a0000';
  ctx.fillRect(0, 0, 291, 230);

  // Radial gradient — hot center bleeding to dark edges
  const gradient = ctx.createRadialGradient(145, 115, 5, 145, 115, 200);
  gradient.addColorStop(0, '#fff8e0');
  gradient.addColorStop(0.1, '#ff8800');
  gradient.addColorStop(0.3, '#ff4400');
  gradient.addColorStop(0.55, '#cc2200');
  gradient.addColorStop(0.75, '#660000');
  gradient.addColorStop(1, '#0a0000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 291, 230);

  // Glow rings
  for (let r = 0; r < 3; r++) {
    const radius = 40 + r * 30;
    ctx.beginPath();
    ctx.arc(145, 115, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, ${150 - r * 40}, 0, ${0.15 - r * 0.05})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Explosion particle dots scattered across the frame
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 291;
    const y = Math.random() * 230;
    const r = Math.random() * 8 + 1;
    const hue = 20 + Math.random() * 30;
    const sat = 80 + Math.random() * 20;
    const lit = 40 + Math.random() * 40;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.fill();
    // Small bright core
    if (r > 3) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 100%, ${Math.min(lit + 30, 95)}%)`;
      ctx.fill();
    }
  }

  // Central hot spot
  ctx.beginPath();
  ctx.arc(145, 115, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
  ctx.fill();

  _splashDataUrl = _canvas.toDataURL('image/png');
  return _splashDataUrl;
}

// ─── EXPLOSION FRAMES ─────────────────────────────────────────
// Instead of a GIF, we generate an array of PNG data URLs that
// modals.js cycles through. Each frame is a distinct explosion
// phase: boom → expand → dissipate → embers.

let _explosionFrames = null;

/**
 * Generate (or return cached) explosion animation frames.
 * Returns an array of 8 PNG data URLs simulating an explosion
 * from initial blast through to dissipating embers.
 * @returns {string[]} Array of 8 data:image/png URLs
 */
export function getExplosionFrames() {
  if (_explosionFrames) return _explosionFrames;

  const FRAME_COUNT = 8;
  const SIZE = 180;
  _canvas.width = SIZE;
  _canvas.height = SIZE;
  const ctx = _ctx;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const frames = [];

  for (let f = 0; f < FRAME_COUNT; f++) {
    const progress = f / (FRAME_COUNT - 1); // 0 → 1
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Core radius grows then shrinks
    const coreRadius = 10 + Math.sin(progress * Math.PI) * 50;

    // Hot inner core
    const r1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    const intensity = 1 - progress * 0.6;
    r1.addColorStop(0, `rgba(255, ${Math.floor(220 - progress * 150)}, ${Math.floor(100 - progress * 100)}, ${intensity})`);
    r1.addColorStop(0.3, `rgba(255, ${Math.floor(150 - progress * 80)}, 0, ${intensity * 0.9})`);
    r1.addColorStop(0.6, `rgba(255, ${Math.floor(80 - progress * 40)}, 0, ${intensity * 0.6})`);
    r1.addColorStop(1, `rgba(100, ${Math.floor(30 - progress * 20)}, 0, ${intensity * 0.3})`);
    ctx.fillStyle = r1;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius + 10, 0, Math.PI * 2);
    ctx.fill();

    // Outer glow ring
    const glowRadius = 20 + progress * 60;
    const r2 = ctx.createRadialGradient(cx, cy, coreRadius * 0.5, cx, cy, glowRadius);
    r2.addColorStop(0, `rgba(255, 100, 0, ${0.3 * (1 - progress)})`);
    r2.addColorStop(1, 'rgba(255, 50, 0, 0)');
    ctx.fillStyle = r2;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Smoke ring (appears in later frames)
    if (progress > 0.3) {
      const smokeAlpha = (progress - 0.3) * 0.5;
      const smokeRadius = 20 + progress * 55;
      const r3 = ctx.createRadialGradient(cx, cy, smokeRadius * 0.3, cx, cy, smokeRadius);
      r3.addColorStop(0, `rgba(80, 80, 80, ${smokeAlpha * 0.3})`);
      r3.addColorStop(0.5, `rgba(60, 60, 60, ${smokeAlpha * 0.5})`);
      r3.addColorStop(1, 'rgba(40, 40, 40, 0)');
      ctx.fillStyle = r3;
      ctx.beginPath();
      ctx.arc(cx, cy, smokeRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flying debris particles
    const particleCount = 20 + Math.floor(progress * 40);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 70 * (0.3 + progress * 0.7);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const size = 1 + Math.random() * 4 * (1 - progress * 0.5);
      const alpha = Math.random() * 0.8 * (1 - progress * 0.7);
      const hue = 20 + Math.random() * 30;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 100%, ${40 + Math.random() * 40}%, ${alpha})`;
      ctx.fill();
    }

    // Embers (tiny bright dots in later frames)
    if (progress > 0.5) {
      const emberCount = Math.floor((progress - 0.5) * 60);
      for (let i = 0; i < emberCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 80;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        ctx.beginPath();
        ctx.arc(px, py, 1 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${200 + Math.floor(Math.random() * 55)}, ${Math.floor(Math.random() * 50)}, ${0.4 + Math.random() * 0.5})`;
        ctx.fill();
      }
    }

    frames.push(_canvas.toDataURL('image/png'));
  }

  _explosionFrames = frames;
  return frames;
}

/**
 * Quick-access: get a single explosion frame by step index.
 * Cycles through available frames based on the step modulo frame count.
 * @param {number} step — Explosion step index (0-based)
 * @returns {string} data:image/png URL for that frame
 */
export function getExplosionFrame(step) {
  const frames = getExplosionFrames();
  return frames[step % frames.length];
}
