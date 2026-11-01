// Drift Circuit rules: car physics, generated tracks, rivals and the championship. No drawing here, so it can be tested.
import { Rng, clamp } from "./gamekit.js";

export const LAPS = 3, RIVALS = 5, TRACK_WIDTH = 120, SPACING = 14;
export const CUPS = [
  { name: "Dust Cup", skill: 0.72, tracks: 4, grass: "#3f6212", road: "#57534e" },
  { name: "Harbour Cup", skill: 0.85, tracks: 4, grass: "#155e75", road: "#475569" },
  { name: "Neon Cup", skill: 0.96, tracks: 4, grass: "#2e1065", road: "#3f3f46" },
];
export const RACES = CUPS.reduce((n, c) => n + c.tracks, 0);
export const PARTS = {
  engine: { name: "Engine", text: "Higher top speed", cost: 60 },
  tyres: { name: "Tyres", text: "More grip in corners", cost: 50 },
  nitro: { name: "Nitro", text: "Stronger, longer boosts", cost: 50 },
};
export const MAX_PART = 5;
export const PRIZES = [120, 80, 50, 30, 20, 10];

export const partCost = (id, lvl) => PARTS[id].cost * (lvl + 1);
export const cupOf = (race) => { let i = race; for (let c = 0; c < CUPS.length; c++) { if (i < CUPS[c].tracks) return c; i -= CUPS[c].tracks; } return CUPS.length - 1; };

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A closed loop through points around a circle, smoothed with a Catmull-Rom spline and evened out by length. */
export function makeTrack(seed) {
  const rng = new Rng(seed * 733 + 5);
  const n = rng.int(9, 13);
  const ctrl = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rng.range(620, 1050);
    ctrl.push([Math.cos(a) * r * 1.15, Math.sin(a) * r]);
  }
  const raw = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [ctrl[(i + n - 1) % n], ctrl[i], ctrl[(i + 1) % n], ctrl[(i + 2) % n]];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const f = (j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
      raw.push([f(0), f(1)]);
    }
  }
  const pts = [];
  let acc = 0;
  pts.push(raw[0]);
  for (let i = 1; i < raw.length; i++) {
    acc += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    if (acc >= SPACING) { pts.push(raw[i]); acc = 0; }
  }
  const len = pts.length;
  const dirs = pts.map((p, i) => { const q = pts[(i + 1) % len]; return Math.atan2(q[1] - p[1], q[0] - p[0]); });
  const curve = dirs.map((d, i) => Math.abs(angleDiff(dirs[(i + 8) % len], d)) / (8 * SPACING));
  return { pts, dirs, curve, len, length: len * SPACING };
}

export class Car {
  constructor(x, y, heading, parts = {}) {
    this.x = x; this.y = y; this.h = heading;
    this.vx = 0; this.vy = 0;
    this.parts = parts;
    this.steer = 0;
    this.held = 0;
    this.drift = false;
    this.charge = 0;
    this.boost = 0;
    this.off = false;
  }
  get top() { return 400 + (this.parts.engine || 0) * 22; }
  get grip() { return 8 + (this.parts.tyres || 0) * 1.1; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  /** input is -1, 0 or 1: the side of the screen being held. */
  step(dt, input) {
    this.steer += clamp(input - this.steer, -dt * 9, dt * 9);
    const moving = this.speed / this.top;
    if (input) this.held += dt; else this.held = 0;
    if (input && this.held > 0.32 && moving > 0.5) this.drift = true;
    if (this.drift) {
      this.charge = Math.min(2, this.charge + dt);
      if (!input) {
        this.drift = false;
        if (this.charge > 0.45) this.boost = this.charge * (0.75 + (this.parts.nitro || 0) * 0.08);
        this.charge = 0;
      }
    }
    this.h += this.steer * dt * (this.drift ? 2.5 : 2.1) * clamp(moving * 2, 0, 1);
    const cos = Math.cos(this.h), sin = Math.sin(this.h);
    let f = this.vx * cos + this.vy * sin;
    let l = -this.vx * sin + this.vy * cos;
    let target = this.top * (this.off ? 0.42 : 1);
    if (this.boost > 0) { target *= 1.32 + (this.parts.nitro || 0) * 0.03; this.boost -= dt; }
    if (this.drift) target *= 0.93;
    f += clamp(target - f, -520 * dt, (this.boost > 0 ? 420 : 240) * dt);
    l *= Math.exp(-(this.drift ? 2.4 : this.grip) * dt);
    this.vx = f * cos - l * sin;
    this.vy = f * sin + l * cos;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

export class Race {
  constructor(index, parts = {}, { seed = null, laps = LAPS, rivals = RIVALS } = {}) {
    this.index = index;
    this.cup = cupOf(index);
    this.track = makeTrack(seed ?? index + 1);
    this.laps = laps;
    const t = this.track, [x, y] = t.pts[2];
    this.car = new Car(x, y, t.dirs[2], parts);
    this.idx = 2;
    this.dist = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.t = -3;
    this.state = "countdown";
    const skill = CUPS[this.cup].skill + index * 0.004;
    this.rivals = Array.from({ length: rivals }, (_, i) => ({ s: -(i + 1) * 34 + 30, skill: skill * (0.9 + (i / Math.max(1, rivals - 1)) * 0.14), side: (i % 3) - 1, name: NAMES[(index + i) % NAMES.length], color: COLORS[i], speed: 0, finished: null, id: i }));
    this.finishOrder = [];
    this.offTime = 0;
  }
  nearest() {
    const t = this.track, c = this.car;
    let best = this.idx, bd = Infinity;
    for (let k = -10; k <= 30; k++) {
      const i = (this.idx + k + t.len) % t.len;
      const d = (t.pts[i][0] - c.x) ** 2 + (t.pts[i][1] - c.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
  }
  rivalAt(r) {
    const t = this.track;
    const f = ((r.s % t.length) + t.length) % t.length / SPACING;
    const i = Math.floor(f) % t.len, n = (i + 1) % t.len, u = f - Math.floor(f);
    const a = t.pts[i], b = t.pts[n], dir = t.dirs[i];
    const off = r.side * 26;
    return { x: a[0] + (b[0] - a[0]) * u - Math.sin(dir) * off, y: a[1] + (b[1] - a[1]) * u + Math.cos(dir) * off, h: dir };
  }
  stepRival(r, dt) {
    const t = this.track;
    const i = Math.floor(((r.s % t.length) + t.length) % t.length / SPACING) % t.len;
    const bend = Math.max(t.curve[i], t.curve[(i + 8) % t.len], t.curve[(i + 16) % t.len]);
    const want = 460 * r.skill * clamp(1 - bend * 80, 0.55, 1);
    r.speed += clamp(want - r.speed, -420 * dt, 230 * dt);
    r.s += r.speed * dt;
    if (r.finished == null && r.s >= this.laps * t.length) { r.finished = this.t; this.finishOrder.push({ who: r.name, rival: true, t: this.t }); }
  }
  step(dt, input) {
    this.t += dt;
    if (this.state === "countdown") {
      if (this.t >= 0) this.state = "racing";
      return;
    }
    if (this.state !== "racing" && this.state !== "cooldown") return;
    for (const r of this.rivals) this.stepRival(r, dt);
    if (this.state === "cooldown") { this.car.step(dt, 0); return; }
    this.car.step(dt, input);
    const { i, d } = this.nearest();
    const len = this.track.len;
    const ahead = (i - this.idx + len) % len;
    if (ahead > 0 && ahead < 60) {
      const crossed = i < this.idx;
      this.dist += ahead * SPACING;
      this.idx = i;
      if (crossed) {
        this.lapTimes.push(this.t - this.lapStart);
        this.lapStart = this.t;
        if (this.lapTimes.length >= this.laps) this.finish();
      }
    }
    this.car.off = d > TRACK_WIDTH / 2;
    if (this.car.off) this.offTime += dt;
    if (d > TRACK_WIDTH * 2) { const p = this.track.pts[this.idx]; this.car.x = p[0]; this.car.y = p[1]; this.car.h = this.track.dirs[this.idx]; this.car.vx = this.car.vy = 0; this.car.drift = false; this.car.charge = 0; }
  }
  finish() {
    this.finishOrder.push({ who: "You", rival: false, t: this.t });
    this.place = this.finishOrder.length;
    this.state = "cooldown";
    this.cooldown = 0;
  }
  /** 1 is first place. */
  rank() {
    if (this.place) return this.place;
    const mine = this.dist + 2 * SPACING;
    return 1 + this.rivals.filter((r) => r.s > mine).length;
  }
  prize() { return PRIZES[(this.place || 6) - 1] + this.index * 4; }
  bestLap() { return this.lapTimes.length ? Math.min(...this.lapTimes) : null; }
}

const NAMES = ["Vega", "Rook", "Sable", "Juno", "Kestrel", "Onyx", "Marlow", "Pike", "Tamsin", "Zephyr"];
const COLORS = ["#60a5fa", "#a3e635", "#fbbf24", "#e879f9", "#fb923c"];

/** Hold-left, hold-right or nothing, like a thumb. Used in the tests to show every track can be driven. */
export function autopilot(race, look = 130) {
  const t = race.track, c = race.car;
  const ahead = (race.idx + Math.round(look / SPACING)) % t.len;
  const [px, py] = t.pts[ahead];
  const want = Math.atan2(py - c.y, px - c.x);
  const err = angleDiff(want, c.h);
  return Math.abs(err) < 0.06 ? 0 : Math.sign(err);
}

export const formatTime = (s) => (s == null ? "-" : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`);
