import type maplibregl from "maplibre-gl";
import type { WindPoint } from "@/types";

const TRAIL_LEN = 12;

interface Particle {
  trail: { x: number; y: number }[]; // newest at end
  age: number;
  maxAge: number;
}

/** Convert meteorological wind direction + speed to (u, v) components.
 *  Meteorological direction = where wind comes FROM, so flip 180° for movement. */
export function windToUV(speed: number, direction: number): [number, number] {
  const rad = ((direction + 180) * Math.PI) / 180;
  return [Math.sin(rad) * speed, -Math.cos(rad) * speed];
}

/** Inverse-distance weighting interpolation of wind vectors at a given point. */
export function interpolateWind(
  lat: number,
  lon: number,
  points: WindPoint[],
): [number, number] {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return windToUV(points[0].speed, points[0].direction);

  let sumU = 0, sumV = 0, sumW = 0;
  for (const p of points) {
    const dLat = lat - p.lat;
    const dLon = lon - p.lon;
    const dist2 = dLat * dLat + dLon * dLon;
    if (dist2 < 0.0001) return windToUV(p.speed, p.direction);
    const w = 1 / dist2;
    const [u, v] = windToUV(p.speed, p.direction);
    sumU += w * u;
    sumV += w * v;
    sumW += w;
  }
  return [sumU / sumW, sumV / sumW];
}

const PARTICLE_COUNT = 400;
const SPEED_SCALE = 0.12;
const MIN_AGE = 50;
const MAX_AGE = 90;
const MIN_DRAW_SPEED = 1;

function randomAge(): number {
  return MIN_AGE + Math.floor(Math.random() * (MAX_AGE - MIN_AGE));
}

interface GeoBounds { minLat: number; maxLat: number; minLon: number; maxLon: number }

function computeWindBounds(points: WindPoint[], pad = 1): GeoBounds {
  if (!points.length) return { minLat: 5, maxLat: 21, minLon: 97, maxLon: 108 };
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat: minLat - pad, maxLat: maxLat + pad, minLon: minLon - pad, maxLon: maxLon + pad };
}

function spawnParticle(map: maplibregl.Map, wb: GeoBounds): Particle {
  const lat = wb.minLat + Math.random() * (wb.maxLat - wb.minLat);
  const lon = wb.minLon + Math.random() * (wb.maxLon - wb.minLon);
  const px = map.project([lon, lat]);
  return { trail: [{ x: px.x, y: px.y }], age: 0, maxAge: randomAge() };
}

export function createWindParticleRenderer(
  canvas: HTMLCanvasElement,
  map: maplibregl.Map,
) {
  const ctx = canvas.getContext("2d")!;
  let windPoints: WindPoint[] = [];
  let windBounds: GeoBounds = { minLat: 5, maxLat: 21, minLon: 97, maxLon: 108 };
  let particles: Particle[] = [];
  let animId: number | null = null;
  let running = false;

  function resize() {
    const c = map.getContainer();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = c.clientWidth * dpr;
    canvas.height = c.clientHeight * dpr;
    canvas.style.width = c.clientWidth + "px";
    canvas.style.height = c.clientHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initParticles() {
    particles = Array.from({ length: PARTICLE_COUNT }, () => spawnParticle(map, windBounds));
    // Stagger ages so they don't all die together
    for (const p of particles) p.age = Math.floor(Math.random() * p.maxAge);
  }

  function frame() {
    if (!running) return;

    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    const zoom = map.getZoom();
    const zoomFactor = Math.min(Math.pow(2, zoom - 5), 4) * SPEED_SCALE;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const head = p.trail[p.trail.length - 1];
      const lngLat = map.unproject([head.x, head.y]);
      const [u, v] = interpolateWind(lngLat.lat, lngLat.lng, windPoints);
      const speed = Math.sqrt(u * u + v * v);

      // Advance head
      const nx = head.x + u * zoomFactor;
      const ny = head.y - v * zoomFactor;
      p.trail.push({ x: nx, y: ny });
      if (p.trail.length > TRAIL_LEN) p.trail.shift();
      p.age++;

      // Draw trail with fading opacity (tail→head)
      if (speed >= MIN_DRAW_SPEED && p.trail.length >= 2) {
        const baseAlpha = Math.min((speed - MIN_DRAW_SPEED) / 12, 1) * 0.8;
        const len = p.trail.length;
        for (let j = 1; j < len; j++) {
          const segAlpha = baseAlpha * (j / len);
          ctx.strokeStyle = `rgba(100, 170, 255, ${segAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.trail[j - 1].x, p.trail[j - 1].y);
          ctx.lineTo(p.trail[j].x, p.trail[j].y);
          ctx.stroke();
        }
      }

      // Respawn
      if (p.age >= p.maxAge || nx < -10 || nx > w + 10 || ny < -10 || ny > h + 10) {
        particles[i] = spawnParticle(map, windBounds);
      }
    }

    animId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    initParticles();
    animId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
  }

  function setWindData(points: WindPoint[]) {
    windPoints = points;
    windBounds = computeWindBounds(points);
  }

  function destroy() {
    stop();
    map.off("resize", resize);
  }

  map.on("resize", resize);
  return { start, stop, setWindData, resize, destroy };
}

export type WindParticleRenderer = ReturnType<typeof createWindParticleRenderer>;
