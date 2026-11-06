/* ===== Virtual Pet — core game ===== */
"use strict";

const canvas = document.getElementById("pet-canvas");
const ctx = canvas.getContext("2d");
let g = ctx; // active drawing surface (temporarily swapped for mini previews)

// --- HiDPI canvas sizing ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

// =============================
// Appearance catalog
// =============================
const CHARACTERS = {
  mochi: { name: "Mochi", bodyA: "#9fd6ec", bodyB: "#6fbcda", line: "rgba(47,92,118,0.35)",  feet: "#4fa3c2", earStyle: "bunny",  earColor: "#5fb4d6", blush: "rgba(255,120,160,0.40)" },
  rosi:  { name: "Rosi",  bodyA: "#ffb9cd", bodyB: "#f4739c", line: "rgba(122,47,75,0.35)",  feet: "#d95c85", earStyle: "bear",   earColor: "#f78fae", blush: "rgba(255,77,136,0.40)" },
  lima:  { name: "Lima",  bodyA: "#bde392", bodyB: "#7bc043", line: "rgba(60,100,40,0.35)",  feet: "#5d9a35", earStyle: "cat",    earColor: "#8fc960", blush: "rgba(255,157,92,0.45)" },
  uva:   { name: "Uva",   bodyA: "#cdbaf3", bodyB: "#9a7bd4", line: "rgba(80,50,120,0.35)",  feet: "#7d5fbf", earStyle: "droopy", earColor: "#a98ce0", blush: "rgba(255,95,143,0.40)" },
  michi: { name: "Michi", bodyA: "#ffe4c8", bodyB: "#fcba78", line: "rgba(122,74,32,0.35)",  feet: "#e08b46", earStyle: "kitty",  earColor: "#f6a35f", blush: "rgba(255,122,92,0.40)" },
};

const EAR_BASE_ROT = { bunny: 0.45, bear: 0.15, cat: 0.15, droopy: 1.05, kitty: 0.3 };

const BACKGROUNDS = [
  { id: "rosa",      a: "#fff8f0", b: "#ffeef6", c: "#ffe3ef", ring: "#ffd9e8", label: "Rosita" },
  { id: "cielo",     a: "#f4fbff", b: "#e3f3fe", c: "#c4e6fb", ring: "#a5d0ee", label: "Cielito" },
  { id: "menta",     a: "#f4fdf8", b: "#e2f7ea", c: "#c9ecd9", ring: "#a9dcbd", label: "Menta" },
  { id: "lavanda",   a: "#fbf9ff", b: "#f1ecfa", c: "#e5dcf5", ring: "#d3c4ec", label: "Lavanda" },
  { id: "atardecer", a: "#fff9ec", b: "#ffefd0", c: "#ffe2b6", ring: "#f7cf95", label: "Atardecer" },
  { id: "noche",     a: "#41415f", b: "#33334c", c: "#28283c", ring: "#585880", label: "Noche" },
];

const settings = { name: "Mochi", character: "mochi", bg: 0, muted: false };

// =============================
// Evolution (care XP)
// =============================
const EVOL = { HATCH_XP: 5, ADULT_XP: 25 }; // cumulative care XP thresholds
const EVOL_STAGES = ["egg", "bebe", "adulto"];
const evol = { stage: "egg", xp: 0 };
let eggPulse = 0; // extra wobble impulse from petting the egg

// =============================
// State
// =============================
const STATS = {
  hunger:    80, // 100 = full belly
  happiness: 80,
  energy:    80,
  hygiene:   100,
};

// Decay per second (gentle: ~5min to drain from 100 to ~20)
const DECAY = { hunger: 0.27, happiness: 0.18, energy: 0.15, hygiene: 0.12 };
const SLEEP_ENERGY_RATE = 3.2; // energy gained per second while sleeping

const pet = {
  x: 0,            // horizontal position (px, in stage space)
  targetX: 0,
  scale: 1,
  facing: 1,       // 1 right, -1 left
  sleeping: false,
  dead: false,     // fainted when any stat hits 0; revived by the first aid kit
  blinkStart: -1,  // seconds timestamp of current blink
  nextBlinkAt: 2,
  nextWanderAt: 4,
  nextPhraseAt: 3,
  yawnStart: -1,   // seconds timestamp while sustaining a big cute yawn
  nextYawnAt: Infinity,
  anim: null,      // {type:'eat'|'play'|'clean', start}
  jump: { vy: 0, y: 0, active: false },
};

let particles = []; // {x,y,vx,vy,life,lifeMax,type}

const bubbleEl = document.getElementById("bubble");
let bubbleHideAt = 0;

// =============================
// Pet phrases by mood
// =============================
const PHRASES = {
  happy:   ["¡Te quiero!", "¡El mejor día!", "¿Jugamos, amigo?", "¡Wiii!"],
  content: ["Mmm, qué rico.", "¿Qué haces, humano?", "La la la ~", "Qué acogedor."],
  hungry:  ["Mi pancita gruñe...", "¿Hora de comer?", "¡Dame algo, porfa!"],
  sad:     ["Estoy aburrido...", "¿Juegas conmigo?", "Me siento solito..."],
  tired:   ["Qué sueño...", "Bostezo...", "A la cama, porfa."],
  dirty:   ["Me siento pegajoso...", "¡Baño, porfa!"],
  dead:    ["x_x", "*se quienbra un poquito*", "Yujuuu... (estrellitas)..."],
  sleeping:["Zzz..."],
};

// =============================
// Anim durations (seconds)
// =============================
const ANIM_DUR = { eat: 1.6, clean: 2.6, game: 4, vaccine: 2.6 };

// =============================
// Helpers
// =============================
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function setBar(name) {
  const fill = document.getElementById("bar-" + name);
  const v = Math.round(STATS[name]);
  fill.style.width = v + "%";
  fill.classList.toggle("warn", v < 50 && v >= 25);
  fill.classList.toggle("bad", v < 25);
}

function updateBars() {
  for (const name of Object.keys(STATS)) setBar(name);
}

// =============================
// Evolution logic
// =============================
function addXp(n) {
  const before = evol.stage;
  evol.xp += n;

  if (evol.stage === "egg" && evol.xp >= EVOL.HATCH_XP) evol.stage = "bebe";
  else if (evol.stage === "bebe" && evol.xp >= EVOL.ADULT_XP) evol.stage = "adulto";

  if (evol.stage !== before) onEvolved();
  updateEvolutionUI();
}

function onEvolved() {
  spawnBurst("sparkle", 18);
  spawnBurst("heart", 6);
  pet.jump.vy = 1.8;
  pet.jump.active = true;
  updateButtonsState();
  if (evol.stage === "bebe") {
    STATS.hunger = clamp(STATS.hunger + 20, 0, 100);
    say("¡" + settings.name + " eclosionó! ¡A nacido un bebé! 🐣", 4);
  } else if (evol.stage === "adulto") {
    say("¡" + settings.name + " creció y ahora es adulto! 🌟", 4);
  }
  updateBars();
}

function updateEvolutionUI() {
  const el = document.getElementById("evol-badge");
  if (!el) return;
  el.hidden = false;
  if (evol.stage === "egg") {
    el.textContent = "🥚 Huevo — cariños: " + Math.min(evol.xp, EVOL.HATCH_XP) + "/" + EVOL.HATCH_XP;
  } else if (evol.stage === "bebe") {
    const done = clamp(evol.xp - EVOL.HATCH_XP, 0, EVOL.ADULT_XP - EVOL.HATCH_XP);
    el.textContent = "🐣 Bebé — crecimiento: " + done + "/" + (EVOL.ADULT_XP - EVOL.HATCH_XP);
  } else {
    el.textContent = "🌟 ¡" + settings.name + " es adulto!";
  }
}

function say(text, dur = 2.6) {
  bubbleEl.textContent = text;
  bubbleEl.hidden = false;
  bubbleHideAt = nowSec + dur;
}

function hideBubble() {
  bubbleEl.hidden = true;
}

// =============================
// Sound effects (cute creature sounds — Mixkit's free library)
// =============================
const SFX = {
  click:  new Audio("sounds/click.mp3"),   // rubber duck squeak
  eat:    new Audio("sounds/eat.mp3"),     // crunchy munching
  play:   new Audio("sounds/play.mp3"),    // fast toy squeak
  clean:  new Audio("sounds/clean.mp3"),   // funny cartoon splash
  sleep:  new Audio("sounds/sleep.mp3"),   // soft snore
  revive: new Audio("sounds/revive.mp3"),  // dazzle sparkle and birds
};

const SFX_VOLUME = { click: 0.8, eat: 0.7, play: 0.85, clean: 0.7, sleep: 0.5, revive: 0.8 };

function playSfx(name, maxSec) {
  if (settings.muted) return;
  const a = SFX[name];
  if (!a) return;
  try {
    // Only one effect at a time: a new sound cuts the previous one.
    if (playSfx.current && playSfx.current !== a) { playSfx.current.pause(); }
    clearTimeout(playSfx.timer?.[name]);
    playSfx.timer ??= {};
    playSfx.timer[name] = maxSec
      ? setTimeout(() => { if (playSfx.current === a) { a.pause(); playSfx.current = null; } }, maxSec * 1000)
      : 0;
    a.currentTime = 0;
    a.volume = SFX_VOLUME[name] ?? 0.8;
    a.play().catch(() => { /* blocked until the first user interaction — fine */ });
    playSfx.current = a;
  } catch { /* audio unavailable — fine */ }
}

// =============================
// Actions
// =============================
const buttons = {
  feed: document.getElementById("btn-feed"),
  play: document.getElementById("btn-play"),
  clean: document.getElementById("btn-clean"),
  sleep: document.getElementById("btn-sleep"),
};

function busy() {
  return pet.anim !== null;
}

// =============================
// Food menu and eating
// =============================
const FOODS = ["carne", "sushi", "pasta", "huevo", "helado", "pastel", "manzana"];

const FOOD_LABELS = {
  carne: "Carne",
  sushi: "Sushi",
  pasta: "Pasta",
  huevo: "Huevo",
  helado: "Helado",
  pastel: "Pastel",
  manzana: "Manzana",
};

const FOOD_PHRASES = {
  carne:   ["¡Ñam! ¡Poderosa proteína!", "¡Bifecito al punto!", "¡Qué sustancioso!"],
  sushi:   ["¡Sushi, mi favorito! ¡Ñam!", "¡Arroz y salmón, delicia!", "¡Qué finura!"],
  pasta:   ["¡Fiditos enroladitos! ¡Ñam!", "¡Slurp! ¡Salsa por todos lados!", "¡Pasta power!"],
  huevo:   ["¡Huevito frito! ¡Ñam!", "¡La yema doradita!", "¡Plop! ¡De un mordisco!"],
  helado:  ["¡Fresito y helado! ¡Brrr!", "¡Lambus lambo!", "¡Se me congela la naricita!"],
  pastel:  ["¡Pastel! ¡Día de fiesta!", "¡Dulzura máxima!", "¡Con frallita arriba!"],
  manzana: ["¡Crunch, crunch!", "¡Frutita saludable!", "¡De un mordiscote!"],
};

const foodMenuEl = document.getElementById("food-menu");

function eatFood(food) {
  hideFoodMenu();
  if (busy() || pet.dead || pet.sleeping || evol.stage === "egg" || STATS.hunger >= 99) return;
  pet.anim = { type: "eat", food, start: nowSec };
  STATS.hunger = clamp(STATS.hunger + 22, 0, 100);
  playSfx("eat", ANIM_DUR.eat);
  say(pick(FOOD_PHRASES[food]));
  spawnBurst("heart", 5);
  addXp(1);
  updateBars();
  disableButtons(ANIM_DUR.eat);
}

function toggleFoodMenu() {
  if (busy() || pet.dead || pet.sleeping || evol.stage === "egg") return;
  hideGameMenu();
  foodMenuEl.hidden = !foodMenuEl.hidden;
}

function hideFoodMenu() {
  foodMenuEl.hidden = true;
}

function buildFoodMenu() {
  FOODS.forEach((food) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-item";
    btn.dataset.food = food;
    const ic = document.createElement("canvas");
    ic.className = "gi-icon";
    const label = document.createElement("span");
    label.textContent = FOOD_LABELS[food];
    btn.append(ic, label);
    btn.addEventListener("click", () => eatFood(food));
    foodMenuEl.appendChild(btn);
    renderFoodIcon(ic, food);
  });
}

// Food sprites in a 100x100 box centered on (50, 55). Shared by the menu
// icons and the big cartoon shown while the pet is eating.
function drawFoodCartoon(gc, id) {
  gc.save();
  gc.lineJoin = "round";
  gc.lineCap = "round";
  const OUT = "#4a3540";

  if (id === "carne") {
    gc.translate(50, 55); gc.rotate(-0.14); gc.translate(-50, -55);
    gc.fillStyle = "#f2846e";
    gc.beginPath(); gc.roundRect(16, 34, 68, 42, 18); gc.fill();
    gc.strokeStyle = OUT; gc.lineWidth = 4.5; gc.stroke();
    gc.fillStyle = "#ffc3b0";
    gc.beginPath(); gc.roundRect(25, 42, 50, 26, 12); gc.fill();
    gc.strokeStyle = "#d95f52"; gc.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      gc.beginPath();
      gc.moveTo(33 + i * 14, 44); gc.lineTo(25 + i * 14, 66);
      gc.stroke();
    }
  } else if (id === "sushi") {
    gc.fillStyle = "#fff7ef";
    gc.beginPath(); gc.ellipse(50, 64, 30, 15, 0, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = "#e5d4c8"; gc.lineWidth = 3.5; gc.stroke();
    gc.fillStyle = "#ff9d7e";
    gc.beginPath(); gc.ellipse(50, 51, 30, 13, 0.04, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = OUT; gc.lineWidth = 4; gc.stroke();
    gc.strokeStyle = "#ffd4c8"; gc.lineWidth = 3.5;
    for (const x of [38, 50, 62]) {
      gc.beginPath(); gc.moveTo(x - 4, 43); gc.lineTo(x + 2, 57); gc.stroke();
    }
  } else if (id === "pasta") {
    gc.strokeStyle = "#e8b84b"; gc.lineWidth = 5;
    for (const [x1, y1, x2, y2] of [[24, 52, 48, 44], [38, 48, 62, 50], [52, 54, 76, 46], [28, 58, 70, 56]]) {
      gc.beginPath(); gc.moveTo(x1, y1); gc.quadraticCurveTo((x1 + x2) / 2, y1 - 12, x2, y2); gc.stroke();
    }
    gc.fillStyle = "#e2604f";
    gc.beginPath(); gc.ellipse(50, 60, 22, 10, 0, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = OUT; gc.lineWidth = 3.5; gc.stroke();
    gc.fillStyle = "#8a4a3a";
    for (const [mx, my] of [[42, 58], [54, 62], [62, 57], [48, 54]]) {
      gc.beginPath(); gc.arc(mx, my, 2.6, 0, Math.PI * 2); gc.fill();
    }
    gc.fillStyle = "#fdf4fa";
    gc.beginPath(); gc.arc(50, 62, 27, 0, Math.PI); gc.closePath(); gc.fill();
    gc.strokeStyle = "#e0aecc"; gc.lineWidth = 4; gc.stroke();
    gc.fillStyle = "#f4a7c3";
    gc.beginPath(); gc.ellipse(50, 62, 27, 5.5, 0, 0, Math.PI); gc.fill();
  } else if (id === "huevo") {
    gc.fillStyle = "#ffffff";
    gc.beginPath();
    gc.moveTo(16, 60);
    gc.quadraticCurveTo(20, 42, 50, 40);
    gc.quadraticCurveTo(84, 42, 84, 60);
    gc.quadraticCurveTo(80, 76, 50, 76);
    gc.quadraticCurveTo(20, 76, 16, 60);
    gc.fill();
    gc.strokeStyle = "#e5d4c8"; gc.lineWidth = 3.5; gc.stroke();
    gc.fillStyle = "#ffc94d";
    gc.beginPath(); gc.arc(50, 58, 11, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = "#f0a92e"; gc.lineWidth = 3; gc.stroke();
    gc.fillStyle = "rgba(255,255,255,0.75)";
    gc.beginPath(); gc.arc(46.5, 54.5, 3, 0, Math.PI * 2); gc.fill();
  } else if (id === "helado") {
    gc.fillStyle = "#e7b06a";
    gc.beginPath(); gc.moveTo(34, 56); gc.lineTo(50, 90); gc.lineTo(66, 56); gc.closePath(); gc.fill();
    gc.strokeStyle = "#c98d47"; gc.lineWidth = 3; gc.stroke();
    gc.strokeStyle = "rgba(255,255,255,0.8)"; gc.lineWidth = 2.5;
    for (const o of [-6, 0, 6]) {
      gc.beginPath(); gc.moveTo(38 + o, 62); gc.lineTo(52 + o * 0.4, 82); gc.stroke();
      gc.beginPath(); gc.moveTo(62 + o, 62); gc.lineTo(48 + o * 0.4, 82); gc.stroke();
    }
    gc.fillStyle = "#ffffff";
    gc.beginPath(); gc.arc(50, 49, 13, 0, Math.PI * 2); gc.fill();
    gc.fillStyle = "#f9a8c8";
    gc.beginPath(); gc.arc(40, 38, 11, 0, Math.PI * 2); gc.fill();
    gc.beginPath(); gc.arc(60, 38, 11, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = "#d888a6"; gc.lineWidth = 3;
    gc.beginPath(); gc.arc(40, 38, 11, 0, Math.PI * 2); gc.stroke();
    gc.beginPath(); gc.arc(60, 38, 11, 0, Math.PI * 2); gc.stroke();
    gc.beginPath(); gc.arc(50, 49, 13, 0, Math.PI * 2); gc.stroke();
    gc.fillStyle = "#e0413f";
    gc.beginPath(); gc.arc(50, 25, 5.5, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = "#8a2f2e"; gc.lineWidth = 2.5;
    gc.beginPath(); gc.moveTo(50, 19); gc.quadraticCurveTo(52, 15, 55, 16); gc.stroke();
  } else if (id === "pastel") {
    gc.fillStyle = "#f7c26b";
    gc.beginPath(); gc.roundRect(24, 46, 52, 36, 8); gc.fill();
    gc.fillStyle = "#fff7f2";
    gc.beginPath(); gc.roundRect(24, 62, 52, 9, 4); gc.fill();
    gc.fillStyle = "#f48fb1";
    gc.beginPath(); gc.roundRect(22, 36, 56, 15, 7); gc.fill();
    for (const x of [32, 44, 58, 70]) {
      gc.beginPath(); gc.arc(x, 51, 4, 0, Math.PI * 2); gc.fill();
    }
    gc.strokeStyle = "#c77b52"; gc.lineWidth = 3;
    gc.beginPath(); gc.roundRect(24, 46, 52, 36, 8); gc.stroke();
    gc.fillStyle = "#e0413f";
    gc.beginPath(); gc.arc(50, 32, 5.5, 0, Math.PI * 2); gc.fill();
  } else { // manzana
    gc.fillStyle = "#e8595c";
    gc.beginPath(); gc.arc(38, 58, 20, 0, Math.PI * 2); gc.fill();
    gc.beginPath(); gc.arc(62, 58, 20, 0, Math.PI * 2); gc.fill();
    gc.beginPath(); gc.ellipse(50, 50, 15, 12, 0, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = "#7a4a2a"; gc.lineWidth = 4;
    gc.beginPath(); gc.moveTo(50, 46); gc.quadraticCurveTo(53, 36, 58, 32); gc.stroke();
    gc.fillStyle = "#7cb95c";
    gc.beginPath(); gc.ellipse(65, 32, 8, 4.5, -0.5, 0, Math.PI * 2); gc.fill();
    gc.fillStyle = "rgba(255,255,255,0.65)";
    gc.beginPath(); gc.ellipse(34, 50, 4, 7, -0.5, 0, Math.PI * 2); gc.fill();
  }

  gc.restore();
}

// Menu icon: the same cartoon scaled into a 26px canvas
function renderFoodIcon(canvasEl, food) {
  const dpr = 2;
  const S = 26;
  canvasEl.width = S * dpr;
  canvasEl.height = S * dpr;
  const ic = canvasEl.getContext("2d");
  ic.setTransform((S * dpr) / 100, 0, 0, (S * dpr) / 100, 0, 0);
  drawFoodCartoon(ic, food);
}

const GAME_PHRASES = {
  ball:   ["¡A la pelota!", "¡Píllala, píllala!", "¡Goool!"],
  slide:  ["¡Wiiiií!", "¡Qué vértigo!", "¡Otra vez, otra vez!"],
  seesaw: ["¡Sube y baja!", "¡A la cuenta de tres!", "¡Cuidado arriba!"],
  swing:  ["¡Mírame volar!", "¡Más alto, más alto!", "¡Wiiiii!"],
};

const GAME_LABELS = { ball: "Pelota", slide: "Tobogán", seesaw: "Sube y baja", swing: "Columpio" };

function startGame(game) {
  hideGameMenu();
  if (busy() || pet.dead || pet.sleeping || evol.stage === "egg" || STATS.energy < 12) return;
  pet.anim = { type: "game", game, start: nowSec };
  STATS.happiness = clamp(STATS.happiness + 15, 0, 100);
  STATS.energy = clamp(STATS.energy - 8, 0, 100);
  STATS.hunger = clamp(STATS.hunger - 3, 0, 100);
  gamesPlayedSinceDusk++; // the moon remembers daytime playtime
  playSfx("play", 2.2);
  say(pick(GAME_PHRASES[game]));
  spawnBurst("musical", 4);
  addXp(1);
  updateBars();
  disableButtons(ANIM_DUR.game);
}

const gameMenuEl = document.getElementById("game-menu");

function toggleGameMenu() {
  if (busy() || pet.dead || pet.sleeping || evol.stage === "egg") return;
  hideFoodMenu();
  gameMenuEl.hidden = !gameMenuEl.hidden;
}

function hideGameMenu() {
  gameMenuEl.hidden = true;
}

function buildGameMenu() {
  document.querySelectorAll(".game-item").forEach((btn) => {
    renderGameIcon(btn.querySelector("canvas"), btn.dataset.game);
    btn.addEventListener("click", () => startGame(btn.dataset.game));
  });
}

// Tiny line icons for the game menu (24x24, 2x for crispness)
function renderGameIcon(canvasEl, game) {
  const dpr = 2;
  const S = 24;
  canvasEl.width = S * dpr;
  canvasEl.height = S * dpr;
  const ic = canvasEl.getContext("2d");
  ic.setTransform(dpr, 0, 0, dpr, 0, 0);
  ic.lineCap = "round";
  ic.lineJoin = "round";
  if (game === "ball") {
    ic.fillStyle = "#f06292";
    ic.beginPath(); ic.arc(12, 14, 8, 0, Math.PI * 2); ic.fill();
    ic.fillStyle = "rgba(255,255,255,0.8)";
    ic.beginPath(); ic.arc(9, 11, 2.2, 0, Math.PI * 2); ic.fill();
  } else if (game === "slide") {
    ic.strokeStyle = "#9fc3e2"; ic.lineWidth = 3;
    ic.beginPath(); ic.moveTo(7, 21); ic.lineTo(7, 6); ic.stroke();
    ic.strokeStyle = "#f4739c"; ic.lineWidth = 3.5;
    ic.beginPath(); ic.moveTo(6, 5); ic.lineTo(19, 21); ic.stroke();
  } else if (game === "seesaw") {
    ic.strokeStyle = "#9fc3e2"; ic.lineWidth = 3;
    ic.beginPath(); ic.moveTo(12, 21); ic.lineTo(12, 14); ic.stroke();
    ic.strokeStyle = "#f4739c"; ic.lineWidth = 3;
    ic.beginPath(); ic.moveTo(3, 16); ic.lineTo(21, 9); ic.stroke();
  } else { // swing
    ic.strokeStyle = "#9fc3e2"; ic.lineWidth = 2.5;
    ic.beginPath(); ic.moveTo(2, 5); ic.lineTo(22, 5); ic.stroke();
    ic.beginPath(); ic.moveTo(8, 5); ic.lineTo(9, 15); ic.stroke();
    ic.beginPath(); ic.moveTo(16, 5); ic.lineTo(15, 15); ic.stroke();
    ic.strokeStyle = "#f4739c"; ic.lineWidth = 3.5;
    ic.beginPath(); ic.moveTo(5.5, 15); ic.lineTo(18.5, 15); ic.stroke();
  }
}

function clean() {
  if (busy() || pet.dead || pet.sleeping || evol.stage === "egg" || STATS.hygiene >= 99) return;
  pet.anim = { type: "clean", start: nowSec };
  STATS.hygiene = clamp(STATS.hygiene + 60, 0, 100);
  playSfx("clean", ANIM_DUR.clean); // bubbling soundtrack while the shower runs
  say(pick(["¡Aguacita, aguacita! 🚿", "¡Burbujitas tan ricotas!", "¡Agüita templada!"]));
  addXp(1);
  updateBars();
  disableButtons(ANIM_DUR.clean);
}

function toggleSleep() {
  if (busy() || pet.dead || evol.stage === "egg") return;
  pet.sleeping = !pet.sleeping;
  if (pet.sleeping) {
    playSfx("sleep", 3.5); // sleepy snore while it drifts off
    say("", 0); hideBubble();
    buttons.sleep.querySelector("span").textContent = "Despertar";
  } else {
    playSfx("click");
    say(pick(["¡Buenos días!", "¡Qué siesta tan rica."]));
    buttons.sleep.querySelector("span").textContent = "Dormir";
  }
  updateButtonsState();
}

function disableButtons(duration) {
  for (const b of Object.values(buttons)) b.disabled = true;
  setTimeout(updateButtonsState, duration * 1000);
}

function updateButtonsState() {
  const egg = evol.stage === "egg";
  const sleeping = pet.sleeping;
  const dead = pet.dead;
  buttons.feed.disabled = egg || dead || sleeping || busy();
  buttons.play.disabled = egg || dead || sleeping || busy() || STATS.energy < 12;
  buttons.clean.disabled = egg || dead || sleeping || busy();
  buttons.sleep.disabled = egg || dead || busy();
}

// =============================
// Death and first aid
// =============================
const reviveBtn = document.getElementById("btn-revive");

// Any stat reaching zero makes the pet faint (the egg is untouchable).
// Cute, never scary: X eyes, halito dorado y vuelta con el botiquín.
function die() {
  if (pet.dead) return;
  pet.dead = true;
  pet.sleeping = false;
  pet.anim = null;
  pet.targetX = pet.x;
  buttons.sleep.querySelector("span").textContent = "Dormir";
  hideGameMenu();
  hideFoodMenu();
  mood = "dead";
  say(pick(["¡Ay no! ¿" + settings.name + "? 💫", "x_x", "*" + settings.name + " se desmayó...*"]), 5);
  spawnBurst("sparkle", 10);
  updateBars();
  updateButtonsState();
  reviveBtn.hidden = false;
}

// First aid kit: inject the vaccine and bring the pet back.
function revive() {
  if (!pet.dead || busy()) return;
  reviveBtn.hidden = true;
  pet.anim = { type: "vaccine", start: nowSec, mark: false };
  say("¡Pichic! 💉");
  disableButtons(ANIM_DUR.vaccine);
}

// Runs the instant the vaccine enters the body (sparkle moment).
function finishRevive() {
  pet.dead = false;
  STATS.hunger = clamp(Math.max(STATS.hunger, 65), 0, 100);
  STATS.happiness = clamp(Math.max(STATS.happiness, 70), 0, 100);
  STATS.energy = clamp(Math.max(STATS.energy, 70), 0, 100);
  STATS.hygiene = clamp(Math.max(STATS.hygiene, 80), 0, 100);
  mood = computeMood();
  pet.jump.vy = 1.6;
  pet.jump.active = true;
  playSfx("revive");
  spawnBurst("sparkle", 16);
  spawnBurst("heart", 6);
  say(pick(["¡He vuelto! ✨", "¡Me siento genial!", "¡Eso pica! ¡Jiji!"]), 3.5);
  updateBars();
  updateButtonsState();
}

// =============================
// Particles
// =============================
function spawnParticle(type, x, y) {
  const conf = {
    heart:   { vy: -30, drift: 14, size: 14, life: 1.4 },
    sparkle: { vy: -80, drift: 55, size: 10, life: 0.9 },
    musical: { vy: -40, drift: 20, size: 12, life: 1.2 },
    zzz:     { vy: -18, drift: 10, size: 15, life: 2.2 },
  }[type];
  particles.push({
    type, x, y,
    vx: rand(-conf.drift, conf.drift),
    vy: conf.vy + rand(-6, 6),
    life: conf.life, lifeMax: conf.life,
    size: conf.size,
  });
}

function spawnBurst(type, n) {
  const ground = groundY();
  for (let i = 0; i < n; i++) {
    spawnParticle(type, pet.x + rand(-40, 40), ground - rand(20, 130));
  }
}

function updateParticles(dt) {
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.type === "zzz" ? 4 : 14) * dt; // gentle float up
  }
}

// =============================
// Layout / geometry
// =============================
const W = () => canvas.getBoundingClientRect().width;
const H = () => canvas.getBoundingClientRect().height;

function groundY() { return H() * 0.82; }
function petScale() { return Math.min(W(), H()) / 300; }

// =============================
// Drawing
// =============================
let mood = "content";

function computeMood() {
  if (pet.dead) return "dead";
  if (pet.sleeping) return "sleeping";
  if (STATS.hunger < 25) return "hungry";
  if (STATS.energy < 25) return "tired";
  if (STATS.hygiene < 25) return "dirty";
  if (STATS.happiness < 30) return "sad";
  if ((STATS.hunger + STATS.happiness + STATS.energy + STATS.hygiene) / 4 > 60) return "happy";
  return "content";
}

function eyeOpenness(t) {
  if (pet.sleeping || isYawning(t) || pet.anim?.type === "clean") return 0;
  if (pet.blinkStart < 0) return 1;
  const e = t - pet.blinkStart;
  if (e > 0.22) { pet.blinkStart = -1; return 1; }
  // quick close-open curve
  return Math.abs(Math.cos((e / 0.22) * Math.PI));
}

function squashStretch(t) {
  const breathe = Math.sin(t * 2.4) * 0.035;
  let sx = 1 - breathe, sy = 1 + breathe;
  if (pet.anim?.type === "eat") {
    const e = t - pet.anim.start;
    const chew = Math.sin(e * Math.PI * 6);
    sx += chew * 0.05; sy -= chew * 0.05;
  }
  return { sx, sy };
}

function drawShadow(x, y, jumpY, s = petScale()) {
  const lift = clamp(-jumpY / 120, 0, 1);
  g.save();
  g.globalAlpha = 0.18 * (1 - lift * 0.6);
  g.fillStyle = "#c989a8";
  g.beginPath();
  g.ellipse(x, y + 6, 52 * s * (1 - lift * 0.35), 13 * s * (1 - lift * 0.3), 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawPet(t) {
  const stageScale = evol.stage === "bebe" ? 0.72 : evol.stage === "adulto" ? 1.06 : 1;
  const s = petScale() * stageScale;
  const c = { x: pet.x, y: groundY() };
  const { sx, sy } = squashStretch(t);
  const eyeOpen = eyeOpenness(t);
  const sad = mood === "sad" || mood === "hungry" || mood === "tired" || mood === "dirty";
  const eating = pet.anim?.type === "eat"
    ? clamp((t - pet.anim.start) / ANIM_DUR.eat, 0, 1)
    : null;
  const playing = pet.anim?.type === "game";
  const mo = playing
    ? gameMotion(pet.anim.game, t - pet.anim.start, s, c)
    : null;
  const liftY = pet.jump.y + (mo ? mo.dy : 0);
  // while playing, the pet always smiles, even if it is hungry or dirty
  const faceSad = playing ? false : sad;

  drawShadow(c.x, c.y, liftY, s);

  if (evol.stage === "egg") {
    drawEgg(t, c, pet.jump.y);
    return;
  }

  if (pet.dead) {
    // Fainted: slumped tilt, gray tint, X eyes and a little golden halo.
    g.save();
    g.translate(c.x, c.y);
    g.rotate(-0.16);
    g.scale(s * pet.facing, s);
    g.translate(-50, -100);
    drawBodyCore({ t, sleeping: false, eyeOpen: 1, sad: false, eating: null, happy: false, dead: true });
    g.restore();
    drawHalo(t, c, s);
    if (pet.anim?.type === "vaccine") drawVaccine(t - pet.anim.start, s, c);
    return;
  }

  g.save();
  g.translate(c.x + (mo ? mo.dx : 0), c.y + liftY);
  if (mo && mo.rot) g.rotate(mo.rot);
  g.scale(sx * s * pet.facing, sy * s);
  g.translate(-50, -100); // body coordinate space: 100w x 100h baseline at feet
  drawBodyCore({ t, sleeping: pet.sleeping, eyeOpen, sad: faceSad, eating, happy: mood === "happy" || playing });
  g.restore();

  // The cartoon food being eaten hovers by the mouth, wobbling and
  // shrinking with every bite until it is gone.
  if (pet.anim?.type === "eat") {
    const e = clamp((t - pet.anim.start) / ANIM_DUR.eat, 0, 1);
    const dir = pet.facing >= 0 ? 1 : -1;
    const k = 0.52 * s * (1 - 0.62 * e);
    g.save();
    g.globalAlpha = e > 0.85 ? (1 - e) / 0.15 : 1;
    g.translate(c.x + dir * (30 * s + 16), c.y - 30 * s + Math.sin(t * 21) * 2);
    g.rotate(dir * Math.sin(e * 14) * 0.18);
    g.scale(k, k);
    g.translate(-50, -55);
    drawFoodCartoon(g, pet.anim.food);
    g.restore();
  }

  // The shower hangs above her while the clean animation runs
  if (pet.anim?.type === "clean") {
    drawShower(t - pet.anim.start, s, c);
  }
}

// A cute shower head on a gooseneck arm slides in from the right, tilts
// over the pet and rains a fan of little droplets; then it slips away.
function drawShower(e, s, c) {
  const D = ANIM_DUR.clean;
  const inK = clamp(e / 0.35, 0, 1);
  const ss = inK * inK * (3 - 2 * inK); // smoothstep slide-in from the right
  const outK = clamp((e - (D - 0.5)) / 0.5, 0, 1);
  const alpha = Math.min(ss * 1.7, 1) * (1 - outK * outK);
  const ox = (1 - ss) * 200 * s; // starts off to the right and eases into place

  const hx = c.x + 18 * s + ox; // head center
  const hy = c.y - 136 * s;     // head height, comfortably above the pet

  g.save();
  g.globalAlpha = alpha;
  g.lineCap = "round";

  // Arm: pipe entering from the top, curving down to the head
  g.strokeStyle = "#b9a6d6";
  g.lineWidth = 7 * s;
  g.beginPath();
  g.moveTo(hx + 64 * s, c.y - 210 * s);
  g.quadraticCurveTo(hx + 64 * s, hy - 42 * s, hx + 12 * s, hy - 12 * s);
  g.stroke();

  // Head: rounded faceplate, tilted toward the pet, with tiny holes
  g.save();
  g.translate(hx, hy);
  g.rotate((pet.facing >= 0 ? 1 : -1) * 0.42);
  g.fillStyle = "#cdbcec";
  g.strokeStyle = "#8f7cb8";
  g.lineWidth = 3 * s;
  g.beginPath();
  g.roundRect(-26 * s, -10 * s, 52 * s, 22 * s, 9 * s);
  g.fill();
  g.stroke();
  g.fillStyle = "#8f7cb8";
  for (let i = -2; i <= 2; i++) {
    for (let j = 0; j < 2; j++) {
      g.beginPath();
      g.arc(i * 8 * s, -1 * s + j * 8 * s, 1.7 * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();

  // Water: a soft fan of droplets falls while the shower is on
  if (e > 0.35 && e < 2.1) {
    const wFade = 1 - clamp((e - 1.85) / 0.25, 0, 1); // last drops thin out
    g.globalAlpha = alpha * wFade;
    for (let i = 0; i < 16; i++) {
      const spin = i * 2.399; // golden-angle spread for an even fan
      const fanX = Math.sin(spin) * 27 * s;
      const phase = (e * (1.5 + (i % 4) * 0.22) + i * 0.37) % 1;
      const px = hx + fanX;
      const py = hy + 10 * s + phase * 74 * s;
      g.fillStyle = "rgba(126, 196, 235, 0.85)";
      g.beginPath();
      g.ellipse(px, py, 1.8 * s, 3.2 * s, 0, 0, Math.PI * 2);
      g.fill();
    }

    // A few soap bubbles floating up around her
    g.strokeStyle = "rgba(190, 224, 247, 0.95)";
    g.fillStyle = "rgba(255, 255, 255, 0.8)";
    for (let i = 0; i < 4; i++) {
      const phase = (e * 0.38 + i * 0.26) % 1;
      const bpx = c.x + Math.sin(i * 1.7 + e * 1.2) * 26 * s + (i - 1.5) * 16 * s;
      const bpy = c.y - 22 * s - phase * 66 * s;
      const br = (3 + (i % 2) * 1.6) * s;
      g.beginPath();
      g.arc(bpx, bpy, br, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(bpx - br * 0.35, bpy - br * 0.35, br * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

// Draw helpers ------------------------------------------------------------

// Core drawing in body space (100w x 100h, feet at y=100). Shared by the stage
// and the settings-panel previews. `o`: { t, sleeping, eyeOpen, sad, eating, happy, char? }
function drawBodyCore(o) {
  const ch = CHARACTERS[o.char || settings.character];
  const sleeping = o.sleeping;
  const dead = !!o.dead;
  const sad = o.sad;
  const isKitty = (o.char || settings.character) === "michi";

  // Wavy forked tail, peeking out from the left side of the body
  if (isKitty) drawKittyTail(o.t, dead, sleeping);

  // --- Ears ---
  g.fillStyle = ch.earColor;
  const wig = dead ? 0 : sleeping ? 0.15 : Math.sin(o.t * 3) * 0.06;
  for (const dir of [-1, 1]) {
    g.save();
    g.translate(50 + dir * 30, 26);
    g.rotate(dir * (EAR_BASE_ROT[ch.earStyle] + wig));
    drawEar(ch.earStyle);
    g.restore();
  }

  // --- Body ---
  const grad = g.createRadialGradient(35, 45, 15, 50, 60, 80);
  if (sleeping || dead) { grad.addColorStop(0, desat(ch.bodyA)); grad.addColorStop(1, desat(ch.bodyB)); }
  else { grad.addColorStop(0, ch.bodyA); grad.addColorStop(1, ch.bodyB); }
  g.fillStyle = grad;
  blobBody(g);
  g.strokeStyle = ch.line;
  g.lineWidth = 2.5;
  blobBody(g, true);

  // A little ahoge curl on top of her head (doodle homage!)
  if (isKitty && !dead) {
    g.strokeStyle = ch.line;
    g.lineCap = "round";
    g.lineWidth = 2.6;
    const sway = sleeping ? 0 : Math.sin(o.t * 2.4) * 2;
    g.beginPath();
    g.moveTo(48, 11);
    g.bezierCurveTo(50 + sway, 3, 42, 0, 45, -6);
    g.bezierCurveTo(46.5, -9, 49, -8, 48, -5.5);
    g.stroke();
  }

  // --- Belly patch ---
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.ellipse(50, 86, 22, 14, 0, 0, Math.PI * 2);
  g.fill();

  // --- Face ---
  const faceY = sad ? 58 : 56;
  const eyeDX = 15, eyeDY = sad ? 4 : 0;

  if (dead) {
    drawDeadEyes(50 + eyeDX, faceY, 50 - eyeDX, faceY);
    // tiny wavy mouth, very faint
    g.strokeStyle = "#2d2d3d";
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(45, 72);
    g.quadraticCurveTo(50, 69, 55, 72);
    g.stroke();
  } else if (sleeping) { drawClosedEyes(50 + eyeDX, faceY, 50 - eyeDX, faceY); }
  else if (o.eyeOpen > 0.15) { drawOpenEyes(50 + eyeDX, faceY + eyeDY, 50 - eyeDX, faceY + eyeDY, o.eyeOpen, sad); }
  else { drawClosedEyes(50 + eyeDX, faceY, 50 - eyeDX, faceY); }

  // Blush
  if (!dead) {
    g.fillStyle = ch.blush;
    g.beginPath(); g.ellipse(50 + eyeDX + 6, faceY + 10, 5, 3, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(50 - eyeDX - 6, faceY + 10, 5, 3, 0, 0, Math.PI * 2); g.fill();
  }

  // Kitty extras: cheek patches and whiskers, straight from the doodle
  if (isKitty && !dead) {
    g.fillStyle = "rgba(255,255,255,0.45)";
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(50 + sx * 33, faceY - 14, 6, 4.5, sx * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(122,74,32,0.55)";
    g.lineWidth = 2;
    g.lineCap = "round";
    const wig = sleeping ? 0 : Math.sin(o.t * 4) * 0.8;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(50 + sx * 16, faceY + 10);
      g.lineTo(50 + sx * 31, faceY + 6 + wig);
      g.stroke();
      g.beginPath();
      g.moveTo(50 + sx * 16, faceY + 14);
      g.lineTo(50 + sx * 31, faceY + 14 + wig);
      g.stroke();
    }
  }

  // Mouth
  if (!dead) drawMouth(o.t, sad, sleeping || isYawning(o.t), o.eating, o.happy, isKitty);

  // --- Feet ---
  g.fillStyle = ch.feet;
  g.beginPath(); g.ellipse(38, 97, 10, 5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(62, 97, 10, 5, 0, 0, Math.PI * 2); g.fill();
  if (isKitty && !dead) { // tiny toe lines on the little paws
    g.strokeStyle = ch.line;
    g.lineWidth = 1.6;
    g.lineCap = "round";
    for (const fx of [38, 62]) {
      g.beginPath();
      g.moveTo(fx - 2.5, 93.5);
      g.lineTo(fx - 2.5, 99);
      g.moveTo(fx + 1.5, 93.5);
      g.lineTo(fx + 1.5, 99);
      g.stroke();
    }
  }

  // --- Food (eat animation) ---
  if (o.eating != null) drawFood(o.eating);
}

// Michi's tail: one single smooth arc, no fork, no folds — never misread
function drawKittyTail(t, dead, sleeping) {
  g.strokeStyle = CHARACTERS.michi.earColor;
  g.lineWidth = 6;
  g.lineCap = "round";
  g.lineJoin = "round";
  const sway = dead ? 0 : Math.sin(t * (sleeping ? 0.8 : 2.2)) * 3;

  g.beginPath();
  g.moveTo(20, 74);
  g.bezierCurveTo(4 + sway, 80, -8, 72, -13 + sway, 54);
  g.stroke();
}

function drawEar(style) {  g.beginPath();
  if (style === "bear") {
    g.arc(0, -9, 11, 0, Math.PI * 2);
  } else if (style === "cat") {
    g.moveTo(-7, 2);
    g.quadraticCurveTo(-4, -24, 3, -28);
    g.quadraticCurveTo(9, -18, 7, 0);
    g.closePath();
  } else if (style === "droopy") {
    g.moveTo(-4, 0);
    g.quadraticCurveTo(-16, -18, -8, -34);
    g.quadraticCurveTo(2, -26, 6, 2);
    g.closePath();
  } else if (style === "kitty") {
    // Big pointy triangles, just like the original doodle
    g.moveTo(-8, 2);
    g.quadraticCurveTo(-12, -22, 0, -32);
    g.quadraticCurveTo(14, -20, 8, 2);
    g.closePath();
  } else { // bunny
    g.moveTo(-4, 0);
    g.quadraticCurveTo(-10, -26, 2, -34);
    g.quadraticCurveTo(10, -24, 6, 2);
    g.closePath();
  }
  g.fill();
  if (style === "kitty") { // soft pink inner ear
    g.fillStyle = "#ff9db9";
    g.beginPath();
    g.moveTo(-3, 0);
    g.quadraticCurveTo(-4.5, -17, 0, -24);
    g.quadraticCurveTo(6.5, -14, 4, 0);
    g.closePath();
    g.fill();
  }
}

// Mix a color 45% toward a soft slate gray (sleeping tint)
function desat(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v * 0.45 + 155 * 0.55);
  return "rgb(" + mix((n >> 16) & 255) + ", " + mix((n >> 8) & 255) + ", " + mix(n & 255) + ")";
}

// Egg stage: wobbly shell tinted with the character colors, cracks appear
// as care XP approaches the hatch threshold.
function drawEgg(t, c, jumpY) {
  const ch = CHARACTERS[settings.character];
  g.save();
  g.translate(c.x, c.y + jumpY);
  const wobble = Math.sin(t * 3.2) * (2.5 + Math.sin(t * 1.3) * 1.5)
    + eggPulse * Math.sin(t * 22) * 6;
  g.rotate(wobble * Math.PI / 180);

  // Shell
  const grad = g.createRadialGradient(-10, -64, 10, 0, -34, 44);
  grad.addColorStop(0, ch.bodyA);
  grad.addColorStop(1, ch.bodyB);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, -34, 29, 37, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ch.line;
  g.lineWidth = 3;
  g.stroke();

  // Spots
  g.fillStyle = ch.blush;
  g.beginPath(); g.ellipse(-13, -18, 5, 7, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(12, -52, 4, 6, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(15, -14, 3.5, 5, 0, 0, Math.PI * 2); g.fill();

  // Sleepy happy face
  g.strokeStyle = "#2d2d3d";
  g.lineWidth = 2.4;
  g.lineCap = "round";
  for (const dx of [-8, 8]) {
    g.beginPath();
    g.arc(dx, -30, 4.5, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }
  g.fillStyle = ch.blush;
  g.beginPath(); g.ellipse(-13, -23, 4, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(13, -23, 4, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.arc(0, -25, 3, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();

  // Cracks grow with care progress
  const prog = clamp(evol.xp / EVOL.HATCH_XP, 0, 1);
  g.strokeStyle = "rgba(60, 50, 70, 0.55)";
  g.lineWidth = 2;
  if (prog > 0.25) {
    g.beginPath();
    g.moveTo(-4, -64); g.lineTo(2, -55); g.lineTo(-3, -47);
    g.stroke();
  }
  if (prog > 0.6) {
    g.beginPath();
    g.moveTo(14, -50); g.lineTo(8, -42); g.lineTo(15, -35); g.lineTo(9, -28);
    g.stroke();
    g.beginPath();
    g.moveTo(-16, -48); g.lineTo(-10, -40); g.lineTo(-16, -33);
    g.stroke();
  }
  g.restore();
}

function blobBody(target = g, strokeOnly = false) {
  if (strokeOnly) { target.beginPath(); }
  else { target.beginPath(); }
  target.moveTo(6, 62);
  target.bezierCurveTo(4, 20, 26, 10, 50, 10);
  target.bezierCurveTo(76, 10, 96, 24, 94, 58);
  target.bezierCurveTo(96, 86, 74, 98, 50, 98);
  target.bezierCurveTo(24, 98, 8, 88, 6, 62);
  target.closePath();
  if (!strokeOnly) target.fill();
  if (strokeOnly) target.stroke();
}

function drawOpenEyes(x1, y1, x2, y2, open, sad) {
  const rY = 7 * open + 0.6;
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    g.fillStyle = "#2d2d3d";
    if (sad) {
      // droopy half-lid look
      g.beginPath(); g.ellipse(x, y, 5.5, rY * 0.8, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.beginPath(); g.ellipse(x, y, 5.5, rY, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff";
      g.beginPath(); g.arc(x + 1.8, y - 2.2, 1.7, 0, Math.PI * 2); g.fill();
    }
  }
}

function drawClosedEyes(x1, y1, x2, y2) {
  g.strokeStyle = "#2d2d3d";
  g.lineWidth = 2.4;
  g.lineCap = "round";
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    g.beginPath();
    g.arc(x, y + 1, 5, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }
}

// Cute Koops-style X eyes for the fainted pet
function drawDeadEyes(x1, y1, x2, y2) {
  g.strokeStyle = "#2d2d3d";
  g.lineWidth = 2.6;
  g.lineCap = "round";
  const r = 4.2;
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    g.beginPath();
    g.moveTo(x - r, y - r); g.lineTo(x + r, y + r);
    g.moveTo(x + r, y - r); g.lineTo(x - r, y + r);
    g.stroke();
  }
}

// Little golden halo floating over the fainted pet
function drawHalo(t, c, s) {
  const y = c.y - 146 * s + Math.sin(t * 2.2) * 3 * s;
  g.save();
  g.globalAlpha = 0.8 + Math.sin(t * 3) * 0.12;
  g.strokeStyle = "#ffd76a";
  g.lineWidth = 3.5 * s;
  g.beginPath();
  g.ellipse(c.x + 12 * s, y, 17 * s, 5.5 * s, -0.18, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

// Vaccine shot: a syringe swoops in from the upper corner, taps the pet's
// side, the plunger slides in with a sparkle burst, then it folds away.
function drawVaccine(e, s, c) {
  const smooth = (p) => p * p * (3 - 2 * p);
  const p1 = clamp(e / 0.7, 0, 1);              // swoop in
  const p2 = clamp((e - 0.7) / 0.7, 0, 1);      // poke to the body
  const fade = 1 - clamp((e - 1.9) / 0.7, 0, 1); // fold away
  if (fade <= 0) return;

  const sx0 = c.x + 150 * s, sy0 = c.y - 235 * s;
  const tx = c.x + 30 * s, ty = c.y - 58 * s;
  const u = smooth(clamp(p1 * 0.92 + p2 * 0.08, 0, 1));
  const tipX = sx0 + (tx - sx0) * u;
  const tipY = sy0 + (ty - sy0) * u;
  const plunger = smooth(clamp((e - 1.0) / 0.4, 0, 1));
  const wobble = Math.sin(e * 14) * 1.2 * s * fade;

  g.save();
  g.globalAlpha = fade;
  g.translate(tipX, tipY + wobble);
  g.rotate(-0.72); // tip points down-left toward the pet

  // needle
  g.strokeStyle = "#c8d2dc";
  g.lineWidth = 2.2 * s;
  g.lineCap = "round";
  g.beginPath(); g.moveTo(-30 * s, 0); g.lineTo(0, 0); g.stroke();

  // barrel
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.roundRect(0, -8 * s, 42 * s, 16 * s, 4 * s);
  g.fill();
  g.strokeStyle = "#9fc3e2";
  g.lineWidth = 2.4 * s;
  g.stroke();

  // vaccine fluid drains as the plunger advances
  const head = (4 + 32 * (1 - plunger)) * s;
  g.fillStyle = "rgba(255,158,196,0.9)";
  g.beginPath();
  g.roundRect(2.5 * s, -5.5 * s, Math.max(0, head - 2.5 * s), 11 * s, 3 * s);
  g.fill();

  // little red cross on the barrel
  g.strokeStyle = "#e35d5d";
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(11 * s, -4 * s); g.lineTo(11 * s, 4 * s);
  g.moveTo(7 * s, 0); g.lineTo(15 * s, 0);
  g.stroke();

  // plunger rod + pad
  g.strokeStyle = "#9fc3e2";
  g.lineWidth = 3 * s;
  g.beginPath(); g.moveTo(head, 0); g.lineTo(head + 12 * s, 0); g.stroke();
  g.fillStyle = "#f2b6cd";
  g.beginPath();
  g.roundRect(head + 12 * s, -9 * s, 6 * s, 18 * s, 3 * s);
  g.fill();

  g.restore();
}

function drawMouth(t, sad, sleeping, eating, happy, kitty) {
  const mouthY = 72;
  g.strokeStyle = "#2d2d3d";
  g.lineWidth = 2.4;
  g.lineCap = "round";

  if (kitty) { // the signature cat nose above the mouth
    g.fillStyle = "#e2808b";
    g.beginPath();
    g.moveTo(50, 63);
    g.quadraticCurveTo(53.6, 64.8, 50, 67);
    g.quadraticCurveTo(46.4, 64.8, 50, 63);
    g.fill();
  }

  if (sleeping) {
    // little open mouth "o" breathing with snore rhythm
    const r = 3 + Math.sin(t * 2.4) * 1.2;
    g.beginPath(); g.arc(50, mouthY + 2, r, 0, Math.PI * 2); g.stroke();
    return;
  }
  if (eating != null) {
    const chew = Math.abs(Math.sin(eating * Math.PI * 6));
    g.beginPath();
    g.ellipse(50, mouthY, 7, 2 + chew * 5, 0, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  if (kitty && !sad) { // classic "omega" cat smile
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(50, 67); g.lineTo(50, 69.4); g.stroke();
    g.beginPath(); g.arc(47.4, 69.4, 2.6, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(52.6, 69.4, 2.6, 0, Math.PI); g.stroke();
    return;
  }
  if (sad) {
    g.beginPath();
    g.arc(50, mouthY + 6, 6, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  } else {
    const wide = happy ? 8 : 6;
    g.beginPath();
    g.arc(50, mouthY - 1, wide, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }
}

function drawFood(p) {
  if (p >= 0.85) return; // eaten
  // apple slides towards the mouth and shrinks
  const scale = 1 - p * 0.9;
  const x = 90 - 40 * p, y = 55 + 18 * p;
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.fillStyle = "#ff6b6b";
  g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#5fae5f";
  g.beginPath(); g.ellipse(1, -11, 5, 2.5, 0.6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#7a4a2b";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(-1, -13); g.stroke();
  g.restore();
}

// =============================
// Minigame choreography
// =============================
// Each game draws its playground prop near the pet and returns how the pet
// body should be moved (dx, dy, rot) for this frame.
function gameMotion(type, e, s, c) {
  const res = { dx: 0, dy: 0, rot: 0 };
  const ground = groundY();
  if (type === "ball") return motionBall(e, s, c, ground, res);
  if (type === "slide") return motionSlide(e, s, c, ground, res);
  if (type === "seesaw") return motionSeesaw(e, s, c, ground, res);
  if (type === "swing") return motionSwing(e, s, c, ground, res);
  return res;
}

function motionBall(e, s, c, ground, res) {
  const h = Math.abs(Math.sin(e * Math.PI * 1.7));
  const ballH = h * 66 * s;
  const bx = c.x + 66 * s * pet.facing;
  const by = ground - ballH - 9 * s;
  // ball shadow
  g.save();
  g.globalAlpha = 0.15;
  g.fillStyle = "#c989a8";
  g.beginPath(); g.ellipse(bx, ground + 4, 13 * s * (1 - h * 0.4), 5 * s * (1 - h * 0.4), 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // ball
  const bg = g.createRadialGradient(bx - 5 * s, by - 5 * s, 2, bx, by + 4 * s, 16 * s);
  bg.addColorStop(0, "#ffd3de");
  bg.addColorStop(1, "#f06292");
  g.fillStyle = bg;
  g.beginPath(); g.arc(bx, by, 13 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.beginPath(); g.arc(bx - 4 * s, by - 5 * s, 3 * s, 0, Math.PI * 2); g.fill();
  g.restore();
  // pet mirrors the ball bounce
  res.dy = -h * 46 * s;
  res.dx = Math.sin(e * Math.PI * 0.6) * 7 * s;
  return res;
}

function motionSlide(e, s, c, ground, res) {
  const baseX = c.x - 60 * s;
  const topY = ground - 82 * s;

  // --- Slide structure ---
  g.save();
  g.lineCap = "round";
  g.strokeStyle = "#b7d3ea";
  g.lineWidth = 5 * s;
  g.beginPath(); g.moveTo(baseX - 16 * s, ground); g.lineTo(baseX - 16 * s, topY); g.stroke();
  g.beginPath(); g.moveTo(baseX + 16 * s, ground); g.lineTo(baseX + 16 * s, topY); g.stroke();
  g.beginPath(); g.moveTo(baseX + 62 * s, ground); g.lineTo(baseX + 66 * s, ground - 38 * s); g.stroke();
  // platform
  g.fillStyle = "#9fc3e2";
  g.beginPath();
  g.roundRect(baseX - 28 * s, topY - 8 * s, 50 * s, 8 * s, 3 * s);
  g.fill();
  // ramp
  g.strokeStyle = "#ff9ec4";
  g.lineWidth = 8 * s;
  g.beginPath(); g.moveTo(baseX, topY); g.lineTo(baseX + 138 * s, ground - 5 * s); g.stroke();
  g.restore();

  // --- Pet path: climb -> pause -> slide -> celebrate ---
  if (e < 1.4) { // climb up
    const p = e / 1.4;
    res.dx = -60 * s * p;
    res.dy = -90 * s * p;
  } else if (e < 1.8) { // pause on the platform
    res.dx = -60 * s;
    res.dy = -90 * s - Math.abs(Math.sin(e * 14)) * 2 * s;
  } else if (e < 2.8) { // zoom down the ramp
    const p = (e - 1.8) / 1.0;
    res.dx = -60 * s + p * 138 * s;
    res.dy = -90 * s + p * 90 * s;
    res.rot = 0.42 * p;
  } else { // happy hops at the bottom
    res.dx = 78 * s;
    res.dy = -Math.abs(Math.sin(e * Math.PI * 4)) * 26 * s;
  }
  return res;
}

function motionSeesaw(e, s, c, ground, res) {
  const a = Math.sin(e * Math.PI * 1.6) * 0.34;
  const pivotY = ground - 13 * s;
  const half = 52 * s;

  // fulcrum
  g.save();
  g.fillStyle = "#b7d3ea";
  g.beginPath();
  g.moveTo(c.x - 11 * s, ground);
  g.lineTo(c.x + 11 * s, ground);
  g.lineTo(c.x, pivotY - 4 * s);
  g.closePath();
  g.fill();

  // plank rocking, with a little friend on the far end
  g.translate(c.x, pivotY);
  g.rotate(a);
  g.fillStyle = "#f2b6cd";
  g.beginPath();
  g.roundRect(-half - 6 * s, -4 * s, half * 2 + 12 * s, 6 * s, 3 * s);
  g.fill();
  // friend
  g.fillStyle = "#f9d6e3";
  g.beginPath(); g.arc(half - 8 * s, -10 * s, 9 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2d2d3d";
  g.beginPath(); g.arc(half - 11 * s, -12 * s, 1.6 * s, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(half - 5 * s, -12 * s, 1.6 * s, 0, Math.PI * 2); g.fill();
  g.restore();

  // pet rides the left end
  res.dx = -Math.cos(a) * half;
  res.dy = -13 * s - Math.sin(a) * half;
  res.rot = a;
  return res;
}

function motionSwing(e, s, c, ground, res) {
  const pivotY = ground - 118 * s;
  const L = 92 * s;
  const th = Math.sin(e * Math.PI * 1.05) * 0.42;
  const seatX = c.x + Math.sin(th) * L;
  const seatY = pivotY + Math.cos(th) * L;

  // frame
  g.save();
  g.lineCap = "round";
  g.strokeStyle = "#b7d3ea";
  g.lineWidth = 6 * s;
  for (const dir of [-1, 1]) {
    g.beginPath();
    g.moveTo(c.x + dir * 58 * s, ground);
    g.lineTo(c.x + dir * 46 * s, pivotY);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(c.x - 52 * s, pivotY);
  g.lineTo(c.x + 52 * s, pivotY);
  g.stroke();
  // ropes
  g.strokeStyle = "#c4a4c8";
  g.lineWidth = 2.5 * s;
  g.beginPath(); g.moveTo(c.x - 12 * s, pivotY); g.lineTo(seatX - 10 * s, seatY - 3 * s); g.stroke();
  g.beginPath(); g.moveTo(c.x + 12 * s, pivotY); g.lineTo(seatX + 10 * s, seatY - 3 * s); g.stroke();
  // seat
  g.fillStyle = "#f2b6cd";
  g.save();
  g.translate(seatX, seatY);
  g.rotate(th);
  g.beginPath();
  g.roundRect(-13 * s, -3 * s, 26 * s, 5 * s, 2 * s);
  g.fill();
  g.restore();
  g.restore();

  res.dx = Math.sin(th) * L;
  res.dy = (pivotY - ground) + Math.cos(th) * L;
  res.rot = Math.sin(th) * 0.3;
  return res;
}

// =============================
// Particles drawing
// =============================
function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.lifeMax, 0, 1);
    g.save();
    g.globalAlpha = a;
    g.translate(p.x, p.y);
    if (p.type === "heart") {
      g.fillStyle = "#ff7fa5";
      const s = p.size;
      g.beginPath();
      g.moveTo(0, s * 0.35);
      g.bezierCurveTo(-s, -s * 0.45, -s * 0.4, -s * 1.1, 0, -s * 0.4);
      g.bezierCurveTo(s * 0.4, -s * 1.1, s, -s * 0.45, 0, s * 0.35);
      g.fill();
    } else if (p.type === "sparkle") {
      g.fillStyle = "#ffe08a";
      drawStar(p.size);
    } else if (p.type === "musical") {
      g.fillStyle = "#8f8ac2";
      g.font = `${p.size * 1.6}px serif`;
      g.fillText("♪", 0, 0);
    } else if (p.type === "zzz") {
      g.fillStyle = "#a9b6d8";
      g.font = `bold ${p.size + 6}px "Segoe UI", sans-serif`;
      g.fillText("Z", 0, 0);
    }
    g.restore();
  }
}

function drawStar(r) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.lineWidth = 3;
  g.lineCap = "round";
  g.strokeStyle = "#ffe08a";
  g.stroke();
}

// =============================
// Behavior update
// =============================
let nowSec = 0;

function updateBehavior(dt) {
  const t = nowSec;

  // Day/night cycle — nightfall makes her sleepy and brings the moon XP gift
  const isNight = updateDayNight(t);
  if (isNight && !wasNight && evol.stage !== "egg") onNightfall(t);
  wasNight = isNight;

  // Sleepy idle yawning while the night lasts
  if (isNight && !pet.sleeping && !pet.dead && !isYawning(t) && t >= pet.nextYawnAt) {
    doYawn(t);
  }

  // Blink scheduling
  if (!pet.sleeping && pet.blinkStart < 0 && t >= pet.nextBlinkAt) {
    pet.blinkStart = t;
    pet.nextBlinkAt = t + rand(2.4, 5.5);
  }

  // Jump physics (click reactions)
  if (pet.jump.active) {
    pet.jump.y += pet.jump.vy * dt * 140;
    pet.jump.vy -= dt * 5;
    if (pet.jump.y >= 0) { pet.jump.y = 0; pet.jump.active = false; pet.jump.vy = 0; }
  }

  // Minigame particles
  if (pet.anim?.type === "game") {
    const ge = t - pet.anim.start;
    if (pet.anim.game === "slide" && ge > 1.8 && ge < 2.8 && Math.random() < dt * 16) {
      spawnParticle("sparkle", pet.x + rand(-30, 80), groundY() - rand(25, 95));
    }
    if (Math.random() < dt * 4) {
      spawnParticle("heart", pet.x + rand(-40, 75), groundY() - rand(40, 115));
    }
  }

  // Egg wobble pulse decays
  eggPulse = Math.max(0, eggPulse - dt * 2.5);

  // Eat anim munches crumbs
  if (pet.anim?.type === "eat" && Math.random() < dt * 8) {
    spawnParticle("sparkle", pet.x + rand(-10, 40), groundY() - 120);
  }

  // Clean anim sparkles
  if (pet.anim?.type === "clean" && Math.random() < dt * 14) {
    spawnParticle("sparkle", pet.x + rand(-45, 45), groundY() - rand(20, 130));
  }

  // Sleeping Z's
  if (pet.sleeping && Math.random() < dt * 1.6) {
    const s = petScale();
    spawnParticle("zzz", pet.x + 60 * s, groundY() - 150 * s);
  }

  // End of anim
  if (pet.anim && t - pet.anim.start > ANIM_DUR[pet.anim.type]) {
    const ended = pet.anim;
    pet.anim = null;
    updateButtonsState();
    // The shower promises its shine: it comes right after the last drop
    if (ended.type === "clean") {
      spawnBurst("sparkle", 14);
      say(pick(["¡Reluciente! ✨", "¡Fresita y limpita!", "¡Brillo de estrellita!"]), 2.8);
    }
  }

  // Wandering (a fainted pet stays put)
  if (!pet.dead && !pet.sleeping && !pet.anim && !pet.jump.active && t >= pet.nextWanderAt) {
    const margin = 90 * petScale();
    pet.targetX = rand(margin, W() - margin);
    pet.nextWanderAt = t + rand(3, 8);
  }
  if (!pet.dead && Math.abs(pet.targetX - pet.x) > 2) {
    const dir = Math.sign(pet.targetX - pet.x);
    pet.facing = dir || pet.facing;
    pet.x += dir * 45 * dt;
    if ((dir > 0 && pet.x > pet.targetX) || (dir < 0 && pet.x < pet.targetX)) pet.x = pet.targetX;
    // little waddle bounce while moving
    pet.jump.y = Math.abs(Math.sin(t * 9)) * -6;
  } else if (!pet.jump.active) {
    pet.jump.y *= Math.max(0, 1 - dt * 10); // settle
  }

  // Stats decay
  if (pet.sleeping) {
    STATS.energy = clamp(STATS.energy + SLEEP_ENERGY_RATE * dt, 0, 100);
    // slow hunger drain while sleeping
    STATS.hunger = clamp(STATS.hunger - DECAY.hunger * 0.4 * dt, 0, 100);
  } else {
    for (const k of Object.keys(DECAY)) STATS[k] = clamp(STATS[k] - DECAY[k] * dt, 0, 100);
  }

  // Death check: any stat at zero faints the pet (never while it is an egg)
  if (!pet.dead && evol.stage !== "egg" &&
      Math.min(STATS.hunger, STATS.happiness, STATS.energy, STATS.hygiene) <= 0) {
    die();
  }

  // Vaccine shot: revive the very moment the dose enters
  if (pet.anim?.type === "vaccine" && !pet.anim.mark && t - pet.anim.start > 1.1) {
    pet.anim.mark = true;
    finishRevive();
  }

  // Idle phrase (dialog shown to the user stays in Spanish)
  if (t >= pet.nextPhraseAt) {
    pet.nextPhraseAt = t + rand(6, 12);
    if (evol.stage === "egg") {
      say(pick(["Coco, coco...", "*El huevo tiembla un poco*", "Se escucha algo adentro..."]), 2.4);
    } else {
      mood = computeMood();
      const urgent = mood === "hungry" || mood === "sad" || mood === "tired" || mood === "dirty";
      if (!pet.sleeping && !busy()) say(pick(PHRASES[mood]), urgent ? 3.2 : 2.4);
    }
  } else if (bubbleEl.hidden === false && t >= bubbleHideAt) {
    hideBubble();
  }
}

// =============================
// Settings panel
// =============================
const stageEl = document.querySelector(".stage");
const modalEl = document.getElementById("settings");
const nameInput = document.getElementById("input-name");

function updateNameUI() {
  document.getElementById("pet-name").textContent = settings.name;
  document.title = settings.name + " — Mascota Virtual";
  nameInput.value = settings.name;
}

function applyBackground(i) {
  settings.bg = i;
  const b = BACKGROUNDS[i];
  stageEl.style.background = `radial-gradient(circle at 50% 30%, ${b.a} 0%, ${b.b} 55%, ${b.c} 100%)`;
  stageEl.style.boxShadow = `inset 0 0 0 3px ${b.ring}`;
  document.querySelectorAll(".swatch").forEach((el, idx) =>
    el.classList.toggle("selected", Number(el.dataset.bg) === i));
}

function markSelectedCharacter() {
  document.querySelectorAll(".char-card").forEach((el) =>
    el.classList.toggle("selected", el.dataset.char === settings.character));
}

function buildSettingsUI() {
  // Background swatches
  const sw = document.getElementById("swatches");
  BACKGROUNDS.forEach((b, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.dataset.bg = i;
    btn.title = b.label;
    btn.setAttribute("aria-label", "Fondo " + b.label);
    btn.style.background = `radial-gradient(circle at 35% 30%, ${b.a} 0%, ${b.b} 55%, ${b.c} 100%)`;
    btn.addEventListener("click", () => applyBackground(i));
    sw.appendChild(btn);
  });

  // Character cards with a live mini portrait
  const cards = document.getElementById("chars");
  for (const id of Object.keys(CHARACTERS)) {
    const ch = CHARACTERS[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "char-card";
    card.dataset.char = id;
    const pv = document.createElement("canvas");
    pv.className = "char-preview";
    const label = document.createElement("span");
    label.textContent = ch.name;
    card.append(pv, label);
    card.addEventListener("click", () => { settings.character = id; markSelectedCharacter(); });
    cards.appendChild(card);
    renderPreview(pv, id);
  }
  markSelectedCharacter();
  applyBackground(settings.bg);
}

function renderPreview(canvasEl, charId) {
  const dpr = 2;
  const size = 72;
  canvasEl.width = size * dpr;
  canvasEl.height = size * dpr;
  const prev = g;
  g = canvasEl.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  const k = 0.56;
  g.translate(size / 2, 10);
  g.scale(k, k);
  g.translate(-50, 4);
  drawBodyCore({ t: 1.2, char: charId, sleeping: false, eyeOpen: 1, sad: false, eating: null, happy: true });
  g = prev;
}

function openSettings() {
  updateNameUI();
  markSelectedCharacter();
  modalEl.hidden = false;
}

function closeSettings() {
  modalEl.hidden = true;
}

document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("btn-close").addEventListener("click", closeSettings);
document.getElementById("btn-done").addEventListener("click", closeSettings);
modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeSettings(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalEl.hidden) closeSettings();
});

// ---- Reset (destructive, asks for confirmation first) ----
const confirmEl = document.getElementById("confirm-reset");

reviveBtn.addEventListener("click", revive);

// ---- Sound mute toggle (persisted in the save) ----
const soundBtn = document.getElementById("btn-sound");

function applySoundIcon() {
  const muted = settings.muted;
  soundBtn.textContent = muted ? "🔇" : "🔊";
  const tip = muted ? "Activar sonido" : "Silenciar";
  soundBtn.title = tip;
  soundBtn.setAttribute("aria-label", tip);
  if (muted) {
    if (playSfx.current) { playSfx.current.pause(); playSfx.current = null; }
  }
}

soundBtn.addEventListener("click", () => {
  settings.muted = !settings.muted;
  applySoundIcon();
  saveGame();
});

// ---- Day/night cycle: 3 minutes of day, 1 minute of night ----
const DAY_LENGTH = 180;   // seconds
const NIGHT_LENGTH = 60;  // seconds

let wasNight = false;
let gamesPlayedSinceDusk = 0; // minigames played during the current day span

// Nighttime chatter — sleepy mood takes over the usual phrases
const NIGHT_PHRASES = [
  "*boooostezo* 🌙",
  "Qué nochecita tan rica...",
  "Zzz tengo un sueñito...",
  "La luna me parece de amigas...",
];

function isItNight(t) {
  return (t % (DAY_LENGTH + NIGHT_LENGTH)) >= DAY_LENGTH;
}

function isYawning(t = nowSec) {
  return !pet.dead && pet.yawnStart >= 0 && t - pet.yawnStart < 1.4;
}

function updateDayNight(t) {
  const night = isItNight(t);
  stageEl.classList.toggle("night", night);
  return night;
}

// A big cute yawn, with a zzz floating away
function doYawn(t) {
  pet.yawnStart = t;
  pet.nextYawnAt = t + rand(20, 40);
  if (!pet.sleeping && evol.stage !== "egg") {
    playSfx("sleep", 1.6); // soft sleepy snippet
    say(pick(NIGHT_PHRASES), 2.8);
    spawnParticle("zzz", pet.x + 40, groundY() - 120);
  }
}

// Nightfall: she yawns, and if she played games during the day the moon
// converts that playtime into bonus XP (cariños de luna).
function onNightfall(t) {
  doYawn(t);
  const played = gamesPlayedSinceDusk;
  gamesPlayedSinceDusk = 0;
  if (played > 0 && !pet.dead && evol.stage !== "egg") {
    const bonus = Math.min(played, 5);
    addXp(bonus);
    updateBars();
    say("¡La luna me regaló +" + bonus + " cariños! 🌙", 3.4);
    const cRect = canvas.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      spawnParticle("sparkle", cRect.width * 0.91 + rand(-14, 14), cRect.height * 0.09 + rand(-10, 10));
    }
  }
}

// ---- Tappable night stars: poke one and it bursts little sparkles ----
const nightOverlay = document.getElementById("night-overlay");

nightOverlay.addEventListener("click", (e) => {
  const star = e.target.closest(".night-star");
  if (!star || !stageEl.classList.contains("night") || pet.dead) return;
  const cRect = canvas.getBoundingClientRect();
  const sRect = star.getBoundingClientRect();
  const x = sRect.left + sRect.width / 2 - cRect.left;
  const y = sRect.top + sRect.height / 2 - cRect.top;
  playSfx("click"); // a happy little squeak
  for (let i = 0; i < 4; i++) {
    spawnParticle("sparkle", x + rand(-12, 12), y + rand(-12, 12));
  }
  star.classList.remove("star-pop");
  void star.offsetWidth; // restart the pop animation
  star.classList.add("star-pop");
});

document.getElementById("btn-reset").addEventListener("click", () => {
  closeSettings();
  confirmEl.hidden = false;
});

document.getElementById("btn-cancel-reset").addEventListener("click", () => {
  confirmEl.hidden = true;
});

document.getElementById("btn-cancel-reset-x").addEventListener("click", () => {
  confirmEl.hidden = true;
});

document.getElementById("btn-confirm-reset").addEventListener("click", () => {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch { /* storage unavailable — nothing to clear */ }
  confirmEl.hidden = true;
  location.reload(); // fresh start: egg, default name and background
});

confirmEl.addEventListener("click", (e) => {
  if (e.target === confirmEl) confirmEl.hidden = true;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmEl.hidden) confirmEl.hidden = true;
});

nameInput.addEventListener("input", () => {
  const v = nameInput.value.trim();
  settings.name = v || "Mochi";
  document.getElementById("pet-name").textContent = settings.name;
  document.title = settings.name + " — Mascota Virtual";
});

// =============================
// Persistence (localStorage)
// =============================
const SAVE_KEY = "mochi-save-v2";
const LEGACY_SAVE_KEY = "mochi-save-v1";
const OFFLINE_DECAY_FACTOR = 0.15; // gentle while away
const OFFLINE_FLOOR = 20;

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2,
      stats: { ...STATS },
      sleeping: pet.sleeping,
      settings: { ...settings },
      evol: { ...evol },
      at: Date.now(),
    }));
  } catch { /* storage unavailable — fine */ }
}

function loadGame() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_SAVE_KEY); // migrate old saves
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.settings) Object.assign(settings, data.settings);
    if (data.evol && EVOL_STAGES.includes(data.evol.stage)) Object.assign(evol, data.evol);
    else if (data.stats) evol.stage = "bebe"; // legacy save: pet already hatched
    if (!data.stats) return;
    Object.assign(STATS, data.stats);
    pet.sleeping = Boolean(data.sleeping);
    const awaySec = clamp((Date.now() - (data.at || Date.now())) / 1000, 0, 60 * 60 * 24 * 7);
    const rate = OFFLINE_DECAY_FACTOR;
    for (const k of Object.keys(DECAY)) {
      STATS[k] = clamp(STATS[k] - DECAY[k] * awaySec * rate, OFFLINE_FLOOR, 100);
    }
    if (pet.sleeping) {
      STATS.energy = clamp(STATS.energy + SLEEP_ENERGY_RATE * awaySec * 0.5, OFFLINE_FLOOR, 100);
    }
  } catch { /* corrupt save — start fresh */ }
  if (pet.sleeping) buttons.sleep.querySelector("span").textContent = "Despertar";
}

setInterval(saveGame, 5000);

// =============================
// Main loop
// =============================
function frame(ms) {
  const dt = Math.min((ms - lastMs) / 1000, 0.05);
  lastMs = ms;
  nowSec += dt;

  mood = computeMood();
  updateBehavior(dt);
  updateParticles(dt);

  g.clearRect(0, 0, W(), H());
  drawPet(nowSec);
  drawParticles();

  requestAnimationFrame(frame);
}

// =============================
// Input wiring
// =============================
buttons.feed.addEventListener("click", toggleFoodMenu);
buttons.play.addEventListener("click", toggleGameMenu);
buttons.clean.addEventListener("click", clean);
buttons.sleep.addEventListener("click", toggleSleep);

// Close the popovers when clicking anywhere else
document.addEventListener("click", (e) => {
  for (const [menu, btn] of [[gameMenuEl, buttons.play], [foodMenuEl, buttons.feed]]) {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.hidden = true;
    }
  }
});

canvas.addEventListener("click", () => {
  if (pet.dead) { say(pick(PHRASES.dead), 1.8); return; }
  if (evol.stage === "egg") {
    playSfx("click");
    eggPulse = 1;
    spawnParticle("sparkle", pet.x + rand(-30, 30), groundY() - rand(40, 90));
    say(pick(["Coco, coco...", "¡Se movió!", "Algo despierta adentro..."]), 1.4);
    addXp(1);
    return;
  }
  if (busy()) return;
  if (pet.sleeping) { say("Zzz... (déjame dormir)", 1.6); return; }
  playSfx("click");
  pet.jump.vy = 1.5;
  pet.jump.active = true;
  spawnParticle("heart", pet.x + rand(-20, 20), groundY() - 130);
  say(pick(["¡Hola!", "¡Jeje!", "*meneo feliz*", "¡Pío!"]), 1.6);
  addXp(1);
});

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "f") toggleFoodMenu();
  else if (k === "p") toggleGameMenu();
  else if (k === "c") clean();
  else if (k === "s") toggleSleep();
});

// =============================
// Boot
// =============================
let lastMs = performance.now();

resizeCanvas();
loadGame();          // restore saved settings before building the panel
buildSettingsUI();
buildGameMenu();
buildFoodMenu();
applySoundIcon();    // restore mute state from the save
updateNameUI();
updateEvolutionUI();
resetPetPosition();
updateBars();
updateButtonsState();
say(pick(["¡Hola! Soy " + settings.name, "¡Salí del cascarón!", "¿Me cuidas?"]), 3.5);
requestAnimationFrame(frame);

function resetPetPosition() {
  pet.x = W() / 2;
  pet.targetX = pet.x;
}

window.addEventListener("resize", () => {
  resetPetPosition();
});
