import assert from "node:assert/strict";
import test from "node:test";
import { CUPS, Car, LAPS, MAX_PART, PRIZES, RACES, Race, SPACING, TRACK_WIDTH, autopilot, cupOf, formatTime, makeTrack, partCost } from "../src/logic.js";

function drive(race, seconds = 240) {
  for (let f = 0; f < seconds * 60 && (race.state === "racing" || race.state === "countdown"); f++) race.step(1 / 60, autopilot(race));
  return race;
}

test("tracks repeat for a seed and close into a loop", () => {
  assert.deepEqual(makeTrack(3), makeTrack(3));
  assert.notDeepEqual(makeTrack(3).pts, makeTrack(4).pts);
  for (let s = 1; s <= RACES; s++) {
    const t = makeTrack(s);
    const [a, b] = [t.pts[0], t.pts[t.len - 1]];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < SPACING * 3, `track ${s}`);
    assert.ok(t.length > 3000 && t.length < 12000, `track ${s} length ${t.length}`);
  }
});

test("the road never crosses itself", () => {
  for (let s = 1; s <= RACES; s++) {
    const { pts, len } = makeTrack(s);
    for (let i = 0; i < len; i += 5) {
      for (let j = i + 40; j < len - 20 + Math.min(i, 20); j += 5) {
        if (j - i > len - 40) continue;
        const d = Math.hypot(pts[i][0] - pts[j % len][0], pts[i][1] - pts[j % len][1]);
        assert.ok(d > TRACK_WIDTH * 0.8, `track ${s}, samples ${i} and ${j} are ${d} apart`);
      }
    }
  }
});

test("a car speeds up to its top speed, and grass slows it", () => {
  const c = new Car(0, 0, 0);
  for (let i = 0; i < 400; i++) c.step(1 / 60, 0);
  assert.ok(Math.abs(c.speed - c.top) < 1);
  c.off = true;
  for (let i = 0; i < 200; i++) c.step(1 / 60, 0);
  assert.ok(c.speed < c.top * 0.5);
});

test("the engine raises top speed", () => {
  assert.ok(new Car(0, 0, 0, { engine: 3 }).top > new Car(0, 0, 0).top);
});

test("steering turns the correct way", () => {
  const c = new Car(0, 0, 0);
  for (let i = 0; i < 200; i++) c.step(1 / 60, 0);
  const h = c.h;
  for (let i = 0; i < 12; i++) c.step(1 / 60, 1);
  assert.ok(c.h > h);
});

test("a held turn becomes a drift, and letting go fires a boost", () => {
  const c = new Car(0, 0, 0);
  for (let i = 0; i < 200; i++) c.step(1 / 60, 0);
  for (let i = 0; i < 100; i++) c.step(1 / 60, 1);
  assert.ok(c.drift);
  assert.ok(c.charge > 0.45);
  c.step(1 / 60, 0);
  assert.equal(c.drift, false);
  assert.ok(c.boost > 0);
});

test("a short drift gives no boost", () => {
  const c = new Car(0, 0, 0);
  for (let i = 0; i < 200; i++) c.step(1 / 60, 0);
  for (let i = 0; i < 22; i++) c.step(1 / 60, 1);
  assert.ok(c.drift);
  c.step(1 / 60, 0);
  assert.equal(c.boost, 0);
});

test("boost goes beyond normal top speed", () => {
  const c = new Car(0, 0, 0);
  for (let i = 0; i < 300; i++) c.step(1 / 60, 0);
  c.boost = 3;
  for (let i = 0; i < 60; i++) c.step(1 / 60, 0);
  assert.ok(c.speed > c.top * 1.2);
});

test("a drifting car slides further sideways than a gripping one", () => {
  const slide = (drift) => {
    const c = new Car(0, 0, 0);
    c.vx = 0; c.vy = 300; c.drift = drift;
    c.step(0.1, drift ? 1 : 0);
    return Math.abs(c.vy);
  };
  assert.ok(slide(true) > slide(false));
});

test("the race waits for the countdown", () => {
  const r = new Race(0);
  r.step(1, 0);
  assert.equal(r.state, "countdown");
  assert.equal(r.car.speed, 0);
  for (let i = 0; i < 3; i++) r.step(1, 0);
  assert.equal(r.state, "racing");
});

test("driving backwards earns no progress", () => {
  const r = new Race(0, {}, { rivals: 0 });
  r.t = 0; r.state = "racing";
  r.car.h += Math.PI;
  for (let i = 0; i < 300; i++) r.step(1 / 60, 0);
  assert.equal(r.lapTimes.length, 0);
  assert.ok(r.dist < 300);
});

test("straying too far puts the car back on the road", () => {
  const r = new Race(0, {}, { rivals: 0 });
  r.t = 0; r.state = "racing";
  r.car.x += 900;
  r.step(1 / 60, 0);
  assert.ok(r.nearest().d < 40);
  assert.equal(r.car.speed < 10, true);
});

test("every track can be finished by a thumb that only holds left, right or nothing", () => {
  for (let i = 0; i < RACES; i++) {
    const r = drive(new Race(i));
    assert.equal(r.state, "cooldown", `race ${i + 1}`);
    assert.equal(r.lapTimes.length, LAPS);
    assert.ok(r.offTime < r.t * 0.25, `race ${i + 1} spent ${r.offTime}s on grass`);
  }
});

test("rivals finish every race and stay on the road", () => {
  const r = new Race(5);
  r.t = 0; r.state = "racing";
  r.car.step = () => {};
  for (let f = 0; f < 60 * 240 && r.rivals.some((x) => x.finished == null); f++) r.step(1 / 60, 0);
  assert.ok(r.rivals.every((x) => x.finished != null));
  for (const x of r.rivals) {
    const p = r.rivalAt(x);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test("a good stock car can place in the first cup, and the last cup demands upgrades", () => {
  const places = (from, to, parts) => { const out = []; for (let i = from; i < to; i++) out.push(drive(new Race(i, parts)).place); return out; };
  const first = places(0, 4, {});
  assert.ok(first.every((p) => p <= 3), `first cup ${first}`);
  const full = { engine: MAX_PART, tyres: MAX_PART, nitro: MAX_PART };
  const last = places(8, RACES, full);
  assert.ok(last.filter((p) => p <= 3).length >= 3, `last cup, upgraded ${last}`);
  const bare = places(8, RACES, {});
  assert.ok(bare.reduce((a, b) => a + b) > last.reduce((a, b) => a + b), `${bare} against ${last}`);
});

test("first place pays most, and parts cost more each level", () => {
  assert.deepEqual([...PRIZES].sort((a, b) => b - a), PRIZES);
  const r = new Race(0);
  r.place = 1;
  const a = r.prize();
  r.place = 6;
  assert.ok(a > r.prize());
  assert.ok(partCost("engine", 3) > partCost("engine", 0));
});

test("races map onto cups", () => {
  assert.equal(cupOf(0), 0);
  assert.equal(cupOf(4), 1);
  assert.equal(cupOf(RACES - 1), CUPS.length - 1);
});

test("times read naturally", () => {
  assert.equal(formatTime(65.5), "1:05.50");
  assert.equal(formatTime(null), "-");
});
