// Drift Circuit screens: the heading-up race view, the garage and the championship.
import { Game, LevelSelect, Result, Scene, Title, backdrop, bar, compose, dot, panel, text, TAU } from "./gamekit.js";
import { CUPS, MAX_PART, PARTS, RACES, Race, TRACK_WIDTH, cupOf, formatTime, partCost } from "./logic.js";

export const game = new Game({ id: "drift-circuit", title: "Drift Circuit", theme: { accent: "#fb7185", onAccent: "#2a060e", bg: "#0d0a0e", bg2: "#2a0f18", panel: "#34141f" }, defaults: { coins: 0, parts: { engine: 0, tyres: 0, nitro: 0 }, placed: [], laps: [] } });
const data = game.store.data;

const HELP = [
  ["Steering", "Your car accelerates by itself. Hold the left side of the screen to turn left, and the right side to turn right."],
  ["Drifting", "Hold a turn for a moment at speed and the car starts to slide. The longer you drift, the more boost you charge.\n\nLet go to fire it. Short drifts give nothing, so commit to the corner."],
  ["The grass", "Leaving the road cuts your speed sharply. Stray too far and you are put back on the track."],
  ["The championship", "Finish in the top three to open the next race. Prize money buys engine, tyre and nitro upgrades in the garage."],
];

function art(c, g, t) {
  backdrop(c, g, t);
  c.strokeStyle = "rgba(251,113,133,.5)";
  c.lineWidth = 18;
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * TAU;
    const r = 110 + Math.sin(a * 3) * 34;
    c.lineTo(195 + Math.cos(a) * r, 340 + Math.sin(a) * r);
  }
  c.stroke();
  const a = t * 0.8, r = 110 + Math.sin(a * 3) * 34;
  dot(c, 195 + Math.cos(a) * r, 340 + Math.sin(a) * r, 9, "#fff");
}

const title = () => new Title(game, { tag: `${data.coins} coins`, art, help: HELP, play: () => game.go(season()), buttons: [["Garage", () => game.go(new Garage(game))]] });
const season = () => new LevelSelect(game, {
  title: "Championship",
  count: RACES,
  unlocked: (i) => i === 0 || (data.placed[i - 1] && data.placed[i - 1] <= 3),
  stars: (i) => (data.placed[i] ? 4 - Math.min(4, data.placed[i]) : 0),
  pick: (i) => game.go(new Drive(game, i)),
  back: () => game.go(title()),
});

class Garage extends Scene {
  enter() { this.layout(); }
  layout() {
    const g = this.g;
    this.ui.clear();
    Object.keys(PARTS).forEach((id, i) => {
      const lvl = data.parts[id] || 0, p = PARTS[id], cost = partCost(id, lvl);
      const b = this.ui.button(24, 130 + i * 104, 342, 92, p.name, () => {
        if (lvl >= MAX_PART || data.coins < cost) { g.sound.play("bad"); return; }
        data.coins -= cost;
        data.parts[id] = lvl + 1;
        g.store.save();
        g.sound.play("power");
        this.layout();
      }, {
        draw: (c) => {
          text(c, p.name, b.x + 16, b.y + 24, { size: 18, align: "left", weight: 800 });
          text(c, p.text, b.x + 16, b.y + 47, { size: 12, align: "left", color: g.theme.muted });
          for (let k = 0; k < MAX_PART; k++) panel(c, b.x + 16 + k * 34, b.y + 64, 28, 8, k < lvl ? g.theme.accent : "rgba(255,255,255,.12)", 4);
          text(c, lvl >= MAX_PART ? "Maxed" : `${cost} coins`, b.x + b.w - 14, b.y + 26, { size: 14, align: "right", color: data.coins >= cost ? g.theme.gold : g.theme.muted, weight: 700 });
        },
      });
    });
    this.ui.button(55, g.H - 70, 280, 50, "Back", () => g.go(title()));
  }
  draw(c) {
    const g = this.g;
    backdrop(c, g, this.t);
    text(c, "Garage", g.W / 2, 64, { size: 30, weight: 800 });
    text(c, `${data.coins} coins`, g.W / 2, 100, { size: 17, color: g.theme.gold, weight: 700 });
  }
}

class Drive extends Scene {
  constructor(g, index) { super(g); this.index = index; }
  enter() {
    const g = this.g;
    this.race = new Race(this.index, data.parts);
    this.input = new Map();
    this.view = this.race.car.h;
    this.skids = [];
    this.paused = false;
    g.sound.music(compose(this.index + 21, 132, 82));
    this.pause = this.ui.button(g.W - 66, 8, 58, 34, "Pause", () => { this.paused = !this.paused; this.pause.label = this.paused ? "Play" : "Pause"; this.quit.hidden = !this.paused; }, { size: 12 });
    this.quit = this.ui.button(95, 300, 200, 50, "Quit race", () => { g.sound.stopMusic(); g.go(season()); }, { hidden: true, style: "danger" });
  }
  hidden() { if (!this.paused) this.pause.fn(); }
  down(p) { this.input.set(p.id, p.x < 195 ? -1 : 1); }
  move(p) { if (this.input.has(p.id)) this.input.set(p.id, p.x < 195 ? -1 : 1); }
  up(p) { this.input.delete(p.id); }
  steer() { return [...this.input.values()].pop() || 0; }
  update(dt) {
    if (this.paused) return;
    const r = this.race, g = this.g, c = r.car;
    const before = r.state, boost = c.boost, drift = c.drift;
    r.step(dt, this.steer());
    if (before === "countdown" && r.state === "racing") g.sound.tone(880, 0.4, { type: "square", vol: 0.12 });
    if (before === "countdown" && Math.ceil(-r.t) !== Math.ceil(-(r.t - dt))) g.sound.tone(440, 0.15, { type: "square", vol: 0.1 });
    if (c.boost > boost) { g.sound.play("power"); g.buzz(25); }
    if (c.drift && !drift) g.sound.noise(0.2, 0.08);
    if (c.drift && this.t % 0.05 < dt) { this.skids.push([c.x, c.y]); if (this.skids.length > 120) this.skids.shift(); }
    let diff = c.h - this.view;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    this.view += diff * Math.min(1, dt * 7);
    if (r.state === "cooldown") {
      r.cooldown += dt;
      if (r.cooldown > 1.5) this.finish();
    }
  }
  finish() {
    const g = this.g, r = this.race, i = this.index;
    r.state = "done";
    g.sound.stopMusic();
    const prize = r.prize();
    data.coins += prize;
    if (!data.placed[i] || r.place < data.placed[i]) data.placed[i] = r.place;
    if (!data.laps[i] || r.bestLap() < data.laps[i]) data.laps[i] = r.bestLap();
    g.store.save();
    const buttons = [];
    if (r.place <= 3 && i + 1 < RACES) buttons.push(["Next race", () => g.go(new Drive(g, i + 1)), "primary"]);
    buttons.push(["Race again", () => g.go(new Drive(g, i)), r.place <= 3 ? "ghost" : "primary"], ["Garage", () => g.go(new Garage(g))], ["Championship", () => g.go(season())]);
    g.go(new Result(g, { title: r.place === 1 ? "Winner" : `Place ${r.place}`, good: r.place <= 3, stars: 4 - Math.min(4, r.place), lines: [`+${prize} coins`, `Best lap ${formatTime(r.bestLap())}`, r.place <= 3 ? "" : "Top three opens the next race"], buttons }));
  }
  draw(c) {
    const g = this.g, r = this.race, car = r.car, t = r.track, cup = CUPS[cupOf(this.index)];
    c.fillStyle = cup.grass;
    c.fillRect(-10, -10, g.W + 20, g.H + 20);
    const zoom = 0.72 - Math.min(0.14, (car.speed / 900) * 0.2);
    c.save();
    c.translate(g.W / 2, g.H * 0.72);
    c.rotate(-this.view - Math.PI / 2);
    c.scale(zoom, zoom);
    c.translate(-car.x, -car.y);
    const reach = 1300;
    const stroke = (w, color, dash) => {
      c.strokeStyle = color;
      c.lineWidth = w;
      c.setLineDash(dash || []);
      c.beginPath();
      let pen = false;
      for (let i = 0; i <= t.len; i++) {
        const p = t.pts[i % t.len];
        const near = Math.abs(p[0] - car.x) < reach && Math.abs(p[1] - car.y) < reach;
        if (near && pen) c.lineTo(p[0], p[1]); else if (near) { c.moveTo(p[0], p[1]); pen = true; } else pen = false;
      }
      c.stroke();
      c.setLineDash([]);
    };
    c.lineJoin = "round";
    stroke(TRACK_WIDTH + 18, "#f1f5f9", [30, 30]);
    stroke(TRACK_WIDTH, cup.road);
    stroke(3, "rgba(255,255,255,.35)", [24, 34]);
    const [sx, sy] = t.pts[2], sd = t.dirs[2];
    c.strokeStyle = "#fff";
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(sx - Math.sin(sd) * 60, sy + Math.cos(sd) * 60);
    c.lineTo(sx + Math.sin(sd) * 60, sy - Math.cos(sd) * 60);
    c.stroke();
    for (const [x, y] of this.skids) dot(c, x, y, 5, "rgba(0,0,0,.28)");
    for (const rv of r.rivals) {
      const p = r.rivalAt(rv);
      this.car(c, p.x, p.y, p.h, rv.color);
    }
    this.car(c, car.x, car.y, car.h, "#fff", car.boost > 0, car.drift);
    c.restore();
    text(c, `${r.rank()}`, 28, 30, { size: 34, weight: 900 });
    text(c, `of ${r.rivals.length + 1}`, 28, 56, { size: 11, color: g.theme.muted });
    text(c, `Lap ${Math.min(r.laps, r.lapTimes.length + 1)}/${r.laps}`, 118, 22, { size: 16, weight: 800 });
    text(c, formatTime(Math.max(0, r.t - r.lapStart)), 118, 44, { size: 12, color: g.theme.muted });
    text(c, `${Math.round(car.speed / 4)} km/h`, g.W / 2 + 40, 22, { size: 14, weight: 700 });
    bar(c, 90, g.H - 26, 210, 12, car.boost > 0 ? car.boost / 2 : car.charge / 2, car.boost > 0 ? "#fbbf24" : g.theme.accent);
    text(c, car.boost > 0 ? "BOOST" : car.drift ? "DRIFT" : "", g.W / 2, g.H - 44, { size: 13, weight: 800, color: g.theme.gold });
    this.minimap(c);
    if (r.state === "countdown") text(c, r.t < 0 ? String(Math.ceil(-r.t)) : "GO", g.W / 2, g.H * 0.4, { size: 76, weight: 900 });
    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,.6)";
      c.fillRect(0, 0, g.W, g.H);
      text(c, "Paused", g.W / 2, 240, { size: 32, weight: 800 });
    }
    if (!this.input.size && r.t < 6 && r.state !== "countdown") text(c, "Hold left or right to steer", g.W / 2, g.H * 0.86, { size: 14, color: "#fff" });
  }
  car(c, x, y, h, color, boost, drift) {
    c.save();
    c.translate(x, y);
    c.rotate(h + (drift ? Math.sign(this.race.car.steer) * 0.25 : 0));
    if (boost) panel(c, -44, -8, 22, 16, "#fbbf24", 6);
    panel(c, -22, -12, 44, 24, color, 6);
    panel(c, -2, -9, 14, 18, "#0f172a", 3);
    c.restore();
  }
  minimap(c) {
    const r = this.race, t = r.track, g = this.g;
    const mx = g.W - 54, my = 96, k = 0.038;
    panel(c, mx - 48, my - 44, 96, 88, "rgba(0,0,0,.4)", 10);
    c.strokeStyle = "rgba(255,255,255,.6)";
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= t.len; i += 4) { const p = t.pts[i % t.len]; c.lineTo(mx + p[0] * k, my + p[1] * k); }
    c.closePath();
    c.stroke();
    for (const rv of r.rivals) { const p = r.rivalAt(rv); dot(c, mx + p.x * k, my + p.y * k, 2.5, rv.color); }
    dot(c, mx + r.car.x * k, my + r.car.y * k, 3.5, "#fff");
  }
}

game.start(title());
