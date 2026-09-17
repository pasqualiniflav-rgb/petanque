import { useState, useEffect, useRef, useCallback } from "react";

// ------------------------------------------------------------------
// Pétanque en ligne — jusqu'à 9 joueurs (3 équipes), temps réel.
// Deux terrains au choix de l'hôte : Classique (vue entière) et
// Long 10 m (caméra qui suit l'action + mini-carte).
// ------------------------------------------------------------------

const VIEW_W = 340, VIEW_H = 520; // taille du canvas à l'écran
const R_BOULE = 11, R_COCH = 6;
const TEAMS = ["A", "B", "C"];
const TEAM_COLORS = { A: "#2ba3d4", B: "#bd4f3a", C: "#c9a02e" };
const TEAM_NAMES = { A: "Équipe ciel", B: "Équipe rouge", C: "Équipe ocre" };
const CRIS = ["Oh peuchère !", "Tè, vé !", "Oh fan de chichourle !", "Boudiou !", "Adieu vat !"];
const TARGET = 13;
const POLL_MS = 4000; // simple roue de secours : le flux temps réel fait le travail
const TEMPS_LANCER = 15; // secondes par lancer

// Chaque terrain porte sa géométrie et sa calibration physique.
const TERRAINS = {
  classique: {
    nom: "Classique", W: 340, L: 520,
    camera: false, subSteps: 1, stopSeuil: 0.04,
    muRoll: 0.9855, angleMax: 25,
    vPoint: p => 2.9 + (p / 100) * 4.6,
    vTir: 8.5, muTir: 0.88,
    airTir: p => Math.max(60, 140 + (p / 100) * 360 - 26),
    cochMin: 170, skidSeuil: 4, skidMu: 0.94,
  },
  long: {
    nom: "Long 10 m", W: 640, L: 2750,
    camera: true, subSteps: 8, stopSeuil: 0.2,
    muRoll: 0.975, angleMax: 8,
    vPoint: p => 12 + (p / 100) * 58,
    vTir: 22, muTir: 0.86,
    airTir: p => Math.max(150, 300 + (p / 100) * 2300 - 60),
    cochMin: 1400, skidSeuil: 12, skidMu: 0.9,
  },
};
const terrainDe = st => TERRAINS[(st && st.terrain) || "classique"];
const departDe = T => ({ x: T.W / 2, y: T.L - 30 });

// ---------- Règles ------------------------------------------------

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function activeTeams(st) {
  return TEAMS.filter(t => st.players.some(p => p.team === t));
}

// Équipe qui doit jouer : celle dont la meilleure boule est la plus
// éloignée du cochonnet (ou qui n'a encore rien lancé), parmi celles
// qui ont encore des boules. Retourne l'id du joueur, ou null.
function nextToPlay(st) {
  const m = st.mene;
  const teams = activeTeams(st);
  const leftOf = t =>
    st.players.filter(p => p.team === t).reduce((s, p) => s + (m.left[p.id] || 0), 0);
  const canPlay = teams.filter(t => leftOf(t) > 0);
  if (canPlay.length === 0) return null;
  // Cochonnet pas encore lancé : premier joueur de l'équipe qui ouvre la mène
  if (!m.cochonnet) {
    const cands = st.players.filter(p => p.team === m.firstTeam && (m.left[p.id] || 0) > 0);
    cands.sort((a, b) => (m.left[b.id] || 0) - (m.left[a.id] || 0));
    return cands[0]?.id ?? null;
  }
  const bestOf = t => {
    const bs = m.boules.filter(b => b.team === t);
    return bs.length ? Math.min(...bs.map(b => dist(b, m.cochonnet))) : Infinity;
  };
  const order = t => {
    const i = teams.indexOf(t), f = teams.indexOf(m.firstTeam);
    return (i - f + teams.length) % teams.length;
  };
  let target = null, worst = -1, worstOrder = Infinity;
  for (const t of canPlay) {
    const d = bestOf(t);
    if (d > worst || (d === worst && order(t) < worstOrder)) {
      worst = d; worstOrder = order(t); target = t;
    }
  }
  const cands = st.players.filter(p => p.team === target && (m.left[p.id] || 0) > 0);
  cands.sort((a, b) => (m.left[b.id] || 0) - (m.left[a.id] || 0));
  return cands[0]?.id ?? null;
}

// Points de la mène : l'équipe la plus proche marque autant de points
// que de boules mieux placées que la meilleure boule adverse.
function scoreMene(st) {
  const m = st.mene;
  const teams = activeTeams(st);
  const bestOf = t => {
    const bs = m.boules.filter(b => b.team === t);
    return bs.length ? Math.min(...bs.map(b => dist(b, m.cochonnet))) : Infinity;
  };
  const ranked = teams.map(t => ({ t, d: bestOf(t) })).sort((a, b) => a.d - b.d);
  if (!isFinite(ranked[0].d)) return null;
  const winner = ranked[0].t;
  const rival = ranked.length > 1 ? ranked[1].d : Infinity;
  const pts = m.boules.filter(b => b.team === winner && dist(b, m.cochonnet) < rival).length;
  return { team: winner, pts: Math.max(1, pts) };
}

function newMene(st, firstTeam, num) {
  // Équipes de tailles différentes : même total de boules par équipe.
  // Ex. à 2 contre 3 avec 2 boules/joueur : le duo reçoit 3 boules chacun.
  // Plafond de 4 boules par joueur pour éviter les cas absurdes (1 contre 3).
  const teams = activeTeams(st);
  const maxTaille = Math.max(...teams.map(t => st.players.filter(p => p.team === t).length));
  const left = {};
  for (const t of teams) {
    const joueurs = st.players.filter(p => p.team === t);
    const total = st.boulesEach * maxTaille;
    joueurs.forEach((p, i) => {
      const part = Math.floor(total / joueurs.length) + (i < total % joueurs.length ? 1 : 0);
      left[p.id] = Math.min(4, part);
    });
  }
  st.mene = { num, firstTeam, cochonnet: null, boules: [], left };
}

// ---------- Physique ----------------------------------------------

function makeBodies(st) {
  const m = st.mene;
  const bodies = m.boules.map(b => ({ ...b, r: R_BOULE, mass: 1, vx: 0, vy: 0, kind: "boule" }));
  if (m.cochonnet) bodies.push({ ...m.cochonnet, r: R_COCH, mass: 0.35, vx: 0, vy: 0, kind: "coch" });
  return bodies;
}

function stepPhysics(bodies, T) {
  let moving = false;
  const n = T.subSteps; // sous-pas : pas de tunnel à haute vitesse sur le grand terrain
  for (let s = 0; s < n; s++) {
    for (const b of bodies) {
      b.x += b.vx / n; b.y += b.vy / n;
      if (b.air > 0) {
        b.air -= Math.hypot(b.vx, b.vy) / n; // en vol : pas de frottement
        if (b.air <= 0) b.air = 0;
      }
      if (b.kind === "coch") { // le cochonnet rebondit sur les bords
        if (b.x < b.r) { b.x = b.r; b.vx *= -0.5; }
        if (b.x > T.W - b.r) { b.x = T.W - b.r; b.vx *= -0.5; }
        if (b.y < b.r) { b.y = b.r; b.vy *= -0.5; }
        if (b.y > T.L - b.r) { b.y = T.L - b.r; b.vy *= -0.5; }
      } else if (b.y < b.r + 4) {
        b.dead = true; b.vx = 0; b.vy = 0; // ligne de fond franchie = boule morte
      } else if (b.x < -b.r || b.x > T.W + b.r || b.y > T.L + b.r) {
        b.dead = true; b.vx = 0; b.vy = 0; // côtés : morte seulement si entièrement sortie
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], c = bodies[j];
        if (a.dead || c.dead || a.air > 0 || c.air > 0) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy), min = a.r + c.r;
        if (d > 0 && d < min) {
          const nx = dx / d, ny = dy / d;
          const overlap = (min - d) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;
          const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rel < 0) {
            // Le tir claque (carreau possible), le pointé pousse mollement
            const rest = (a.tir || c.tir) ? 0.9 : 0.45;
            const imp = (-(1 + rest) * rel) / (1 / a.mass + 1 / c.mass);
            a.vx -= (imp / a.mass) * nx; a.vy -= (imp / a.mass) * ny;
            c.vx += (imp / c.mass) * nx; c.vy += (imp / c.mass) * ny;
            // une boule frappée fort dérape et s'arrête vite
            for (const b of [a, c]) if (Math.hypot(b.vx, b.vy) > T.skidSeuil) b.mu = T.skidMu;
            moving = true;
          }
        }
      }
    }
  }
  for (const b of bodies) {
    if (b.air <= 0 || b.air === undefined) {
      const mu = b.mu || T.muRoll;
      b.vx *= mu; b.vy *= mu;
    }
    if (Math.hypot(b.vx, b.vy) < T.stopSeuil) { b.vx = 0; b.vy = 0; } else moving = true;
  }
  return moving;
}

// ---------- Ambiance sonore ---------------------------------------

let audioCtx = null;
let cigaleNodes = null;
let ambianceNodes = null;
let ivresseAudio = 0;

// Chez l'équipe arrosée, tout l'univers sonore ralentit et ondule :
// cigales comme musique d'ambiance
function appliquerIvresseAuxSources() {
  if (!audioCtx) return;
  for (const ens of [cigaleNodes, ambianceNodes]) {
    if (!ens) continue;
    for (const s of ens.srcs) {
      if (!s.playbackRate) continue;
      const base = s._base || (s._base = s.playbackRate.value);
      s.playbackRate.value = base * (1 - 0.045 * ivresseAudio);
      if (!s._wob) {
        const w = audioCtx.createOscillator();
        w.frequency.value = 0.35;
        const wg = audioCtx.createGain(); wg.gain.value = 0;
        w.connect(wg); wg.connect(s.playbackRate); w.start();
        s._wob = wg;
        ens.wobs.push(w);
      }
      s._wob.gain.value = 0.022 * ivresseAudio;
    }
  }
}
function reglerIvresseCigales(niveau) {
  ivresseAudio = niveau;
  appliquerIvresseAuxSources();
}

async function demarrerCigales() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  audioCtx = audioCtx || new AC();
  audioCtx.resume();
  arreterCigales(); // pas de doublon si déjà en cours
  const master = audioCtx.createGain();
  master.gain.value = 0.35;
  master.connect(audioCtx.destination);
  cigaleNodes = { master, srcs: [], wobs: [] };
  // 1) Un vrai enregistrement si un fichier cigales.mp3 est posé à côté de la page
  try {
    const r = await fetch("cigales.mp3");
    if (r.ok) {
      const buf = await audioCtx.decodeAudioData(await r.arrayBuffer());
      if (!cigaleNodes) return true; // coupé entre-temps
      const src = audioCtx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = audioCtx.createGain(); g.gain.value = 0.8;
      src.connect(g); g.connect(master);
      src.start();
      cigaleNodes.srcs.push(src);
      appliquerIvresseAuxSources();
      return true;
    }
  } catch {}
  if (!cigaleNodes) return true;
  // 2) Sinon, synthèse : crécelle de clics résonnants dans les aigus
  const sr = audioCtx.sampleRate;
  const dur = 3;
  const buf = audioCtx.createBuffer(1, sr * dur, sr);
  const d = buf.getChannelData(0);
  const clicRate = 105;          // ~105 clics/s : la stridulation
  const groupHz = 13 / dur;      // 13 cycles exacts -> boucle sans couture
  let t = 0;
  while (t < dur) {
    const i0 = Math.floor(t * sr);
    const amp = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * groupHz * t));
    const decay = sr * 0.0012;
    for (let n = 0; n < sr * 0.004 && i0 + n < d.length; n++) {
      d[i0 + n] += (Math.random() * 2 - 1) * Math.exp(-n / decay) * amp;
    }
    t += (1 / clicRate) * (0.92 + Math.random() * 0.16); // léger tremblé naturel
  }
  const uneCigale = (vitesse) => {
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.loop = true; src.playbackRate.value = vitesse;
    const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200;
    const bp = audioCtx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 8200; bp.Q.value = 2.2;
    const g = audioCtx.createGain(); g.gain.value = 0.4;
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master);
    src.start(audioCtx.currentTime + Math.random() * 0.7);
    cigaleNodes.srcs.push(src);
  };
  uneCigale(1); uneCigale(1.06); // deux cigales légèrement décalées
  appliquerIvresseAuxSources();
  return true;
}

function arreterCigales() {
  if (!cigaleNodes) return;
  const n = cigaleNodes;
  cigaleNodes = null;
  try {
    n.master.gain.value = 0;
    for (const s of n.srcs) s.stop();
    for (const s of n.wobs || []) s.stop();
  } catch {}
}

// Piste musicale superposée : joue en boucle musique.mp3 (ou ambiance.mp3)
async function demarrerAmbiance() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  audioCtx = audioCtx || new AC();
  audioCtx.resume();
  arreterAmbiance(); // pas de doublon si déjà en cours
  const master = audioCtx.createGain();
  master.gain.value = 0.4;
  master.connect(audioCtx.destination);
  ambianceNodes = { master, srcs: [], wobs: [] };
  try {
    let r = await fetch("musique.mp3");
    if (!r.ok) r = await fetch("ambiance.mp3");
    if (!r.ok) throw 0;
    const buf = await audioCtx.decodeAudioData(await r.arrayBuffer());
    if (!ambianceNodes) return true; // coupée entre-temps
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = audioCtx.createGain(); g.gain.value = 0.8;
    src.connect(g); g.connect(master);
    src.start();
    ambianceNodes.srcs.push(src);
    appliquerIvresseAuxSources();
    return true;
  } catch {
    arreterAmbiance();
    return false; // pas de fichier sur le dépôt
  }
}

function arreterAmbiance() {
  if (!ambianceNodes) return;
  const n = ambianceNodes;
  ambianceNodes = null;
  try {
    n.master.gain.value = 0;
    for (const s of n.srcs) s.stop();
    for (const s of n.wobs || []) s.stop();
  } catch {}
}

// ---------- Synchronisation via Firebase Realtime Database --------

const DB_URL = "https://petanque-a12e0-default-rtdb.europe-west1.firebasedatabase.app";

// Firebase ne stocke pas les tableaux vides ni les valeurs null :
// on remet les champs attendus en place après lecture.
function normalize(st) {
  if (!st) return null;
  st.players = st.players || [];
  st.scores = st.scores || { A: 0, B: 0, C: 0 };
  st.drinks = st.drinks || { A: 0, B: 0, C: 0 };
  st.tourneePending = st.tourneePending || null;
  st.lastTournee = st.lastTournee || null;
  st.streak = st.streak || null;
  st.terrain = st.terrain || "classique";
  if (st.mene) {
    st.mene.boules = st.mene.boules || [];
    st.mene.left = st.mene.left || {};
    st.mene.cochonnet = st.mene.cochonnet || null;
  }
  if (st.replay && st.replay.before) {
    st.replay.before.boules = st.replay.before.boules || [];
    st.replay.before.cochonnet = st.replay.before.cochonnet || null;
  }
  return st;
}

async function loadGame(code) {
  try {
    const r = await fetch(`${DB_URL}/petanque/${encodeURIComponent(code)}.json`);
    if (!r.ok) return null;
    return normalize(await r.json());
  } catch { return null; }
}
async function saveGame(code, st) {
  st.rev = Date.now(); // horodatage : évite les collisions de versions entre appareils
  try {
    const r = await fetch(`${DB_URL}/petanque/${encodeURIComponent(code)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(st),
    });
    return r.ok;
  } catch { return false; }
}

// ---------- Dessin ------------------------------------------------

function drawField(ctx, st, bodiesOverride, aim, ivresse, T) {
  const list = bodiesOverride || makeBodies(st);
  const START = departDe(T);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // Caméra du grand terrain : elle suit ce qui bouge, sinon le cochonnet
  let cam = null;
  if (T.camera) {
    let cible = null, vmax = 0.5;
    for (const b of list) {
      if (b.dead) continue;
      const sp = Math.hypot(b.vx || 0, b.vy || 0);
      if (sp > vmax) { vmax = sp; cible = b; }
    }
    const coch = list.find(b => b.kind === "coch" && !b.dead);
    const foc = cible || coch || { x: T.W / 2, y: T.L * 0.45 };
    cam = {
      x: Math.max(VIEW_W / 2, Math.min(T.W - VIEW_W / 2, foc.x)),
      y: Math.max(VIEW_H / 2, Math.min(T.L - VIEW_H / 2, foc.y)),
    };
    ctx.setTransform(1, 0, 0, 1, VIEW_W / 2 - cam.x, VIEW_H / 2 - cam.y);
  }

  // sable
  ctx.fillStyle = "#d8c49a";
  ctx.fillRect(0, 0, T.W, T.L);
  let seed = 7;
  const prand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = "rgba(120,98,60,0.18)";
  const nGrains = T.camera ? 1400 : 260;
  for (let i = 0; i < nGrains; i++) {
    ctx.fillRect(prand() * T.W, prand() * T.L, 1.6, 1.6);
  }
  // ombres de platanes le long du terrain
  ctx.fillStyle = "rgba(40, 50, 25, 0.10)";
  for (let y = 80; y < T.L; y += 430) {
    const gauche = (Math.floor(y / 430) % 2) === 0;
    ctx.beginPath();
    ctx.ellipse(gauche ? 30 : T.W - 30, y, 95, 55, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // bordure et rond de lancer
  ctx.strokeStyle = "#efe6cf"; ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, T.W - 8, T.L - 8);
  ctx.beginPath();
  ctx.arc(START.x, START.y, 20, 0, Math.PI * 2);
  ctx.stroke();
  // visée : simple repère de direction, la distance se jauge à l'œil
  if (aim) {
    const rad = (aim.angle * Math.PI) / 180;
    const len = 70;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(60,50,30,0.45)";
    ctx.beginPath();
    ctx.moveTo(START.x, START.y);
    ctx.lineTo(START.x + Math.sin(rad) * len, START.y - Math.cos(rad) * len);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const b of list) {
    if (b.dead) continue;
    // ombre (décalée quand la boule vole, pendant un tir)
    const lift = b.air > 0 ? 7 : 0;
    ctx.beginPath();
    ctx.fillStyle = "rgba(70,55,30,0.25)";
    ctx.ellipse(b.x + 2, b.y + 4 + lift, b.r, b.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // corps
    const by = b.y - lift;
    const g = ctx.createRadialGradient(b.x - b.r / 3, by - b.r / 3, 1, b.x, by, b.r);
    if (b.kind === "coch") {
      g.addColorStop(0, "#ffd98a"); g.addColorStop(1, "#c67f1e");
    } else {
      g.addColorStop(0, "#eee"); g.addColorStop(0.35, TEAM_COLORS[b.team]); g.addColorStop(1, "#222");
    }
    ctx.beginPath();
    ctx.fillStyle = g;
    ctx.arc(b.x, by, b.r + (lift ? 1.5 : 0), 0, Math.PI * 2);
    ctx.fill();
    if (ivresse > 0) { // vision double : un fantôme décalé de chaque boule
      ctx.globalAlpha = Math.min(0.35, 0.1 + ivresse * 0.045);
      ctx.beginPath();
      ctx.fillStyle = b.kind === "coch" ? "#e8b45a" : TEAM_COLORS[b.team];
      ctx.arc(b.x + 3 + ivresse * 1.2, by - 1 - ivresse * 0.5, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // mini-carte du grand terrain
  if (T.camera && cam) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const mw = 40, mh = Math.round(mw * T.L / T.W);
    const mx = VIEW_W - mw - 6, my = 6, s = mw / T.W;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#cdb98f";
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = "#efe6cf"; ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    if (aim) { // direction du lancer (jamais la distance)
      const rad = (aim.angle * Math.PI) / 180;
      ctx.strokeStyle = "rgba(60,50,30,0.6)";
      ctx.beginPath();
      ctx.moveTo(mx + START.x * s, my + START.y * s);
      ctx.lineTo(mx + (START.x + Math.sin(rad) * T.L * 0.16) * s, my + (START.y - Math.cos(rad) * T.L * 0.16) * s);
      ctx.stroke();
    }
    for (const b of list) {
      if (b.dead) continue;
      ctx.fillStyle = b.kind === "coch" ? "#c67f1e" : TEAM_COLORS[b.team];
      ctx.fillRect(mx + b.x * s - 1.5, my + b.y * s - 1.5, 3, 3);
    }
    ctx.strokeStyle = "#26200c";
    ctx.strokeRect(mx + (cam.x - VIEW_W / 2) * s, my + (cam.y - VIEW_H / 2) * s, VIEW_W * s, VIEW_H * s);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- Animations CSS ----------------------------------------

const CSS_IVRESSE = `
@keyframes tanguer {
  0% { transform: rotate(-0.7deg) translateX(-3px); }
  50% { transform: rotate(0.7deg) translateX(3px); }
  100% { transform: rotate(-0.7deg) translateX(-3px); }
}
@keyframes monterVerre {
  from { transform: translateY(70px) rotate(-8deg); opacity: 0; }
  to { transform: translateY(0) rotate(0); opacity: 1; }
}
@keyframes trinquer {
  0% { transform: scale(0.3); opacity: 0; }
  45% { transform: scale(1.12); opacity: 1; }
  65% { transform: scale(0.96); }
  100% { transform: scale(1); opacity: 1; }
}`;

// ---------- Composant principal -----------------------------------

export default function Petanque() {
  const [screen, setScreen] = useState("entry"); // entry | in
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [game, setGame] = useState(null);
  const [meId, setMeId] = useState(null);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(55);
  const [mode, setMode] = useState("point"); // point | tir
  const [cigales, setCigales] = useState(false);
  const [ambiance, setAmbiance] = useState(false);
  const [tourneeAnim, setTourneeAnim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [animating, setAnimating] = useState(false);
  const [, setTic] = useState(0); // horloge du compte à rebours
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const replayedRef = useRef(null); // id du dernier lancer déjà animé sur cet appareil
  const meIdRef = useRef(null);
  const seenTourneeRef = useRef(0);
  const autoLancerRef = useRef(""); // évite de déclencher deux fois le lancer du timer
  gameRef.current = game;

  const me = game?.players.find(p => p.id === meId) || null;
  const isHost = game && game.players[0]?.id === meId;
  const turnId = game && game.phase === "playing" ? nextToPlay(game) : null;
  const myTurn = turnId !== null && turnId === meId;
  const cochToThrow = !!(game && game.phase === "playing" && game.mene && !game.mene.cochonnet);
  const ivresseNiveau = Math.min(6, (game && me && game.drinks && game.drinks[me.team]) || 0);
  const T = terrainDe(game);

  // Réglages remis au hasard avant chaque coup : pas de repère d'un lancer à l'autre
  const randomizeAim = useCallback(() => {
    const amax = terrainDe(gameRef.current).angleMax;
    setAngle(Math.round((Math.random() - 0.5) * 1.6 * amax));
    setPower(25 + Math.round(Math.random() * 75));
  }, []);

  useEffect(() => { if (myTurn) randomizeAim(); }, [myTurn, randomizeAim]);

  useEffect(() => { meIdRef.current = meId; }, [meId]);

  useEffect(() => { reglerIvresseCigales(ivresseNiveau); }, [ivresseNiveau]);

  // Le son est actif « par défaut » : les navigateurs exigeant un geste,
  // il démarre au tout premier clic ou tap, où qu'il soit sur la page
  const autoSonRef = useRef(false);
  useEffect(() => {
    const armer = () => {
      if (autoSonRef.current) return;
      autoSonRef.current = true;
      setCigales(true);
      demarrerCigales();
      demarrerAmbiance().then(ok => { if (ok) setAmbiance(true); }); // muet sans fichier, sans message
    };
    window.addEventListener("pointerdown", armer, { once: true });
    return () => window.removeEventListener("pointerdown", armer);
  }, []);

  // Une tournée vient d'être offerte : grande animation chez les arrosés,
  // simple annonce chez les autres
  useEffect(() => {
    const lt = game?.lastTournee;
    if (!lt || lt.id === seenTourneeRef.current) return;
    seenTourneeRef.current = lt.id;
    if (me && lt.to === me.team) {
      setTourneeAnim(lt.surprise
        ? "SURPRISE ! Trois mènes d'affilée… vous buvez pour accompagner vos amis !"
        : `${TEAM_NAMES[lt.from]} vous offre une tournée de pastis — santé !`);
      setTimeout(() => setTourneeAnim(null), 3400);
    } else {
      setNotice(lt.surprise
        ? `${TEAM_NAMES[lt.to]} enchaîne trois mènes — tournée surprise, ils trinquent aussi !`
        : `Tournée de pastis : ${TEAM_NAMES[lt.from]} régale ${TEAM_NAMES[lt.to]} !`);
      setTimeout(() => setNotice(""), 3400);
    }
  }, [game, me]);

  // --- synchronisation -------------------------------------------
  const animatingRef = useRef(false);
  animatingRef.current = animating;
  const refreshRef = useRef(null);

  // Rejoue un lancer sur cet appareil (flux entrant, ou bouton « Revoir »)
  const lancerAnimationReplay = useCallback((g, etiquette) => {
    const cv = canvasRef.current;
    if (!cv || !g.replay || g.phase === "lobby") return;
    const Tg = terrainDe(g);
    const bodies = g.replay.before.boules.map(b => ({ ...b, r: R_BOULE, mass: 1, vx: 0, vy: 0, kind: "boule" }));
    if (g.replay.before.cochonnet) {
      bodies.push({ ...g.replay.before.cochonnet, r: R_COCH, mass: 0.35, vx: 0, vy: 0, kind: "coch" });
    }
    bodies.push({ ...g.replay.thrown });
    const moi = g.players.find(p => p.id === meIdRef.current);
    const ivresse = Math.min(6, (g.drinks && moi && g.drinks[moi.team]) || 0);
    const who = g.players.find(p => p.id === g.replay.thrown.pid);
    setNotice(etiquette || (who ? `${who.name} joue…` : "Lancer en cours…"));
    setAnimating(true);
    const ctx = cv.getContext("2d");
    let frames = 0;
    const loop = () => {
      const moving = stepPhysics(bodies, Tg);
      drawField(ctx, g, bodies, null, ivresse, Tg);
      frames++;
      if (moving && frames < 1200) requestAnimationFrame(loop);
      else { setAnimating(false); setNotice(""); refreshRef.current && refreshRef.current(); }
    };
    const delai = etiquette ? 0 : Math.max(0, (g.replay.startAt || 0) - Date.now());
    setTimeout(() => requestAnimationFrame(loop), delai);
  }, []);

  // Intégrer un état reçu (par le flux temps réel ou par le sondage de secours)
  const integrer = useCallback((g) => {
    if (!g || animatingRef.current) return;
    if (gameRef.current && g.rev <= (gameRef.current.rev || 0)) return;
    setGame(g);
    if (g.replay && g.replay.id !== replayedRef.current) {
      replayedRef.current = g.replay.id;
      lancerAnimationReplay(g);
    }
  }, [lancerAnimationReplay]);

  const refresh = useCallback(async () => {
    if (!code || animatingRef.current) return;
    integrer(await loadGame(code));
  }, [code, integrer]);
  refreshRef.current = refresh;

  // Flux temps réel Firebase (Server-Sent Events) : la base pousse chaque
  // mise à jour dès qu'elle arrive, sans attendre le prochain sondage
  useEffect(() => {
    if (screen === "entry" || !code) return;
    const es = new EventSource(`${DB_URL}/petanque/${encodeURIComponent(code)}.json`);
    const onPut = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg && msg.path === "/") integrer(normalize(msg.data));
        else refreshRef.current && refreshRef.current();
      } catch {}
    };
    es.addEventListener("put", onPut);
    es.addEventListener("patch", () => { refreshRef.current && refreshRef.current(); });
    return () => es.close();
  }, [screen, code, integrer]);

  useEffect(() => {
    if (screen === "entry") return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [screen, refresh]);

  // Resynchroniser dès que l'app redevient visible (retour d'un autre onglet/app)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // --- horloge du timer de lancer --------------------------------
  useEffect(() => {
    if (!game || game.phase !== "playing" || animating) return;
    const t = setInterval(() => setTic(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [game?.phase, animating]);

  const ecouleMs = game && game.phase === "playing" ? Date.now() - (game.rev || 0) : 0;
  const resteTemps = Math.max(0, TEMPS_LANCER - Math.floor(ecouleMs / 1000));

  // Timer dépassé : le joueur lance au hasard tout seul ; si son appareil
  // est absent, un autre appareil exécute le lancer pour lui (4 s de grâce)
  useEffect(() => {
    if (!game || game.phase !== "playing" || animating || !turnId) return;
    const marque = turnId + ":" + (game.rev || 0);
    if (autoLancerRef.current === marque) return;
    const amax = terrainDe(game).angleMax;
    const hasardA = Math.round((Math.random() - 0.5) * 1.9 * amax);
    const hasardP = 25 + Math.round(Math.random() * 75);
    if (myTurn && ecouleMs > TEMPS_LANCER * 1000) {
      autoLancerRef.current = marque;
      setNotice("Temps écoulé — la boule part toute seule !");
      throwBoule(meId, hasardA, hasardP, "point");
    } else if (!myTurn && ecouleMs > (TEMPS_LANCER + 4) * 1000) {
      autoLancerRef.current = marque;
      const lui = game.players.find(p => p.id === turnId);
      setNotice(`Temps écoulé pour ${lui?.name ?? "…"} — lancer automatique !`);
      throwBoule(turnId, hasardA, hasardP, "point");
    }
  });

  // --- dessin -----------------------------------------------------
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !game || game.phase === "lobby" || animating) return;
    drawField(cv.getContext("2d"), game, null, myTurn ? { angle } : null, ivresseNiveau, T);
  }, [game, angle, myTurn, animating, screen, ivresseNiveau, T]);

  // --- entrée -----------------------------------------------------
  async function join() {
    const n = name.trim(), c = code.trim().toUpperCase();
    if (!n || !c) { setNotice("Entre ton prénom et un code de partie."); return; }
    setBusy(true); setNotice(""); setCode(c);
    let g = await loadGame(c);
    if (!g) {
      g = normalize({
        rev: 0, phase: "lobby", players: [], scores: { A: 0, B: 0, C: 0 },
        drinks: { A: 0, B: 0, C: 0 }, terrain: "classique",
        boulesEach: 2, mene: null, winner: null, lastResult: null,
      });
    }
    const existing = g.players.find(p => p.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      setMeId(existing.id);
    } else if (g.phase !== "lobby") {
      setNotice("La partie a déjà commencé — tu peux regarder en spectateur.");
      setMeId(null);
    } else if (g.players.length >= 9) {
      setNotice("La partie est complète (9 joueurs) — mode spectateur.");
      setMeId(null);
    } else {
      const counts = Object.fromEntries(TEAMS.map(t => [t, g.players.filter(p => p.team === t).length]));
      const team = TEAMS.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
      const p = { id: "p" + Date.now() + Math.floor(Math.random() * 1000), name: n, team };
      g.players.push(p);
      setMeId(p.id);
      if (!(await saveGame(c, g))) { setNotice("Impossible d'enregistrer, réessaie."); setBusy(false); return; }
    }
    replayedRef.current = g?.replay?.id ?? null;
    seenTourneeRef.current = g?.lastTournee?.id ?? 0;
    setGame(g);
    setScreen("in");
    setBusy(false);
  }

  // Toute modification part de la dernière version stockée, pour ne pas
  // écraser ce que les autres joueurs viennent de faire.
  async function mutate(fn) {
    const base = (await loadGame(code)) || game;
    const g = structuredClone(base);
    fn(g);
    setGame(g);
    if (!(await saveGame(code, g))) setNotice("Échec de synchronisation — réessaie.");
  }

  const pickTeam = t => mutate(g => {
    const p = g.players.find(p => p.id === meId);
    if (p) p.team = t;
  });

  const setBoules = n => mutate(g => { g.boulesEach = n; });
  const setTerrain = k => mutate(g => { g.terrain = k; });

  async function start() {
    const base = (await loadGame(code)) || game;
    if (activeTeams(base).length < 2) { setNotice("Il faut au moins 2 équipes avec un joueur."); return; }
    await mutate(g => {
      g.phase = "playing";
      newMene(g, activeTeams(g)[0], 1);
    });
  }

  const resetGame = () => mutate(g => {
    g.phase = "lobby"; g.scores = { A: 0, B: 0, C: 0 };
    g.drinks = { A: 0, B: 0, C: 0 }; g.tourneePending = null; g.lastTournee = null; g.streak = null;
    g.mene = null; g.winner = null; g.lastResult = null;
  });

  // Après une mène gagnée, n'importe quel joueur de l'équipe gagnante
  // peut offrir la tournée : le premier qui clique décide
  const offrirTournee = (cible) => mutate(g => {
    if (!me || g.tourneePending !== me.team) return; // déjà réglée par un coéquipier
    g.tourneePending = null;
    if (cible) {
      g.drinks = g.drinks || { A: 0, B: 0, C: 0 };
      g.drinks[cible] = (g.drinks[cible] || 0) + 1;
      g.lastTournee = { from: me.team, to: cible, id: Date.now() };
    }
  });

  // --- lancer -----------------------------------------------------
  // pid : le joueur qui lance (soi-même, ou le retardataire du timer)
  async function throwBoule(pid = meId, angleV = angle, powerV = power, modeV = mode) {
    if (animating) return;
    if (pid === meId && !myTurn) return;
    setAnimating(true);
    // Revérifier avec la dernière version : quelqu'un a pu jouer entre-temps
    const latest = (await loadGame(code)) || game;
    if (latest.phase !== "playing" || nextToPlay(latest) !== pid) {
      setGame(latest);
      setAnimating(false);
      setNotice("Le jeu a évolué entre-temps — vérifie que c'est bien ton tour.");
      return;
    }
    const lanceur = latest.players.find(p => p.id === pid);
    if (!lanceur) { setAnimating(false); return; }
    setNotice("");
    const st = structuredClone(latest);
    const Ts = terrainDe(st);
    const DEP = departDe(Ts);
    const bodies = makeBodies(st);
    // L'ivresse dégrade la précision : plus de tournées bues, plus le geste tremble
    const ivresse = Math.min(6, (st.drinks && st.drinks[lanceur.team]) || 0);
    const echelle = Ts.angleMax / 25; // le bruit angulaire suit l'ouverture du terrain
    const noise = (Math.random() - 0.5) * 3 * (powerV / 100) * echelle
                + (Math.random() - 0.5) * 2.6 * ivresse * echelle;
    const puissance = Math.min(100, Math.max(25, powerV + (Math.random() - 0.5) * 7 * ivresse));
    const rad = ((angleV + noise) * Math.PI) / 180;
    let thrown;
    if (!st.mene.cochonnet) {
      // lancer du cochonnet pour ouvrir la mène
      const v = Ts.vPoint(puissance);
      thrown = {
        x: DEP.x, y: DEP.y, r: R_COCH, mass: 0.35, kind: "coch", pid,
        vx: Math.sin(rad) * v, vy: -Math.cos(rad) * v,
      };
    } else if (modeV === "tir") {
      // tir au fer : la boule vole jusqu'au point de chute puis frappe sec
      thrown = {
        x: DEP.x, y: DEP.y, r: R_BOULE, mass: 1, kind: "boule", tir: true,
        team: lanceur.team, pid, mu: Ts.muTir, air: Ts.airTir(puissance),
        vx: Math.sin(rad) * Ts.vTir, vy: -Math.cos(rad) * Ts.vTir,
      };
    } else {
      const v = Ts.vPoint(puissance);
      thrown = {
        x: DEP.x, y: DEP.y, r: R_BOULE, mass: 1, kind: "boule",
        team: lanceur.team, pid, vx: Math.sin(rad) * v, vy: -Math.cos(rad) * v,
      };
    }
    bodies.push({ ...thrown });
    // Annonce immédiate du lancer : les autres appareils le rejouent en direct,
    // au même top départ — la physique déterministe garantit le même résultat
    const replayMeta = {
      id: Date.now(),
      startAt: Date.now() + 600, // le flux temps réel propage l'annonce en ~200 ms
      before: {
        boules: st.mene.boules.map(b => ({ ...b })),
        cochonnet: st.mene.cochonnet ? { ...st.mene.cochonnet } : null,
      },
    };
    replayedRef.current = replayMeta.id;
    const annonce = structuredClone(latest);
    annonce.replay = { id: replayMeta.id, startAt: replayMeta.startAt, before: replayMeta.before, thrown };
    saveGame(code, annonce); // sans attendre
    setNotice("Tout le monde regarde…");
    const ctx = canvasRef.current.getContext("2d");
    let frames = 0;
    const loop = () => {
      const moving = stepPhysics(bodies, Ts);
      drawField(ctx, st, bodies, null, ivresse, Ts);
      frames++;
      if (moving && frames < 1200) { requestAnimationFrame(loop); }
      else { commit(st, bodies, thrown, replayMeta, pid); }
    };
    setTimeout(() => { setNotice(""); requestAnimationFrame(loop); }, Math.max(0, replayMeta.startAt - Date.now()));
  }

  async function commit(st, bodies, thrown, replayMeta, pid) {
    const Ts = terrainDe(st);
    const DEP = departDe(Ts);
    const wasCochThrow = !st.mene.cochonnet;
    const coch = bodies.find(b => b.kind === "coch");
    if (wasCochThrow && Math.hypot(coch.x - DEP.x, coch.y - DEP.y) < Ts.cochMin) {
      setAnimating(false);
      randomizeAim();
      setNotice("Cochonnet trop court — relance-le !");
      return;
    }
    setNotice("");
    st.replay = { id: replayMeta.id, startAt: replayMeta.startAt, before: replayMeta.before, thrown };
    replayedRef.current = st.replay.id;
    st.mene.cochonnet = { x: coch.x, y: coch.y };
    st.mene.boules = bodies
      .filter(b => b.kind === "boule" && !b.dead)
      .map(b => ({ x: b.x, y: b.y, team: b.team, pid: b.pid, tir: b.tir || undefined }));
    if (!wasCochThrow) {
      st.mene.left[pid] = Math.max(0, (st.mene.left[pid] || 0) - 1);
    }
    if (nextToPlay(st) === null) {
      const res = scoreMene(st);
      if (res) {
        st.scores[res.team] += res.pts;
        st.lastResult = { ...res, mene: st.mene.num };
        st.streak = st.streak && st.streak.team === res.team
          ? { team: res.team, count: st.streak.count + 1 }
          : { team: res.team, count: 1 };
        if (st.scores[res.team] >= TARGET) {
          st.phase = "finished"; st.winner = res.team;
        } else {
          newMene(st, res.team, st.mene.num + 1);
          st.tourneePending = res.team; // la mène gagnée ouvre droit à une tournée
          if (st.streak.count % 3 === 0) { // 3 d'affilée : les vainqueurs trinquent aussi
            st.drinks[res.team] = (st.drinks[res.team] || 0) + 1;
            st.lastTournee = { to: res.team, surprise: true, id: Date.now() };
          }
        }
      } else {
        st.streak = null; // mène blanche : la série retombe
        newMene(st, st.mene.firstTeam, st.mene.num + 1);
      }
    }
    setGame(st);
    setAnimating(false);
    randomizeAim();
    if (!(await saveGame(code, st))) setNotice("Échec de synchronisation — appuie sur Actualiser puis rejoue.");
  }

  // --- rendu ------------------------------------------------------
  const S = styles;

  function basculerCigales() {
    if (cigales) { arreterCigales(); setCigales(false); }
    else { setCigales(true); demarrerCigales(); }
  }

  async function basculerAmbiance() {
    if (ambiance) { arreterAmbiance(); setAmbiance(false); return; }
    setAmbiance(true);
    if (!(await demarrerAmbiance())) {
      setAmbiance(false);
      setNotice("Dépose un fichier musique.mp3 (ou ambiance.mp3) à la racine du dépôt pour activer la musique.");
      setTimeout(() => setNotice(""), 4500);
    }
  }

  const boutonsSon = (
    <div style={{ display: "flex", gap: 8 }}>
      <button style={S.sndBtn} onClick={basculerCigales} title="Cigales">{cigales ? "🦗" : "🔇"}</button>
      <button style={ambiance ? S.sndBtn : { ...S.sndBtn, opacity: 0.45 }} onClick={basculerAmbiance} title="Musique d'ambiance">🎵</button>
    </div>
  );

  const restantes = t => game && game.mene
    ? game.players.filter(p => p.team === t).reduce((s, p) => s + (game.mene.left[p.id] || 0), 0)
    : 0;

  const teamChip = t => (
    <div key={t} style={{ ...S.chip, borderColor: TEAM_COLORS[t] }}>
      <span style={{ ...S.dot, background: TEAM_COLORS[t] }} />
      <span>{TEAM_NAMES[t]}</span>
      {game.phase === "playing" && game.mene && <span style={S.chipSmall}>●{restantes(t)}</span>}
      {(game.drinks?.[t] || 0) > 0 && <span style={S.chipSmall}>🍹{game.drinks[t]}</span>}
      <strong style={{ marginLeft: "auto" }}>{game.scores[t]}</strong>
    </div>
  );

  if (screen === "entry") {
    return (
      <div style={S.page}>
        <div style={S.sun}>☀️</div>
        <h1 style={S.h1}>Pétanque en ligne</h1>
        <p style={S.tagline}>Sous les platanes, le pastis attend les perdants.</p>
        <p style={S.sub}>Jusqu'à 9 joueurs à distance, chacun sur son appareil, sans compte ni installation. Le premier à {TARGET} points gagne, et une boule qui file au fond du terrain est morte.</p>
        <div style={S.card}>
          <label style={S.label}>Ton prénom</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="Marius" />
          <label style={S.label}>Code de la partie</label>
          <input style={S.input} value={code} onChange={e => setCode(e.target.value)} placeholder="APERO2026" />
          <button style={S.btn} disabled={busy} onClick={join}>Rejoindre ou créer la partie</button>
          <p style={S.hint}>Partagez le même code entre vous : le premier arrivé crée la partie, les autres la rejoignent.</p>
        </div>
        {boutonsSon}
        {notice && <p style={S.notice}>{notice}</p>}
      </div>
    );
  }

  if (!game) return <div style={S.page}><p style={S.sub}>Chargement…</p></div>;

  if (game.phase === "lobby") {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Partie {code}</h1>
        <p style={S.sub}>{game.players.length}/9 joueurs. Chacun choisit son équipe, puis l'hôte lance la partie.</p>
        {TEAMS.map(t => (
          <div key={t} style={{ ...S.teamBox, borderColor: TEAM_COLORS[t] }}>
            <div style={S.teamHead}>
              <span style={{ ...S.dot, background: TEAM_COLORS[t] }} />
              <strong>{TEAM_NAMES[t]}</strong>
              {me && me.team !== t && game.players.filter(p => p.team === t).length < 3 && (
                <button style={S.miniBtn} onClick={() => pickTeam(t)}>Me placer ici</button>
              )}
            </div>
            <div style={S.names}>
              {game.players.filter(p => p.team === t).map(p => (
                <span key={p.id} style={S.nameTag}>{p.name}{p.id === meId ? " (toi)" : ""}</span>
              ))}
            </div>
          </div>
        ))}
        {isHost && (
          <div style={S.card}>
            <label style={S.label}>Boules par joueur</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3].map(n => (
                <button key={n} style={game.boulesEach === n ? S.btnSmallOn : S.btnSmall} onClick={() => setBoules(n)}>{n}</button>
              ))}
            </div>
            <label style={S.label}>Terrain</label>
            <p style={S.hint}>Équipes inégales ? Le total de boules par équipe est équilibré automatiquement.</p>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(TERRAINS).map(([k, tt]) => (
                <button key={k} style={(game.terrain || "classique") === k ? S.btnSmallOn : S.btnSmall} onClick={() => setTerrain(k)}>{tt.nom}</button>
              ))}
            </div>
            <button style={S.btn} onClick={start}>Lancer la partie</button>
          </div>
        )}
        {!isHost && (
          <p style={S.hint}>
            Terrain : {terrainDe(game).nom}. En attente que l'hôte ({game.players[0]?.name}) lance la partie…
          </p>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={S.btnGhost} onClick={refresh}>Actualiser</button>
          {boutonsSon}
        </div>
        {notice && <p style={S.notice}>{notice}</p>}
      </div>
    );
  }

  const turnPlayer = game.players.find(p => p.id === turnId);
  const pointLive = game.phase === "playing" && game.mene && game.mene.cochonnet && game.mene.boules.length
    ? scoreMene(game) : null;

  return (
    <div style={S.pageGame}>
      <style>{CSS_IVRESSE}</style>
      {tourneeAnim && (
        <div style={S.tourneeOverlay}>
          <div style={S.tourneeGlasses}>
            <span style={{ ...S.verre, animation: "monterVerre .6s ease-out both" }}>🍹</span>
            <span style={{ ...S.verre, animation: "monterVerre .6s .18s ease-out both" }}>🍹</span>
            <span style={{ ...S.verre, animation: "monterVerre .6s .36s ease-out both" }}>🍹</span>
          </div>
          <p style={{ ...S.tourneeTxt, animation: "trinquer .8s .55s both" }}>{tourneeAnim}</p>
        </div>
      )}
      <div style={S.scoreRow}>
        {activeTeams(game).map(teamChip)}
        {boutonsSon}
      </div>
      {game.tourneePending && me && game.tourneePending === me.team && game.phase === "playing" && (
        <div style={S.tourneeBar}>
          <span style={S.tourneeQ}>Mène gagnée ! La tournée est pour…</span>
          {activeTeams(game).filter(t => t !== me.team).map(t => (
            <button key={t} style={{ ...S.tourneeBtn, borderColor: TEAM_COLORS[t] }} onClick={() => offrirTournee(t)}>{TEAM_NAMES[t]}</button>
          ))}
          <button style={S.tourneeBtn} onClick={() => offrirTournee(null)}>Passer</button>
        </div>
      )}
      {game.lastResult && game.phase !== "finished" && (
        <p style={S.banner}>
          {CRIS[game.lastResult.mene % CRIS.length]} Mène {game.lastResult.mene} : {TEAM_NAMES[game.lastResult.team]} marque {game.lastResult.pts} point{game.lastResult.pts > 1 ? "s" : ""}.
        </p>
      )}
      {game.phase === "finished" ? (
        <div style={S.card}>
          <h1 style={S.h1}>{TEAM_NAMES[game.winner]} gagne !</h1>
          <p style={S.sub}>Score final : {activeTeams(game).map(t => `${TEAM_NAMES[t]} ${game.scores[t]}`).join(" — ")}</p>
          {activeTeams(game).filter(t => t !== game.winner && game.scores[t] === 0).map(t => (
            <p key={t} style={S.sub}>{TEAM_NAMES[t]} est Fanny ! La tournée de pastis est pour eux.</p>
          ))}
          {game.replay && !animating && (
            <button style={S.btnGhost} onClick={() => lancerAnimationReplay(game, "Replay du dernier coup…")}>Revoir le dernier coup</button>
          )}
          {isHost && <button style={S.btn} onClick={resetGame}>Nouvelle partie</button>}
        </div>
      ) : (
        <>
          <p style={S.turn}>
            {myTurn
              ? `À toi de jouer, ${me?.name} ! (${game.mene.left[meId]} boule${game.mene.left[meId] > 1 ? "s" : ""}) — ⏱ ${resteTemps} s`
              : `Mène ${game.mene.num} — au tour de ${turnPlayer?.name ?? "…"} (${TEAM_NAMES[turnPlayer?.team] ?? ""}) — ⏱ ${resteTemps} s`}
          </p>
          <p style={S.pointLive}>
            {pointLive ? `${TEAM_NAMES[pointLive.team]} tient le point (+${pointLive.pts})` : "Personne ne tient encore le point."}
          </p>
          <div style={{
            ...S.canvasWrap,
            ...(ivresseNiveau ? {
              animation: `tanguer ${Math.max(2.2, 5.5 - ivresseNiveau * 0.6)}s ease-in-out infinite`,
              filter: `blur(${Math.min(2.2, ivresseNiveau * 0.35)}px) sepia(${Math.min(0.5, ivresseNiveau * 0.08)}) saturate(${1 + ivresseNiveau * 0.06})`,
            } : {}),
          }}>
            <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} style={S.canvas} />
          </div>
          {myTurn && !animating && (
            <div style={S.card}>
              {cochToThrow ? (
                <label style={S.label}>Tu ouvres la mène : lance d'abord le cochonnet.</label>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={mode === "point" ? S.btnSmallOn : S.btnSmall} onClick={() => setMode("point")}>Pointer</button>
                  <button style={mode === "tir" ? S.btnSmallOn : S.btnSmall} onClick={() => setMode("tir")}>Tirer</button>
                </div>
              )}
              <label style={S.label}>Direction</label>
              <input type="range" min={-T.angleMax} max={T.angleMax} value={angle} onChange={e => setAngle(+e.target.value)} style={S.range} />
              <label style={S.label}>{!cochToThrow && mode === "tir" ? "Distance de tir" : "Force"}</label>
              <input type="range" min={25} max={100} value={power} onChange={e => setPower(+e.target.value)} style={S.range} />
              <button style={S.btn} onClick={() => throwBoule()}>
                {cochToThrow ? "Lancer le cochonnet" : mode === "tir" ? "Tirer !" : "Lancer la boule"}
              </button>
            </div>
          )}
          {!myTurn && !animating && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={S.btnGhost} onClick={refresh}>Actualiser</button>
              {game.replay && (
                <button style={S.btnGhost} onClick={() => lancerAnimationReplay(game, "Replay du dernier coup…")}>Revoir le coup</button>
              )}
            </div>
          )}
        </>
      )}
      {notice && <p style={S.notice}>{notice}</p>}
    </div>
  );
}

// ---------- Styles ------------------------------------------------

const styles = {
  page: {
    height: "100dvh", overflowY: "auto", background: "linear-gradient(180deg, #27607e 0%, #333d24 45%, #232919 100%)", color: "#f2eddd",
    fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "16px 12px 24px", boxSizing: "border-box", gap: 12,
  },
  pageGame: {
    height: "100dvh", overflow: "hidden", background: "linear-gradient(180deg, #27607e 0%, #333d24 45%, #232919 100%)", color: "#f2eddd",
    fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "8px 10px", boxSizing: "border-box", gap: 8,
  },
  canvasWrap: {
    flex: 1, minHeight: 0, width: "100%",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  h1: { fontFamily: "Georgia, serif", fontSize: 26, margin: "4px 0", fontWeight: 600 },
  sun: { fontSize: 30, lineHeight: 1, marginBottom: -6 },
  tagline: { fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 14, color: "#8fd4f0", margin: 0 },
  sub: { fontSize: 14, lineHeight: 1.5, opacity: 0.85, maxWidth: 360, textAlign: "center", margin: 0 },
  card: {
    background: "#333b28", borderRadius: 10, padding: 12, width: "100%",
    maxWidth: 360, display: "flex", flexDirection: "column", gap: 6, boxSizing: "border-box",
  },
  label: { fontSize: 13, opacity: 0.8 },
  input: {
    padding: "10px 12px", borderRadius: 8, border: "1px solid #4a5438",
    background: "#242a1a", color: "#f2eddd", fontSize: 16, outline: "none",
  },
  btn: {
    marginTop: 4, padding: "10px 16px", borderRadius: 8, border: "none",
    background: "#f6c324", color: "#26200c", fontSize: 16, fontWeight: 600, cursor: "pointer",
  },
  btnGhost: {
    padding: "10px 16px", borderRadius: 8, border: "1px solid #4a5438",
    background: "transparent", color: "#f2eddd", fontSize: 14, cursor: "pointer",
  },
  btnSmall: {
    padding: "8px 18px", borderRadius: 8, border: "1px solid #4a5438",
    background: "transparent", color: "#f2eddd", fontSize: 15, cursor: "pointer",
  },
  btnSmallOn: {
    padding: "8px 18px", borderRadius: 8, border: "1px solid #f6c324",
    background: "#f6c324", color: "#26200c", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  miniBtn: {
    marginLeft: "auto", padding: "4px 10px", borderRadius: 6, border: "1px solid #4a5438",
    background: "transparent", color: "#f2eddd", fontSize: 12, cursor: "pointer",
  },
  sndBtn: {
    width: 38, borderRadius: 8, border: "1px solid #4a5438",
    background: "#333b28", color: "#f2eddd", fontSize: 15, cursor: "pointer", flexShrink: 0,
  },
  hint: { fontSize: 12, opacity: 0.65, lineHeight: 1.45, margin: 0 },
  notice: { fontSize: 13, color: "#f0b23e", maxWidth: 360, textAlign: "center" },
  canvas: {
    borderRadius: 10, boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
    maxWidth: "100%", maxHeight: "100%", touchAction: "none",
  },
  scoreRow: { display: "flex", gap: 8, width: "100%", maxWidth: 360 },
  chip: {
    flex: 1, display: "flex", alignItems: "center", gap: 4,
    border: "1.5px solid", borderRadius: 8, padding: "6px 6px",
    fontSize: 11, background: "#333b28",
  },
  chipSmall: { fontSize: 10, opacity: 0.9 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  teamBox: {
    width: "100%", maxWidth: 360, border: "1.5px solid", borderRadius: 10,
    padding: 12, background: "#333b28", boxSizing: "border-box",
  },
  teamHead: { display: "flex", alignItems: "center", gap: 8 },
  names: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  nameTag: {
    fontSize: 13, background: "#242a1a", borderRadius: 6, padding: "4px 8px",
  },
  turn: { fontSize: 14, fontWeight: 600, margin: 0, textAlign: "center" },
  pointLive: { fontSize: 12, opacity: 0.85, margin: 0, textAlign: "center" },
  banner: {
    fontSize: 13, background: "#3d462e", borderRadius: 8, padding: "8px 12px",
    maxWidth: 360, margin: 0, textAlign: "center",
  },
  tourneeBar: {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
    background: "#3d462e", borderRadius: 8, padding: "6px 10px",
    width: "100%", maxWidth: 360, boxSizing: "border-box",
  },
  tourneeQ: { fontSize: 12, fontWeight: 600 },
  tourneeBtn: {
    padding: "4px 10px", borderRadius: 6, border: "1px solid #4a5438",
    background: "#242a1a", color: "#f2eddd", fontSize: 12, cursor: "pointer",
  },
  tourneeOverlay: {
    position: "fixed", inset: 0, zIndex: 50, background: "rgba(22, 27, 14, 0.85)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
  },
  tourneeGlasses: { display: "flex", gap: 14 },
  verre: { fontSize: 52 },
  tourneeTxt: {
    fontFamily: "Georgia, serif", fontSize: 19, color: "#f6c324",
    textAlign: "center", maxWidth: 300, margin: 0, lineHeight: 1.4,
  },
  range: { width: "100%" },
};
