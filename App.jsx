import { useState, useEffect, useRef, useCallback } from "react";

// ------------------------------------------------------------------
// Pétanque en ligne — jusqu'à 9 joueurs (3 équipes), temps réel.
// Deux terrains au choix de l'hôte : Classique (vue entière) et
// Long 10 m (caméra qui suit l'action + mini-carte).
// ------------------------------------------------------------------

const VIEW_W = 340, VIEW_H = 520; // fenêtre de jeu (terrain) à l'écran
const SKY_H = 84;                  // bande de décor au-dessus du terrain
const CANVAS_H = VIEW_H + SKY_H;   // hauteur réelle du canvas
const DECOR_W = VIEW_W + 120;      // décor plus large : parallaxe sur le grand terrain
const R_BOULE = 11, R_COCH = 6;
const TEAMS = ["A", "B", "C"];
const TEAM_COLORS = { A: "#2ba3d4", B: "#bd4f3a", C: "#c9a02e" };
const TEAM_NAMES = { A: "Équipe ciel", B: "Équipe rouge", C: "Équipe ocre" };
const CRIS = ["Oh peuchère !", "Tè, vé !", "Oh fan de chichourle !", "Boudiou !", "Adieu vat !"];
const TARGET = 13;
const POLL_MS = 4000; // simple roue de secours : le flux temps réel fait le travail
const TEMPS_LANCER = 15; // secondes par lancer

// Chaque terrain porte sa géométrie et sa calibration physique.
export const TERRAINS = {
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

// Place un joueur à table. En pleine partie il rejoint une équipe déjà
// engagée et attend la mène suivante pour recevoir ses boules — sinon il
// entrerait au milieu d'une mène avec un compte de boules bancal.
// Renvoie null si toutes les équipes ouvertes sont au complet.
function ajouterJoueur(st, nom) {
  const enCours = st.phase !== "lobby";
  const engagees = enCours && activeTeams(st).length ? activeTeams(st) : TEAMS;
  const compte = t => st.players.filter(p => p.team === t).length;
  const libres = engagees.filter(t => compte(t) < 3);
  if (!libres.length || st.players.length >= 9) return null;
  const team = libres.reduce((a, b) => (compte(a) <= compte(b) ? a : b));
  const pris = new Set(st.players.map(p => p.name.toLowerCase()));
  let name = nom;
  for (let i = 2; pris.has(name.toLowerCase()); i++) name = `${nom} ${i}`;
  const p = { id: "p" + Date.now() + Math.floor(Math.random() * 1000), name, team };
  st.players.push(p);
  if (st.mene) st.mene.left[p.id] = 0; // ses boules arrivent à la mène suivante
  return p;
}

// Reste-t-il une place à table ? En pleine partie, seules les équipes
// déjà engagées comptent : on n'ouvre pas une équipe en plein milieu.
function placeLibre(st) {
  if (!st || st.players.length >= 9) return false;
  const engagees = st.phase !== "lobby" && activeTeams(st).length ? activeTeams(st) : TEAMS;
  return engagees.some(t => st.players.filter(p => p.team === t).length < 3);
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

export function stepPhysics(bodies, T) {
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

// ---------- Le bot ------------------------------------------------
// Il joue comme un joueur : il essaie des lancers dans sa tête avec la
// vraie physique, garde le meilleur, puis tremble selon son niveau. Tout
// se passe sur l'appareil qui l'héberge ; le lancer part ensuite par le
// chemin normal, si bien que les autres appareils le rejouent sans rien
// savoir de sa réflexion.

const NIVEAUX_BOT = {
  fanny:    { nom: "Fanny",   sous: "débutante",  grille: 4, affine: 0, bruitA: 0.45, bruitF: 22, tire: false },
  pointeur: { nom: "Pointeur", sous: "correct",   grille: 6, affine: 1, bruitA: 0.14, bruitF: 8,  tire: true },
  fada:     { nom: "Fada",    sous: "chirurgical", grille: 8, affine: 2, bruitA: 0.03, bruitF: 2,  tire: true },
};
const ORDRE_BOTS = ["fanny", "pointeur", "fada"];
// De quoi baptiser les bots sans jamais tomber deux fois sur le même
const PRENOMS_BOT = ["Marius", "Panisse", "César", "Escartefigue", "Honorine",
                     "Titin", "Félicie", "Gervais", "Ugolin"];

// Rejoue un lancer dans le vide : mêmes corps, même physique, mais rien
// n'est affiché ni enregistré.
export function simulerCoup(st, T, team, angle, power, mode) {
  const bodies = makeBodies(st);
  const DEP = departDe(T);
  const rad = (angle * Math.PI) / 180;
  if (!st.mene.cochonnet) {
    const v = T.vPoint(power);
    bodies.push({ x: DEP.x, y: DEP.y, r: R_COCH, mass: 0.35, kind: "coch",
                  vx: Math.sin(rad) * v, vy: -Math.cos(rad) * v });
  } else if (mode === "tir") {
    bodies.push({ x: DEP.x, y: DEP.y, r: R_BOULE, mass: 1, kind: "boule", tir: true, team,
                  mu: T.muTir, air: T.airTir(power),
                  vx: Math.sin(rad) * T.vTir, vy: -Math.cos(rad) * T.vTir });
  } else {
    const v = T.vPoint(power);
    bodies.push({ x: DEP.x, y: DEP.y, r: R_BOULE, mass: 1, kind: "boule", team,
                  vx: Math.sin(rad) * v, vy: -Math.cos(rad) * v });
  }
  let n = 0;
  while (stepPhysics(bodies, T) && n++ < 900) {}
  return bodies;
}

// Ce que vaut un tapis de boules pour l'équipe qui vient de jouer
function noterTapis(bodies, T, team) {
  const coch = bodies.find(b => b.kind === "coch");
  if (!coch) return -1e9;
  const ech = T.L / 520; // un grand terrain, de grandes distances
  const d = b => dist(b, coch) / ech;
  const vivantes = bodies.filter(b => b.kind === "boule" && !b.dead);
  const nous = vivantes.filter(b => b.team === team);
  const eux = vivantes.filter(b => b.team !== team);
  const dNous = nous.length ? Math.min(...nous.map(d)) : 1e4;
  const dEux = eux.length ? Math.min(...eux.map(d)) : 1e4;
  const pour = nous.filter(b => d(b) < dEux).length;   // boules qui marquent
  const contre = eux.filter(b => d(b) < dNous).length; // boules encaissées
  return (pour - contre) * 60 - Math.min(dNous, 300) * 0.9 + Math.min(dEux, 300) * 0.35;
}

// Ouvrir la mène : ni trop court (à refaire), ni au fond, ni sur le bord
function noterCochonnet(bodies, T) {
  const coch = bodies.find(b => b.kind === "coch");
  const DEP = departDe(T);
  const d = Math.hypot(coch.x - DEP.x, coch.y - DEP.y);
  const ech = T.L / 520;
  if (d < T.cochMin * 1.03) return -1e4 + d; // lancer nul, on recommence
  const cible = Math.min((T.L - 30) * 0.86, T.cochMin * 1.5);
  return -Math.abs(d - cible) / ech - (Math.abs(coch.x - T.W / 2) / ech) * 0.4;
}

// Le coup que le bot va tenter : le meilleur qu'il ait trouvé, puis le
// tremblement de sa main.
export function coupDuBot(st, T, joueur) {
  const niv = NIVEAUX_BOT[joueur.niveau] || NIVEAUX_BOT.pointeur;
  const ouvre = !st.mene.cochonnet;
  const noter = ouvre
    ? bodies => noterCochonnet(bodies, T)
    : bodies => noterTapis(bodies, T, joueur.team);
  const modes = ouvre || !niv.tire || !st.mene.boules.some(b => b.team !== joueur.team)
    ? ["point"] : ["point", "tir"];
  const A = T.angleMax;
  // Le grand terrain simule huit sous-pas par image : on y cherche moins
  // large, sinon le bot fige l'appareil le temps de réfléchir.
  const g = T.camera ? Math.max(4, niv.grille - 3) : niv.grille;
  const affine = T.camera ? Math.min(1, niv.affine) : niv.affine;
  let best = null;
  const essayer = (angle, power, mode) => {
    const a = Math.max(-A, Math.min(A, angle));
    const p = Math.max(25, Math.min(100, power));
    const note = noter(simulerCoup(st, T, joueur.team, a, p, mode));
    if (!best || note > best.note) best = { angle: a, power: p, mode, note };
  };
  for (const mode of modes) {
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        essayer(-A + (2 * A * i) / (g - 1), 25 + (75 * j) / (g - 1), mode);
      }
    }
  }
  // puis on resserre autour du meilleur essai
  let pasA = (2 * A) / (g - 1), pasP = 75 / (g - 1);
  for (let k = 0; k < affine; k++) {
    pasA /= 2; pasP /= 2;
    const b = best;
    for (const da of [-1, 0, 1]) for (const dp of [-1, 0, 1]) {
      if (da || dp) essayer(b.angle + da * pasA, b.power + dp * pasP, b.mode);
    }
  }
  return {
    angle: Math.round(best.angle + (Math.random() - 0.5) * 2 * niv.bruitA * A),
    power: Math.round(best.power + (Math.random() - 0.5) * 2 * niv.bruitF),
    mode: best.mode,
  };
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
  st.absents = st.absents || {}; // lancers manqués d'affilée, par joueur
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

// ---------- Décor (bande au-dessus du terrain) --------------------
// Tout ce bloc est purement visuel et local : il ne touche ni à la
// physique ni à l'état partagé. Si une photo est posée à la racine du
// dépôt, elle remplace le décor dessiné dès qu'elle est chargée.

const PHOTOS_DECOR = ["decor.jpg", "decor.jpeg", "decor.png", "decor.webp"];
let photoDecor = null;      // image trouvée, sinon null
let photoCherchee = false;  // une seule tentative par session
let decorCache = null;      // bande pré-rendue (redessinée à chaque image sinon)

function chargerPhotoDecor(auChargement) {
  if (photoCherchee || typeof Image === "undefined") return;
  photoCherchee = true;
  let i = 0;
  const essayer = () => {
    if (i >= PHOTOS_DECOR.length) return; // pas de photo : décor dessiné
    const img = new Image();
    img.onload = () => { photoDecor = img; decorCache = null; auChargement && auChargement(); };
    img.onerror = () => { i++; essayer(); };
    img.src = PHOTOS_DECOR[i];
  };
  essayer();
}

// Photo recadrée en « cover », légèrement réchauffée pour coller au soir
function dessinerPhotoDecor(cx, W, H) {
  const img = photoDecor;
  const k = Math.max(W / img.width, H / img.height);
  const w = img.width * k, h = img.height * k;
  cx.drawImage(img, (W - w) / 2, (H - h) * 0.6, w, h);
  const chaud = cx.createLinearGradient(0, 0, 0, H);
  chaud.addColorStop(0, "rgba(255,206,130,0.10)");
  chaud.addColorStop(1, "rgba(255,180,90,0.20)");
  cx.fillStyle = chaud; cx.fillRect(0, 0, W, H);
}

// Place de village : ciel de fin d'après-midi, collines, façades ocre,
// voûte de platanes. Aléa entièrement reproductible (générateur ensemencé).
function dessinerDecorStylise(cx, W, H) {
  let seed = 20260917;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const ciel = cx.createLinearGradient(0, 0, 0, H);
  ciel.addColorStop(0, "#3f95cd");
  ciel.addColorStop(0.45, "#8ec8e6");
  ciel.addColorStop(0.8, "#e7d2a6");
  ciel.addColorStop(1, "#dcc191");
  cx.fillStyle = ciel; cx.fillRect(0, 0, W, H);

  // soleil bas et son halo
  const sx = W * 0.8, sy = H * 0.42;
  const halo = cx.createRadialGradient(sx, sy, 1, sx, sy, H * 1.1);
  halo.addColorStop(0, "rgba(255,247,209,0.95)");
  halo.addColorStop(0.16, "rgba(255,227,152,0.45)");
  halo.addColorStop(0.5, "rgba(255,207,131,0.16)");
  halo.addColorStop(1, "rgba(255,196,120,0)");
  cx.fillStyle = halo; cx.fillRect(0, 0, W, H);

  // collines de l'arrière-pays
  const colline = (base, phase, couleur) => {
    cx.fillStyle = couleur;
    cx.beginPath();
    cx.moveTo(0, H);
    cx.lineTo(0, base);
    for (let x = 0; x <= W; x += 8) {
      cx.lineTo(x, base - Math.sin(x / 95 + phase) * 6 - Math.sin(x / 31 + phase * 2) * 2.5);
    }
    cx.lineTo(W, H); cx.closePath(); cx.fill();
  };
  colline(H * 0.5, 0.6, "#8fa9b2");
  colline(H * 0.58, 2.1, "#6b8a7e");

  // rangée de façades et toits de tuiles
  const solVillage = H * 0.79;
  const facades = ["#e6cfa4", "#d9b98b", "#cfa878", "#e9d9b6", "#c99a6c"];
  let x = -16, k = 0;
  while (x < W + 12) {
    const w = 24 + Math.floor(rnd() * 24);
    const h = 13 + Math.floor(rnd() * 16);
    const y = solVillage - h;
    cx.fillStyle = facades[k++ % facades.length];
    cx.fillRect(x, y, w, h);
    cx.fillStyle = "rgba(90,70,45,0.16)"; // façade à l'ombre, côté opposé au soleil
    cx.fillRect(x, y, w * 0.35, h);
    cx.fillStyle = "#a8552f";
    cx.beginPath();
    cx.moveTo(x - 3, y); cx.lineTo(x + w + 3, y);
    cx.lineTo(x + w + 1, y - 4); cx.lineTo(x - 1, y - 4);
    cx.closePath(); cx.fill();
    cx.fillStyle = "rgba(58,46,30,0.5)";
    for (let fx = x + 5; fx < x + w - 6; fx += 10) {
      for (let fy = y + 5; fy < y + h - 6; fy += 10) cx.fillRect(fx, fy, 3.5, 5);
    }
    x += w + 2;
  }

  // sol de la place
  const sol = cx.createLinearGradient(0, solVillage - 2, 0, H);
  sol.addColorStop(0, "#c9ab77");
  sol.addColorStop(1, "#ac8b5c");
  cx.fillStyle = sol; cx.fillRect(0, solVillage - 1, W, H - solVillage + 1);

  // platanes : ombre au sol, tronc tacheté, puis couronne de feuillage
  const troncs = [W * 0.04, W * 0.24, W * 0.46, W * 0.68, W * 0.9];
  const hautTronc = H * 0.3;
  for (const tx of troncs) {
    cx.fillStyle = "rgba(60,48,26,0.25)";
    cx.beginPath(); cx.ellipse(tx - 10, solVillage + 4, 16, 3.4, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = "#c2ac82";
    cx.beginPath();
    cx.moveTo(tx - 5, solVillage + 5); cx.lineTo(tx - 3, hautTronc);
    cx.lineTo(tx + 3, hautTronc); cx.lineTo(tx + 5, solVillage + 5);
    cx.closePath(); cx.fill();
    cx.fillStyle = "rgba(96,82,52,0.55)"; // écorce tachetée du platane
    for (let i = 0; i < 9; i++) {
      const ty = hautTronc + rnd() * (solVillage - hautTronc);
      cx.beginPath();
      cx.ellipse(tx - 2.4 + rnd() * 4.6, ty, 1.5, 2.4, 0, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillStyle = "rgba(70,58,34,0.3)"; // côté ombre du tronc
    cx.fillRect(tx - 5, hautTronc, 2.2, solVillage - hautTronc + 5);
  }
  // couronnes : elles se rejoignent en voûte mais laissent passer le ciel
  const couronne = (tx, cy, rayon, couleur, n) => {
    cx.fillStyle = couleur;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd();
      const fx = tx + Math.cos(a) * d * rayon * 1.5;
      const fy = cy + Math.sin(a) * d * rayon * 0.75;
      cx.beginPath();
      cx.ellipse(fx, fy, rayon * (0.3 + rnd() * 0.3), rayon * (0.24 + rnd() * 0.22), rnd() * 3, 0, Math.PI * 2);
      cx.fill();
    }
  };
  for (const tx of troncs) {
    couronne(tx, H * 0.17, 20, "#39592b", 14);
    couronne(tx - 3, H * 0.13, 17, "#4f7433", 12);
    couronne(tx + 4, H * 0.09, 13, "#77a044", 9); // touches de soleil sur le dessus
  }
}

// Ombre de platane projetée sur le terrain : une couronne de folioles
// percée de taches de lumière, pré-rendue une fois puis posée le long du
// terrain. Même générateur ensemencé : identique sur tous les appareils.
const OMBRE_R = 120;
let ombreCache = null;

function textureOmbrePlatane() {
  if (ombreCache) return ombreCache;
  const R = OMBRE_R;
  const cv = document.createElement("canvas");
  cv.width = cv.height = R * 2;
  const cx = cv.getContext("2d");
  let seed = 991733;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const flou = f => { if ("filter" in cx) cx.filter = f; }; // bords doux si le navigateur sait

  // 1. l'ombre du tronc arrive du bord du terrain
  flou("blur(4px)");
  cx.fillStyle = "rgba(62,52,30,0.28)";
  cx.beginPath();
  cx.moveTo(0, R - 15); cx.lineTo(R * 0.7, R - 6);
  cx.lineTo(R * 0.7, R + 6); cx.lineTo(0, R + 15);
  cx.closePath(); cx.fill();

  // 2. masse générale de la couronne, fondue sur les bords
  flou("blur(9px)");
  const masse = cx.createRadialGradient(R, R, R * 0.1, R, R, R);
  masse.addColorStop(0, "rgba(62,52,30,0.20)");
  masse.addColorStop(0.65, "rgba(62,52,30,0.15)");
  masse.addColorStop(1, "rgba(62,52,30,0)");
  cx.fillStyle = masse;
  cx.beginPath(); cx.arc(R, R, R, 0, Math.PI * 2); cx.fill();

  // 3. folioles : le grain du feuillage
  flou("blur(1.6px)");
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.55) * R;
    const rx = 3 + rnd() * 7;
    cx.fillStyle = `rgba(58,48,26,${(0.07 + rnd() * 0.09).toFixed(3)})`;
    cx.beginPath();
    cx.ellipse(R + Math.cos(a) * d, R + Math.sin(a) * d, rx, rx * (0.45 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
    cx.fill();
  }

  // 4. taches de soleil entre les feuilles, plus larges vers le bord
  cx.globalCompositeOperation = "destination-out";
  flou("blur(1.4px)");
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 1.02;
    const bord = d / R;
    const rx = 1.8 + rnd() * (2.5 + bord * 7);
    cx.fillStyle = `rgba(0,0,0,${(0.34 + bord * 0.6).toFixed(3)})`;
    cx.beginPath();
    cx.ellipse(R + Math.cos(a) * d, R + Math.sin(a) * d, rx, rx * (0.5 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    cx.fill();
  }
  cx.globalCompositeOperation = "source-over";
  flou("none");
  ombreCache = cv;
  return cv;
}

// Bande pré-rendue une fois : dessinée à chaque image, elle doit être bon marché
function bandeDecor() {
  if (decorCache) return decorCache;
  const cv = document.createElement("canvas");
  cv.width = DECOR_W; cv.height = SKY_H;
  const cx = cv.getContext("2d");
  if (photoDecor) dessinerPhotoDecor(cx, DECOR_W, SKY_H);
  else dessinerDecorStylise(cx, DECOR_W, SKY_H);
  const fondu = cx.createLinearGradient(0, SKY_H - 18, 0, SKY_H);
  fondu.addColorStop(0, "rgba(58,44,24,0)");
  fondu.addColorStop(1, "rgba(58,44,24,0.38)");
  cx.fillStyle = fondu; cx.fillRect(0, SKY_H - 18, DECOR_W, 18);
  decorCache = cv;
  return cv;
}

// ---------- Sable -------------------------------------------------
// Le sol est peint en deux calques pré-rendus : une tuile de gravier
// répétable (le grain, vu de près) et une carte de nuances étirée sur
// tout le terrain (zones claires, terre tassée, traces de râteau).
// Générateurs ensemencés : même terrain partout, aucun scintillement.

const TUILE_SABLE = 256;
let tuileCache = null, motifSable = null, motifCtx = null, nuancesCache = null;

function tuileSable() {
  if (tuileCache) return tuileCache;
  const N = TUILE_SABLE;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const cx = cv.getContext("2d");
  let seed = 314159;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  cx.fillStyle = "#d7c397";
  cx.fillRect(0, 0, N, N);
  // poussière : le grain fin de la terre battue
  const teintes = ["rgba(178,152,107,0.40)", "rgba(236,224,192,0.38)",
                   "rgba(150,124,84,0.30)", "rgba(208,190,148,0.45)"];
  for (let i = 0; i < 34000; i++) {
    cx.fillStyle = teintes[Math.floor(rnd() * teintes.length)];
    cx.fillRect(Math.floor(rnd() * N), Math.floor(rnd() * N), 1, 1);
  }
  // graviers : petits, nombreux et peu contrastés ; chacun reposé de
  // l'autre côté des bords pour que la tuile se répète sans couture
  for (let i = 0; i < 520; i++) {
    const x = rnd() * N, y = rnd() * N;
    const r = 0.8 + rnd() * 1.7, ang = rnd() * Math.PI;
    const clair = `rgba(233,221,189,${(0.3 + rnd() * 0.28).toFixed(2)})`;
    const eclat = `rgba(252,246,226,${(0.18 + rnd() * 0.2).toFixed(2)})`;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      if (x + dx < -4 || x + dx > N + 4 || y + dy < -4 || y + dy > N + 4) continue;
      cx.fillStyle = "rgba(122,94,52,0.2)"; // le caillou pose sa petite ombre
      cx.beginPath();
      cx.ellipse(x + dx + 0.8, y + dy + 0.9, r, r * 0.74, ang, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = clair;
      cx.beginPath();
      cx.ellipse(x + dx, y + dy, r, r * 0.72, ang, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = eclat; // le soleil accroche la face tournée vers lui
      cx.beginPath();
      cx.ellipse(x + dx - r * 0.28, y + dy - r * 0.26, r * 0.45, r * 0.32, ang, 0, Math.PI * 2);
      cx.fill();
    }
  }
  // quelques cailloux plus gros, posés çà et là : ils donnent l'échelle
  for (let i = 0; i < 26; i++) {
    const x = rnd() * N, y = rnd() * N;
    const r = 2.2 + rnd() * 1.7, ang = rnd() * Math.PI;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      if (x + dx < -8 || x + dx > N + 8 || y + dy < -8 || y + dy > N + 8) continue;
      cx.fillStyle = "rgba(112,86,48,0.26)";
      cx.beginPath();
      cx.ellipse(x + dx + 1.3, y + dy + 1.4, r, r * 0.7, ang, 0, Math.PI * 2);
      cx.fill();
      const g = cx.createRadialGradient(x + dx - r * 0.3, y + dy - r * 0.3, r * 0.1, x + dx, y + dy, r);
      g.addColorStop(0, "rgba(250,244,224,0.75)");
      g.addColorStop(1, "rgba(196,176,134,0.6)");
      cx.fillStyle = g;
      cx.beginPath();
      cx.ellipse(x + dx, y + dy, r, r * 0.72, ang, 0, Math.PI * 2);
      cx.fill();
    }
  }
  tuileCache = cv;
  return cv;
}

function motifDuSable(ctx) {
  if (motifSable && motifCtx === ctx) return motifSable;
  motifCtx = ctx;
  motifSable = ctx.createPattern(tuileSable(), "repeat");
  return motifSable;
}

// Nuances du terrain, rendues en basse définition puis étirées : elles
// cassent la répétition de la tuile sans coûter cher.
function nuancesDuSable(T) {
  const cle = T.W + "x" + T.L;
  if (nuancesCache && nuancesCache.cle === cle) return nuancesCache.cv;
  const w = Math.max(48, Math.round(T.W / 8)), h = Math.max(48, Math.round(T.L / 8));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d");
  let seed = 4242 + T.L;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const taches = (rgb, a, n, rmin, rmax) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin);
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    }
  };
  const n = Math.max(6, Math.round((w * h) / 1400));
  taches("255,246,220", 0.2, n, w * 0.12, w * 0.45); // zones sèches, poussiéreuses
  taches("108,88,54", 0.15, n, w * 0.1, w * 0.4);     // terre tassée par les passages
  taches("150,126,86", 0.1, n * 2, w * 0.04, w * 0.14);

  // traces de râteau : le terrain a été préparé avant la partie
  cx.lineWidth = 1;
  for (let i = 0; i < Math.round(h / 9); i++) {
    const y = rnd() * h;
    cx.strokeStyle = rnd() > 0.5 ? "rgba(255,248,226,0.07)" : "rgba(104,84,52,0.06)";
    cx.beginPath();
    cx.moveTo(0, y);
    cx.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 5, w * 0.7, y + (rnd() - 0.5) * 5, w, y + (rnd() - 0.5) * 4);
    cx.stroke();
  }
  nuancesCache = { cle, cv };
  return cv;
}

// ---------- Traces dans le sable ----------------------------------
// Calque local, jamais synchronisé : chaque appareil rejoue les mêmes
// lancers, donc tout le monde voit naturellement les mêmes traces sans
// qu'on ait besoin de les échanger.

// Deux calques : celui des coups passés (cv) et celui du coup en cours
// (tmp), redessiné d'un trait à chaque image puis fusionné à l'arrivée.
// Sans cela le sillon se repeindrait des centaines de fois sur lui-même.
let traces = null;

function calqueTraces(T) {
  const cle = T.W + "x" + T.L;
  if (traces && traces.cle === cle) return traces;
  const ech = T.camera ? 0.5 : 1; // le grand terrain se contente d'un demi-calque
  const w = Math.round(T.W * ech), h = Math.round(T.L * ech);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  traces = { cv, cx: cv.getContext("2d"), tmp, tcx: tmp.getContext("2d"), cle, ech };
  return traces;
}

function reinitialiserTraces() {
  if (!traces) return;
  traces.cx.clearRect(0, 0, traces.cv.width, traces.cv.height);
  traces.tcx.clearRect(0, 0, traces.tmp.width, traces.tmp.height);
}

// Entre deux mènes le terrain est ratissé : il n'en reste qu'un souvenir
function estomperTraces(garde) {
  if (!traces) return;
  const { cx, cv } = traces;
  cx.save();
  cx.globalCompositeOperation = "destination-out";
  cx.fillStyle = `rgba(0,0,0,${1 - garde})`;
  cx.fillRect(0, 0, cv.width, cv.height);
  cx.restore();
}

// Le coup est joué : son sillon rejoint les anciens
export function fusionnerTraces() {
  if (!traces) return;
  traces.cx.drawImage(traces.tmp, 0, 0);
  traces.tcx.clearRect(0, 0, traces.tmp.width, traces.tmp.height);
}

// Point de chute d'un tir : cratère, bourrelet et sable projeté devant
function marquerImpact(cx, b, ech) {
  const x = b.x * ech, y = b.y * ech, r = b.r * ech;
  cx.fillStyle = "rgba(96,74,42,0.14)";
  cx.beginPath(); cx.ellipse(x, y, r * 1.15, r * 0.95, 0, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = "rgba(252,246,228,0.12)";
  cx.lineWidth = Math.max(1, r * 0.4);
  cx.beginPath(); cx.ellipse(x, y, r * 1.32, r * 1.1, 0, 0, Math.PI * 2); cx.stroke();
  const ang = Math.atan2(b.vy, b.vx);
  cx.strokeStyle = "rgba(240,230,200,0.1)";
  cx.lineWidth = Math.max(1, r * 0.18);
  for (let i = -2; i <= 2; i++) {
    const a = ang + i * 0.3, d = r * 1.15, l = r * (2.3 - Math.abs(i) * 0.5);
    cx.beginPath();
    cx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    cx.lineTo(x + Math.cos(a) * (d + l), y + Math.sin(a) * (d + l));
    cx.stroke();
  }
}

// Appelée à chaque image de la simulation : ce qui roule creuse son
// sillon, ce qui retombe marque son impact. Elle ne fait que lire la
// position des corps — la physique l'ignore complètement.
// Atterrissage d'un pointé : la boule se pose, elle ne creuse presque rien
function marquerPose(cx, b, ech) {
  const x = b.x * ech, y = b.y * ech, r = b.r * ech;
  cx.fillStyle = "rgba(96,74,42,0.09)";
  cx.beginPath(); cx.ellipse(x, y, r * 0.95, r * 0.78, 0, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = "rgba(250,244,226,0.08)";
  cx.lineWidth = Math.max(1, r * 0.26);
  cx.beginPath(); cx.ellipse(x, y, r * 1.12, r * 0.92, 0, 0, Math.PI * 2); cx.stroke();
}

// Appelée à chaque image de la simulation : ce qui roule écarte un peu de
// sable, ce qui retombe marque son point de chute. Elle ne fait que lire
// la position des corps — la physique l'ignore complètement.
// `inscrire` à faux pendant un « Revoir » : on suit le vol sans creuser.
export function marquerTraces(bodies, T, inscrire = true) {
  const t = calqueTraces(T);
  const { tcx, ech } = t;
  if (inscrire) {
    tcx.clearRect(0, 0, t.tmp.width, t.tmp.height);
    tcx.lineCap = "round";
    tcx.lineJoin = "round";
  }
  for (const b of bodies) {
    const enVol = b.air > 0;
    const avance = b._tx === undefined ? 0 : Math.hypot(b.x - b._tx, b.y - b._ty);
    b._tx = b.x; b._ty = b.y;

    // Première observation : une boule qui part du rond est lancée en
    // cloche. La simulation la fait rouler tout du long (on n'y touche
    // pas), mais le sillon, lui, ne commence qu'à la retombée — estimée
    // à un peu plus du tiers de sa portée.
    if (b._v0 === undefined) {
      b._v0 = Math.hypot(b.vx || 0, b.vy || 0);
      b._cloche = !enVol && b._v0 > 0.5 ? (b._v0 / (1 - T.muRoll)) * 0.38 : 0;
      b._reste = b._cloche;
    }
    if (b._reste > 0 && !b.dead) {
      b._reste -= avance;
      b._lob = Math.sin(Math.max(0, 1 - b._reste / b._cloche) * Math.PI); // hauteur vue du dessus
      if (b._reste > 0) { b._saut = true; continue; } // encore en l'air : rien au sol
      b._lob = 0;
      if (inscrire) marquerPose(t.cx, b, ech);
    }

    // le tir retombe : son impact s'inscrit une fois pour toutes
    if (b._tAir > 0 && !enVol && !b.dead && inscrire) marquerImpact(t.cx, b, ech);
    b._tAir = b.air || 0;
    if (!b.dead) {
      if (enVol) b._saut = true; // le vol coupe le sillon en deux tronçons
      else {
        const segs = b._sillon || (b._sillon = []);
        if (b._saut || !segs.length) { segs.push([]); b._saut = false; }
        const seg = segs[segs.length - 1];
        const der = seg[seg.length - 1];
        if (!der || Math.hypot(b.x - der.x, b.y - der.y) > 1.5) seg.push({ x: b.x, y: b.y });
      }
    }
    const segs = b._sillon;
    if (!segs || !inscrire) continue;
    const w = b.r * (b.kind === "coch" ? 0.75 : 0.95) * ech;
    const tracer = (couleur, largeur, depuis) => {
      tcx.strokeStyle = couleur;
      tcx.lineWidth = largeur;
      tcx.beginPath();
      for (const seg of segs) {
        const d = depuis ? Math.max(0, seg.length - 14) : 0;
        if (seg.length - d < 2) continue;
        tcx.moveTo(seg[d].x * ech, seg[d].y * ech);
        for (let i = d + 1; i < seg.length; i++) tcx.lineTo(seg[i].x * ech, seg[i].y * ech);
      }
      tcx.stroke();
    };
    tracer("rgba(250,243,223,0.055)", w * 1.4);   // sable écarté sur les bords
    tracer("rgba(100,76,42,0.06)", w);            // passage de la boule
    tracer("rgba(100,76,42,0.05)", w * 0.8, true); // elle s'appuie un peu en finissant
  }
}

// ---------- Boules ------------------------------------------------
// Chaque boule est pré-rendue en sprite, trois fois plus finement qu'à
// l'écran : on peut y soigner les reflets sans les recalculer soixante
// fois par seconde. Une sprite par couleur d'équipe, plus le cochonnet.

// Les dégradés sont définis une fois dans un cercle unité, puis mis à
// l'échelle au moment du tracé : on garde le contour vectoriel — donc
// parfaitement net — sans reconstruire un dégradé par boule et par image.

const palettes = new Map();
let palettesCtx = null, spriteOmbre = null;

function teinte(hex, vers, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${c.map((v, i) => Math.round(v + (vers[i] - v) * f)).join(",")})`;
}

const BLANC = [255, 255, 255], NOIR = [0, 0, 0];

function paletteBoule(ctx, cle) {
  if (palettesCtx !== ctx) { palettes.clear(); palettesCtx = ctx; }
  if (palettes.has(cle)) return palettes.get(cle);
  const bois = cle === "coch";
  // Un dégradé décentré doit porter au-delà du rayon 1, sinon tout le
  // quart opposé à la lumière tombe d'un coup dans la teinte de fin.
  const unite = (x, y, r0, r1, couleurs) => {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [p, c] of couleurs) g.addColorStop(p, c);
    return g;
  };
  const p = {
    // acier teinté : éclairé au haut-gauche, presque noir au bas-droite
    corps: unite(-0.4, -0.45, 0.02, 1.62, bois
      ? [[0, "#fff8e6"], [0.22, "#f7c264"], [0.5, "#d9922e"], [0.78, "#9c5e17"], [1, "#6d400f"]]
      : [[0, teinte(cle, BLANC, 0.82)], [0.18, teinte(cle, BLANC, 0.36)],
         [0.38, teinte(cle, BLANC, 0.1)], [0.6, cle],
         [0.8, teinte(cle, NOIR, 0.46)], [1, teinte(cle, NOIR, 0.8)]]),
    // le ciel se pose sur la calotte, le sable chaud renvoie par en bas
    ciel: unite(0, 0, 0, 1, [[0, bois ? "rgba(255,242,214,0.3)" : "rgba(190,228,248,0.36)"],
                          [0.6, bois ? "rgba(255,242,214,0.11)" : "rgba(190,228,248,0.13)"],
                          [1, "rgba(190,228,248,0)"]]),
    sol: unite(0, 0, 0, 1, [[0, "rgba(236,206,146,0.42)"], [0.6, "rgba(236,206,146,0.16)"],
                         [1, "rgba(236,206,146,0)"]]),
    // éclat du soleil : petit, franc, légèrement fondu sur les bords
    eclat: unite(0, 0, 0, 1, [[0, "rgba(255,255,255,0.98)"], [0.45, "rgba(255,255,255,0.9)"],
                           [0.75, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]),
    // le contour bas reste dans l'ombre : la boule est posée, pas collée
    creux: unite(-0.2, -0.24, 0.36, 1.32, [[0, "rgba(0,0,0,0)"], [0.78, "rgba(18,12,4,0.12)"],
                                           [1, "rgba(18,12,4,0.46)"]]),
  };
  palettes.set(cle, p);
  return p;
}

// Une boule d'acier teintée, vue du dessus, soleil bas au haut-gauche
function dessinerBoule(ctx, x, y, r, cle) {
  const p = paletteBoule(ctx, cle);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip(); // tous les reflets restent dans la sphère
  const pose = (grad, dx, dy, rx, ry) => {
    ctx.save();
    ctx.translate(dx * r, dy * r);
    ctx.scale(rx * r, ry * r);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  pose(p.corps, 0, 0, 1, 1);
  pose(p.ciel, -0.08, -0.52, 0.78, 0.4);
  pose(p.sol, 0.12, 0.64, 0.66, 0.3);
  // liseré d'acier sur le bord opposé à la lumière
  ctx.strokeStyle = "rgba(255,248,230,0.17)";
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.94, 0.35, 2.5);
  ctx.stroke();
  if (cle !== "coch") { // stries de la boule de pétanque, à peine marquées
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = Math.max(0.5, r * 0.07);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.9, r * (0.52 + i * 0.17), -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  pose(p.creux, 0, 0, 1, 1);
  pose(p.eclat, -0.37, -0.43, 0.3, 0.2);
  ctx.restore();
}

// Ombre portée : une tache douce, étirée et pâlie quand la boule s'élève
function spriteOmbreBoule() {
  if (spriteOmbre) return spriteOmbre;
  const S = 96;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const cx = cv.getContext("2d");
  const g = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(58,44,22,0.5)");
  g.addColorStop(0.42, "rgba(58,44,22,0.3)");
  g.addColorStop(0.75, "rgba(58,44,22,0.09)");
  g.addColorStop(1, "rgba(58,44,22,0)");
  cx.fillStyle = g;
  cx.fillRect(0, 0, S, S);
  spriteOmbre = cv;
  return cv;
}

// ---------- Lumière de fin d'après-midi ---------------------------
// Voile chaud et vignettage, pré-rendus une fois pour tout le canvas :
// ils relient la bande de décor et le terrain sous une même lumière.

let voileCache = null;

function voileLumiere() {
  if (voileCache) return voileCache;
  const cv = document.createElement("canvas");
  cv.width = VIEW_W; cv.height = CANVAS_H;
  const cx = cv.getContext("2d");
  // le soleil est bas à droite : la lumière traverse la scène en biais
  const chaud = cx.createLinearGradient(VIEW_W, 0, 0, CANVAS_H);
  chaud.addColorStop(0, "rgba(255,206,124,0.16)");
  chaud.addColorStop(0.4, "rgba(255,196,118,0.07)");
  chaud.addColorStop(1, "rgba(86,74,128,0.08)"); // à l'opposé, l'ombre bleuit
  cx.fillStyle = chaud;
  cx.fillRect(0, 0, VIEW_W, CANVAS_H);
  // vignettage : les bords s'éteignent doucement
  const vig = cx.createRadialGradient(
    VIEW_W * 0.5, CANVAS_H * 0.46, VIEW_W * 0.3,
    VIEW_W * 0.5, CANVAS_H * 0.46, CANVAS_H * 0.7);
  vig.addColorStop(0, "rgba(38,28,12,0)");
  vig.addColorStop(0.65, "rgba(38,28,12,0.08)");
  vig.addColorStop(1, "rgba(38,28,12,0.3)");
  cx.fillStyle = vig;
  cx.fillRect(0, 0, VIEW_W, CANVAS_H);
  voileCache = cv;
  return cv;
}

// ---------- Dessin ------------------------------------------------

// Petite pilule de texte dessinée sur le canvas : bandeau de résultat sur
// le décor, indication de geste ou message sur le sable. Ça libère autant
// de rangées d'écran pour le terrain.
function pilule(ctx, texte, y, accent) {
  if (!texte) return;
  ctx.save();
  ctx.font = `${accent ? "600 " : ""}12px -apple-system, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = Math.min(VIEW_W - 12, ctx.measureText(texte).width + 22), h = 24;
  const x = VIEW_W / 2;
  ctx.fillStyle = accent ? "rgba(246,195,36,0.92)" : "rgba(24,28,16,0.78)";
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 12) : ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = accent ? "#26200c" : "#f2eddd";
  ctx.fillText(texte, x, y + 1, w - 14);
  ctx.restore();
}

export function drawField(ctx, st, bodiesOverride, aim, ivresse, T, hud) {
  const list = bodiesOverride || makeBodies(st);
  const START = departDe(T);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, CANVAS_H);

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
  }

  // bande de décor : elle glisse doucement quand la caméra se déplace
  const glisse = cam ? (cam.x / T.W - 0.5) : 0;
  ctx.drawImage(bandeDecor(), -(DECOR_W - VIEW_W) / 2 - glisse * (DECOR_W - VIEW_W), 0);

  // le terrain vit sous la bande de décor
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SKY_H, VIEW_W, VIEW_H);
  ctx.clip();
  if (cam) ctx.setTransform(1, 0, 0, 1, VIEW_W / 2 - cam.x, SKY_H + VIEW_H / 2 - cam.y);
  else ctx.setTransform(1, 0, 0, 1, 0, SKY_H);

  // sable : grain répétable, puis nuances du terrain par-dessus.
  // On ne peint que la portion visible : le grand terrain fait 640 x 2750.
  const vue = cam
    ? { x: cam.x - VIEW_W / 2, y: cam.y - VIEW_H / 2, w: VIEW_W, h: VIEW_H }
    : { x: 0, y: 0, w: T.W, h: T.L };
  ctx.fillStyle = motifDuSable(ctx);
  ctx.fillRect(vue.x, vue.y, vue.w, vue.h);
  const nu = nuancesDuSable(T);
  ctx.drawImage(nu,
    (vue.x / T.W) * nu.width, (vue.y / T.L) * nu.height,
    (vue.w / T.W) * nu.width, (vue.h / T.L) * nu.height,
    vue.x, vue.y, vue.w, vue.h);

  // traces laissées par les boules depuis le début de la partie
  const tr = calqueTraces(T);
  for (const calque of [tr.cv, tr.tmp]) {
    ctx.drawImage(calque,
      (vue.x / T.W) * calque.width, (vue.y / T.L) * calque.height,
      (vue.w / T.W) * calque.width, (vue.h / T.L) * calque.height,
      vue.x, vue.y, vue.w, vue.h);
  }
  // ombres de platanes le long du terrain : le soleil est bas, elles
  // s'étirent vers l'intérieur depuis les arbres plantés sur les côtés
  const texOmbre = textureOmbrePlatane();
  for (let y = 80; y < T.L; y += 430) {
    const gauche = (Math.floor(y / 430) % 2) === 0;
    ctx.save();
    ctx.translate(gauche ? 58 : T.W - 58, y);
    ctx.scale(gauche ? 1 : -1, 1);
    ctx.rotate(0.16);
    ctx.scale(1.08, 0.62);
    ctx.drawImage(texOmbre, -OMBRE_R, -OMBRE_R);
    ctx.restore();
  }
  // bordure et rond de lancer : tracés à la ficelle, pas à la peinture
  ctx.strokeStyle = "rgba(66,50,26,0.3)";
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, T.W - 8, T.L - 8);
  ctx.beginPath();
  ctx.arc(START.x + 1, START.y + 1, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(243,234,212,0.62)";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, T.W - 8, T.L - 8);
  ctx.beginPath();
  ctx.arc(START.x, START.y, 20, 0, Math.PI * 2);
  ctx.stroke();
  for (const b of list) {
    if (b.dead) continue;
    // ombre portée : elle s'élargit et pâlit quand la boule quitte le sol
    const lift = b.air > 0 ? 7 : (b._lob ? b._lob * 7 : 0);
    const eo = b.r * (2.5 + lift * 0.1);
    ctx.globalAlpha = lift ? 0.55 : 1;
    ctx.drawImage(spriteOmbreBoule(),
      b.x + 1.6 + lift * 0.35 - eo / 2, b.y + 3.2 + lift * 0.5 - eo * 0.33, eo, eo * 0.66);
    ctx.globalAlpha = 1;
    // corps
    const by = b.y - lift;
    dessinerBoule(ctx, b.x, by, b.r + (lift ? 1.5 : 0),
      b.kind === "coch" ? "coch" : TEAM_COLORS[b.team]);
    if (ivresse > 0) { // vision double : un fantôme décalé de chaque boule
      ctx.globalAlpha = Math.min(0.35, 0.1 + ivresse * 0.045);
      ctx.beginPath();
      ctx.fillStyle = b.kind === "coch" ? "#e8b45a" : TEAM_COLORS[b.team];
      ctx.arc(b.x + 3 + ivresse * 1.2, by - 1 - ivresse * 0.5, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // ombre portée des platanes sur le haut du terrain
  const ombre = ctx.createLinearGradient(0, SKY_H, 0, SKY_H + 26);
  ombre.addColorStop(0, "rgba(46,36,18,0.30)");
  ombre.addColorStop(1, "rgba(46,36,18,0)");
  ctx.fillStyle = ombre;
  ctx.fillRect(0, SKY_H, VIEW_W, 26);

  // lumière de fin d'après-midi sur l'ensemble de la scène
  ctx.drawImage(voileLumiere(), 0, 0);

  // Visée, en coordonnées écran : ancrée en bas au centre, là où le joueur
  // se tient. Sur le grand terrain le rond de départ peut être hors champ ;
  // la direction reste lisible ici et sur la mini-carte.
  if (aim) {
    const ax = VIEW_W / 2, ay = SKY_H + VIEW_H - 30;
    const rad = (aim.angle * Math.PI) / 180;
    if (aim.geste) {
      // au doigt : la flèche s'allonge avec la force
      const len = 46 + ((aim.power - 25) / 75) * 175;
      const ex = ax + Math.sin(rad) * len, ey = ay - Math.cos(rad) * len;
      const jaune = aim.valide ? "#f6c324" : "rgba(246,195,36,0.4)";
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(30,24,10,0.5)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = jaune; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
      const t = Math.atan2(ey - ay, ex - ax);
      ctx.fillStyle = jaune;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(t) * 8, ey + Math.sin(t) * 8);
      ctx.lineTo(ex + Math.cos(t + 2.5) * 9, ey + Math.sin(t + 2.5) * 9);
      ctx.lineTo(ex + Math.cos(t - 2.5) * 9, ey + Math.sin(t - 2.5) * 9);
      ctx.closePath(); ctx.fill();
      // jauge de force autour du point d'appui
      ctx.strokeStyle = "rgba(30,24,10,0.35)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(ax, ay, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = jaune; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ax, ay, 22, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (aim.power - 25)) / 75);
      ctx.stroke();
    } else {
      // aux curseurs : simple repère de direction, la distance se jauge à l'œil
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(60,50,30,0.55)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.sin(rad) * 70, ay - Math.cos(rad) * 70);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // textes posés sur la scène
  if (hud) {
    pilule(ctx, hud.banniere, SKY_H - 14, false);
    pilule(ctx, hud.notice || hud.indication, SKY_H + VIEW_H - 66, !!hud.notice);
  }

  // mini-carte du grand terrain
  if (T.camera && cam) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const mw = 40, mh = Math.round(mw * T.L / T.W);
    const mx = VIEW_W - mw - 6, my = SKY_H + 6, s = mw / T.W;
    // petite plaquette posée sur le terrain, cerclée de jaune pastis
    ctx.fillStyle = "rgba(38,30,14,0.5)";
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    ctx.fillStyle = "rgba(206,186,144,0.8)";
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = "rgba(246,195,36,0.45)"; ctx.lineWidth = 1;
    ctx.strokeRect(mx - 1.5, my - 1.5, mw + 3, mh + 3);
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
    ctx.strokeStyle = "rgba(255,250,232,0.9)";
    ctx.strokeRect(mx + (cam.x - VIEW_W / 2) * s, my + (cam.y - VIEW_H / 2) * s, VIEW_W * s, VIEW_H * s);
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

// ---------- Écran d'aide ------------------------------------------
// Les nouveaux arrivent par un lien, sans rien connaître : tout ce qu'il
// faut savoir tient sur une page, accessible de partout par le « ? ».

function PanneauAide({ fermer }) {
  const S = styles;
  const section = (titre, texte) => (
    <div key={titre}>
      <h3 style={S.aideTitre2}>{titre}</h3>
      <p style={S.aideTexte}>{texte}</p>
    </div>
  );
  return (
    <div style={S.aideFond} onClick={fermer}>
      <div style={S.aideCarte} onClick={e => e.stopPropagation()}>
        <h2 style={S.aideTitre}>La pétanque, en deux minutes</h2>
        {section("Le but",
          `Le premier à ${TARGET} points gagne. À chaque mène, l'équipe qui a la boule
           la plus proche du cochonnet marque un point par boule mieux placée que la
           meilleure boule adverse.`)}
        {section("Une mène",
          `Le premier joueur lance le cochonnet — assez loin, sinon il faut recommencer.
           Ensuite joue toujours l'équipe qui n'a pas le point. Quand il n'y a plus de
           boules, on compte.`)}
        {section("Pointer ou tirer",
          `Pointer : la boule roule et vient se coucher près du cochonnet. Tirer : elle
           vole jusqu'à son point de chute et frappe sec — c'est comme ça qu'on fait un
           carreau.`)}
        {section("Les réglages",
          `Direction et force sont remélangées avant chaque coup et les chiffres restent
           cachés : ça se juge à l'œil, comme au vrai jeu. Quinze secondes par lancer,
           après quoi la boule part toute seule.`)}
        {section("Boule morte",
          `Une boule qui franchit la ligne du fond est perdue. Sur les côtés, elle ne
           meurt que si elle sort entièrement.`)}
        {section("Les terrains",
          `Classique : tout le terrain tient à l'écran. Long 10 m : la caméra suit
           l'action et la mini-carte montre l'ensemble.`)}
        {section("Les bots 🤖",
          `L'hôte peut ajouter des joueurs artificiels — Fanny la débutante, le Pointeur,
           ou le Fada chirurgical — dans n'importe quelle équipe : on peut jouer seul. Un
           joueur qui laisse filer trois lancers peut être remplacé par un bot, et
           reprendre sa place dès qu'il revient.`)}
        {section("La tournée 🍹",
          `L'équipe qui gagne une mène offre une tournée de pastis à qui elle veut. Trois
           mènes d'affilée et les vainqueurs trinquent aussi. Chaque verre trouble un peu
           plus la vue et la main. L'équipe qui finit à zéro est Fanny.`)}
        {section("À plusieurs",
          `Jusqu'à 9 joueurs et 3 équipes. Tout le monde entre le même code de partie,
           chacun sur son appareil, et chaque lancer se rejoue en direct chez les autres.`)}
        <button style={S.btn} onClick={fermer}>Allez, on joue</button>
      </div>
    </div>
  );
}

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
  const [decorPret, setDecorPret] = useState(0); // photo de décor arrivée
  const [niveauBot, setNiveauBot] = useState("pointeur");
  const [aide, setAide] = useState(false);
  // Lancer au doigt par défaut ; les curseurs restent disponibles (bureau,
  // accessibilité) et le choix est retenu sur l'appareil.
  const [curseurs, setCurseurs] = useState(() => {
    try { return localStorage.getItem("petanque.curseurs") === "1"; } catch { return false; }
  });
  const [geste, setGeste] = useState(null); // { angle, power, valide } pendant le glissé
  const gesteRef = useRef(null);
  // Tapis figé à l'écran entre un lancer et la suite (voir « figer »)
  const [gel, setGel] = useState(null);
  const gelRef = useRef(null);
  gelRef.current = gel;
  const hudRef = useRef({}); // textes à dessiner sur le canvas (voir plus bas)
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const replayedRef = useRef(null); // id du dernier lancer déjà animé sur cet appareil
  const meIdRef = useRef(null);
  const seenTourneeRef = useRef(0);
  const autoLancerRef = useRef(""); // évite de déclencher deux fois le lancer du timer
  const botRef = useRef("");        // idem pour le coup d'un bot
  const tourneeBotRef = useRef("");   // ... et pour sa tournée
  const attenteTourneeRef = useRef(0); // depuis quand un bot attend une tournée
  gameRef.current = game;

  // Le chronomètre part du moment où CET appareil voit le tour commencer,
  // jamais de l'horloge de celui qui a enregistré l'état : deux téléphones
  // décalés de quelques secondes déclenchaient des lancers automatiques
  // avant l'heure. Mis à jour au rendu même, pour que tout ce qui suit
  // dans ce rendu lise déjà la bonne valeur.
  const revVuRef = useRef(null);
  const tourDepuisRef = useRef(Date.now());
  if (game && game.rev !== revVuRef.current) {
    revVuRef.current = game.rev;
    tourDepuisRef.current = Date.now();
  }

  const me = game?.players.find(p => p.id === meId) || null;
  // Qui mène la partie (salon, propositions, coups des bots) : le premier
  // joueur humain ; si la table n'a plus que des bots, l'appareil du
  // premier joueur qui s'est fait remplacer — sinon personne ne les ferait
  // jouer.
  const meneur = game
    ? (game.players.filter(p => !p.bot)[0] || game.players.filter(p => p.remplace)[0] || null)
    : null;
  const isHost = !!meneur && meneur.id === meId;
  const turnId = game && game.phase === "playing" ? nextToPlay(game) : null;
  const myTurn = turnId !== null && turnId === meId && !me?.bot;
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

  // Photo de décor optionnelle : cherchée une fois, elle remplace le dessin
  useEffect(() => { chargerPhotoDecor(() => setDecorPret(x => x + 1)); }, []);

  // Traces dans le sable : terrain neuf au début de la partie, ratissé
  // entre deux mènes (il en reste un souvenir).
  const meneTracesRef = useRef(-1);
  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.mene) { meneTracesRef.current = -1; return; }
    if (gel) return; // on ratisse quand le tapis final a été vu
    if (meneTracesRef.current === -1) reinitialiserTraces();
    else if (meneTracesRef.current !== game.mene.num) estomperTraces(0.3);
    meneTracesRef.current = game.mene.num;
  }, [game?.phase, game?.mene?.num, gel]);

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

  // Le drapeau doit suivre tout de suite : `refresh` le consulte dans la
  // foulée d'un setAnimating, avant tout nouveau rendu. Sans cela, le
  // rafraîchissement de fin de rejeu se croyait encore en animation et ne
  // faisait rien — le spectateur restait sur l'état d'avant le lancer
  // jusqu'au sondage suivant, puis tout sautait d'un coup.
  const poserAnimating = useCallback(v => { animatingRef.current = v; setAnimating(v); }, []);

  // Après un lancer, on garde à l'écran les boules telles que la simulation
  // les a laissées : jusqu'à l'arrivée du résultat officiel (au plus 8 s),
  // et au moins 3 s quand la mène vient de se terminer, pour que chacun
  // voie où ça s'est joué avant que le terrain ne soit ratissé.
  const verifierGel = useCallback(() => {
    const g = gelRef.current;
    if (!g) return;
    const now = Date.now();
    if (now >= g.max || (g.commit && now >= g.min)) { gelRef.current = null; setGel(null); }
  }, []);
  const figer = useCallback((bodies, rev, finMene, commitConnu) => {
    const now = Date.now();
    const g = { bodies, rev, finMene, commit: commitConnu,
                min: finMene ? now + 3200 : 0, max: now + (commitConnu ? 3200 : 8000) };
    gelRef.current = g; setGel(g);
    setTimeout(verifierGel, g.min - now + 20);
    setTimeout(verifierGel, g.max - now + 20);
  }, [verifierGel]);
  // Le résultat officiel tarde (flux temps réel muet, lanceur plus lent) :
  // on va le chercher à intervalles courts au lieu d'attendre le sondage.
  const rattraper = useCallback((rev) => {
    let n = 0;
    const essai = async () => {
      const g = gelRef.current;
      if (!g || g.rev !== rev || g.commit) return;
      if (refreshRef.current) await refreshRef.current();
      if (++n < 6) setTimeout(essai, 500 * n);
    };
    setTimeout(essai, 400);
  }, []);

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
    poserAnimating(true);
    const ctx = cv.getContext("2d");
    const marquer = !etiquette; // un « Revoir » ne recreuse pas le terrain
    let frames = 0;
    const finir = () => {
      if (marquer) fusionnerTraces();
      poserAnimating(false); setNotice("");
      if (marquer) {
        // Même physique, mêmes boules : le résultat se devine déjà. On le
        // garde à l'écran, et on va chercher la version officielle.
        const coch = bodies.find(b => b.kind === "coch");
        const prov = structuredClone(g);
        prov.mene.cochonnet = coch ? { x: coch.x, y: coch.y } : null;
        prov.mene.boules = bodies.filter(b => b.kind === "boule" && !b.dead)
          .map(b => ({ x: b.x, y: b.y, team: b.team, pid: b.pid }));
        const pid = g.replay.thrown.pid;
        if (g.replay.thrown.kind !== "coch" && pid) {
          prov.mene.left[pid] = Math.max(0, (prov.mene.left[pid] || 0) - 1);
        }
        figer(bodies, g.rev, nextToPlay(prov) === null, false);
        rattraper(g.rev);
      }
      refreshRef.current && refreshRef.current();
    };
    const loop = () => {
      try {
        const moving = stepPhysics(bodies, Tg);
        marquerTraces(bodies, Tg, marquer);
        drawField(ctx, g, bodies, null, ivresse, Tg, hudRef.current);
        frames++;
        if (moving && frames < 1200) requestAnimationFrame(loop);
        else finir();
      } catch (e) { finir(); }
    };
    // Le top départ vient de l'horloge du lanceur : on le borne, une horloge
    // décalée ne doit ni retarder le rejeu de dix secondes ni le faire
    // partir avant que l'annonce soit complète.
    const delai = etiquette ? 0 : Math.min(1500, Math.max(0, (g.replay.startAt || 0) - Date.now()));
    setTimeout(() => requestAnimationFrame(loop), delai);
  }, [poserAnimating, figer, rattraper]);

  // Intégrer un état reçu (par le flux temps réel ou par le sondage de secours)
  const integrer = useCallback((g) => {
    if (!g || animatingRef.current) return;
    if (gameRef.current && g.rev <= (gameRef.current.rev || 0)) return;
    setGame(g);
    const gelEnCours = gelRef.current;
    if (gelEnCours && g.rev > gelEnCours.rev) { gelEnCours.commit = true; verifierGel(); }
    if (g.replay && g.replay.id !== replayedRef.current) {
      replayedRef.current = g.replay.id;
      lancerAnimationReplay(g);
    }
  }, [lancerAnimationReplay, verifierGel]);

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

  const ecouleMs = game && game.phase === "playing" ? Date.now() - tourDepuisRef.current : 0;
  const resteTemps = Math.max(0, TEMPS_LANCER - Math.floor(ecouleMs / 1000));

  // Timer dépassé : le joueur lance au hasard tout seul ; si son appareil
  // est absent, un autre appareil exécute le lancer pour lui (4 s de grâce)
  useEffect(() => {
    if (!game || game.phase !== "playing" || animating || gel || !turnId) return;
    const marque = turnId + ":" + (game.rev || 0);
    if (autoLancerRef.current === marque) return;
    const amax = terrainDe(game).angleMax;
    const hasardA = Math.round((Math.random() - 0.5) * 1.9 * amax);
    const hasardP = 25 + Math.round(Math.random() * 75);
    const lui = game.players.find(p => p.id === turnId);
    if (lui?.bot) return; // un bot ne se fait pas doubler par le chronomètre
    if (myTurn && ecouleMs > TEMPS_LANCER * 1000) {
      autoLancerRef.current = marque;
      setNotice("Temps écoulé — la boule part toute seule !");
      throwBoule(meId, hasardA, hasardP, "point", true);
    } else if (!myTurn && ecouleMs > (TEMPS_LANCER + 4) * 1000) {
      autoLancerRef.current = marque;
      setNotice(`Temps écoulé pour ${lui?.name ?? "…"} — lancer automatique !`);
      throwBoule(turnId, hasardA, hasardP, "point", true);
    }
  });

  // --- les bots ---------------------------------------------------
  // Un bot n'a pas d'appareil : le premier joueur humain de la liste joue
  // pour lui. Un seul appareil s'en charge, les autres reçoivent le coup
  // par le chemin habituel et le rejouent.
  useEffect(() => {
    if (!game || game.phase !== "playing" || animating || gel || !turnId || !isHost) return;
    const lui = game.players.find(p => p.id === turnId);
    if (!lui || !lui.bot) return;
    // Une tournée en attente chez une équipe de bots se règle d'abord :
    // sinon le coup suivant, parti d'une copie plus ancienne, l'effacerait.
    // Mais on n'attend pas indéfiniment : une tournée ne bloque pas la partie.
    if (game.tourneePending && !game.players.some(p => p.team === game.tourneePending && !p.bot)) {
      if (!attenteTourneeRef.current) attenteTourneeRef.current = Date.now();
      if (Date.now() - attenteTourneeRef.current < 4000) return;
    } else {
      attenteTourneeRef.current = 0;
    }
    const marque = turnId + ":" + (game.rev || 0);
    if (botRef.current === marque) return;
    botRef.current = marque;
    setNotice(`${lui.name} étudie le terrain…`);
    setTimeout(() => {
      const g = gameRef.current;
      if (!g || g.phase !== "playing" || animatingRef.current || nextToPlay(g) !== turnId) {
        botRef.current = ""; // rien joué : on retentera au prochain battement d'horloge
        return;
      }
      const coup = coupDuBot(g, terrainDe(g), lui); // il essaie ses lancers dans sa tête
      throwBoule(turnId, coup.angle, coup.power, coup.mode);
    }, 1200);
  });

  // Une équipe qui n'a que des bots offre sa tournée toute seule, sinon
  // personne ne boirait jamais dans une partie en solo.
  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.tourneePending || !isHost) return;
    const t = game.tourneePending;
    if (game.players.some(p => p.team === t && !p.bot)) return; // un humain décide
    const marque = "t" + t + ":" + (game.mene?.num ?? 0);
    if (tourneeBotRef.current === marque) return;
    tourneeBotRef.current = marque;
    const autres = activeTeams(game).filter(x => x !== t);
    setTimeout(() => {
      if (!autres.length || gameRef.current?.tourneePending !== t) { tourneeBotRef.current = ""; return; }
      offrirTournee(autres[Math.floor(Math.random() * autres.length)], t);
    }, 700);
  });

  // --- dessin -----------------------------------------------------
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !game || game.phase === "lobby" || animating) return;
    const visee = geste ? { ...geste, geste: true }
      : (myTurn && !gel && curseurs ? { angle } : null);
    drawField(cv.getContext("2d"), game, gel ? gel.bodies : null, visee, ivresseNiveau, T, hudRef.current);
  }, [game, angle, myTurn, animating, screen, ivresseNiveau, T, decorPret, gel, geste, curseurs, notice]);

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
      if (existing.bot && existing.remplace) { // il était remplacé : il reprend sa place
        delete existing.bot; delete existing.niveau; delete existing.remplace;
        if (g.absents) g.absents[existing.id] = 0;
        await saveGame(c, g);
      }
    } else {
      const p = ajouterJoueur(g, n);
      if (!p) {
        setNotice("Toutes les places sont prises — tu peux regarder la partie.");
        setMeId(null);
      } else {
        setMeId(p.id);
        if (g.phase !== "lobby") {
          setNotice(`Tu entres chez ${TEAM_NAMES[p.team]} — tes boules arrivent à la mène suivante.`);
        }
        if (!(await saveGame(c, g))) { setNotice("Impossible d'enregistrer, réessaie."); setBusy(false); return; }
      }
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

  const ajouterBot = t => mutate(g => {
    if (g.players.length >= 9 || g.players.filter(p => p.team === t).length >= 3) return;
    const pris = new Set(g.players.map(p => p.name));
    const prenom = PRENOMS_BOT.find(n => !pris.has(n)) || "Bot " + (g.players.length + 1);
    g.players.push({
      id: "b" + Date.now() + Math.floor(Math.random() * 1000),
      name: prenom, team: t, bot: true, niveau: niveauBot,
    });
  });

  const retirerBot = id => mutate(g => { g.players = g.players.filter(p => p.id !== id); });

  // Un spectateur peut entrer dans la partie dès qu'une place est libre
  const entrerEnJeu = () => mutate(g => {
    const p = ajouterJoueur(g, name.trim() || "Invité");
    if (!p) { setNotice("Toutes les équipes sont au complet."); return; }
    setMeId(p.id);
    setNotice(`Tu entres chez ${TEAM_NAMES[p.team]} — tes boules arrivent à la mène suivante.`);
  });

  // Un joueur parti sans prévenir : un bot prend sa place sans arrêter la
  // partie. Il garde son nom, ses boules et sa place dans l'ordre.
  const remplacerParBot = id => mutate(g => {
    const p = g.players.find(x => x.id === id);
    if (!p || p.bot) return;
    p.bot = true; p.niveau = niveauBot; p.remplace = true;
    g.absents = g.absents || {}; g.absents[id] = 0;
  });

  const laisserJoueur = id => mutate(g => { g.absents = g.absents || {}; g.absents[id] = 0; });

  // ... et s'il revient, il récupère ses boules
  const reprendreMain = () => mutate(g => {
    const p = g.players.find(x => x.id === meId);
    if (!p) return;
    delete p.bot; delete p.niveau; delete p.remplace;
    g.absents = g.absents || {}; g.absents[meId] = 0;
    setNotice("");
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
  const offrirTournee = (cible, deLaPart) => mutate(g => {
    const from = deLaPart || me?.team;
    if (!from || g.tourneePending !== from) return; // déjà réglée par un coéquipier
    g.tourneePending = null;
    if (cible) {
      g.drinks = g.drinks || { A: 0, B: 0, C: 0 };
      g.drinks[cible] = (g.drinks[cible] || 0) + 1;
      g.lastTournee = { from, to: cible, id: Date.now() };
    }
  });

  // --- lancer -----------------------------------------------------
  // pid : le joueur qui lance (soi-même, ou le retardataire du timer)
  async function throwBoule(pid = meId, angleV = angle, powerV = power, modeV = mode, auto = false) {
    if (animating) return;
    if (pid === meId && !myTurn) return;
    poserAnimating(true);
    // Revérifier avec la dernière version : quelqu'un a pu jouer entre-temps
    const latest = (await loadGame(code)) || game;
    if (latest.phase !== "playing" || nextToPlay(latest) !== pid) {
      setGame(latest);
      poserAnimating(false);
      setNotice("Le jeu a évolué entre-temps — vérifie que c'est bien ton tour.");
      return;
    }
    const lanceur = latest.players.find(p => p.id === pid);
    if (!lanceur) { poserAnimating(false); return; }
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
    // Le canvas peut manquer (écran d'accueil, partie terminée) : le lancer
    // doit aboutir quand même, sinon la partie reste figée sur ce coup.
    const ctx = canvasRef.current ? canvasRef.current.getContext("2d") : null;
    let frames = 0;
    const loop = () => {
      try {
        const moving = stepPhysics(bodies, Ts);
        marquerTraces(bodies, Ts);
        if (ctx) drawField(ctx, st, bodies, null, ivresse, Ts, hudRef.current);
        frames++;
        if (moving && frames < 1200) { requestAnimationFrame(loop); }
        else { fusionnerTraces(); commit(st, bodies, thrown, replayMeta, pid, auto); }
      } catch (e) {
        poserAnimating(false); // jamais bloquer la partie sur un souci d'affichage
        setNotice("Souci d'affichage pendant le lancer — le jeu se resynchronise.");
      }
    };
    setTimeout(() => { setNotice(""); requestAnimationFrame(loop); }, Math.max(0, replayMeta.startAt - Date.now()));
  }

  async function commit(st, bodies, thrown, replayMeta, pid, auto) {
    const Ts = terrainDe(st);
    const DEP = departDe(Ts);
    const wasCochThrow = !st.mene.cochonnet;
    const coch = bodies.find(b => b.kind === "coch");
    if (wasCochThrow && Math.hypot(coch.x - DEP.x, coch.y - DEP.y) < Ts.cochMin) {
      poserAnimating(false);
      randomizeAim();
      botRef.current = ""; // un bot doit pouvoir le relancer
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
    // Un joueur qui laisse filer le chronomètre plusieurs fois de suite
    // finit par se voir proposer un remplaçant.
    st.absents = st.absents || {};
    const quiLance = st.players.find(p => p.id === pid);
    if (quiLance && !quiLance.bot) st.absents[pid] = auto ? (st.absents[pid] || 0) + 1 : 0;
    let finMene = false;
    if (nextToPlay(st) === null) {
      finMene = true;
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
    if (finMene) figer(bodies, st.rev, true, true); // on laisse voir le tapis final
    setGame(st);
    poserAnimating(false);
    randomizeAim();
    if (!(await saveGame(code, st))) setNotice("Échec de synchronisation — le jeu réessaiera.");
  }

  // Retour à l'accueil sans recharger : on coupe tout ce qui tourne (le
  // flux temps réel se ferme tout seul au changement d'écran) et on garde
  // prénom et code pré-remplis pour revenir en un geste.
  const quitter = () => {
    poserAnimating(false);
    gelRef.current = null; setGel(null);
    replayedRef.current = null; meneTracesRef.current = -1;
    setNotice(""); setGame(null); setMeId(null);
    setScreen("entry");
  };

  // --- lancer au doigt ---------------------------------------------
  // Fronde : on touche le terrain, on tire vers l'arrière, on relâche.
  // L'angle du glissé donne la direction, sa longueur la force. Le geste
  // ne produit qu'un couple (angle, force) remis à throwBoule : la chaîne
  // déterministe qui suit est la même qu'avec les curseurs.
  const peutLancer = myTurn && !animating && !gel;

  const basculerCurseurs = v => {
    setCurseurs(v);
    try { localStorage.setItem("petanque.curseurs", v ? "1" : "0"); } catch {}
  };

  const posCanvas = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = VIEW_W / r.width; // le canvas est mis à l'échelle par le CSS
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };

  const surPointerDown = e => {
    if (!peutLancer || curseurs) return;
    const p = posCanvas(e);
    gesteRef.current = { x0: p.x, y0: p.y, dernier: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setGeste({ angle: 0, power: 25, valide: false });
    e.preventDefault();
  };

  const surPointerMove = e => {
    const g0 = gesteRef.current;
    if (!g0) return;
    const p = posCanvas(e);
    const dx = p.x - g0.x0, dy = p.y - g0.y0;
    const len = Math.hypot(dx, dy);
    const A = T.angleMax;
    // un glissé à 40° de la verticale donne l'angle maximal du terrain :
    // la même amplitude de geste sert les deux terrains
    const brut = (Math.atan2(-dx, dy) * 180) / Math.PI;
    const angle = Math.round(Math.max(-A, Math.min(A, brut * (A / 40))));
    const power = Math.round(Math.max(25, Math.min(100, 25 + ((len - 24) / 190) * 75)));
    const g = { angle, power, valide: dy > 24 && len > 24 };
    g0.dernier = g;
    setGeste(g);
  };

  const surPointerUp = () => {
    const g0 = gesteRef.current;
    if (!g0) return;
    gesteRef.current = null;
    setGeste(null);
    const g = g0.dernier;
    if (g && g.valide) throwBoule(meId, g.angle, g.power, mode);
  };

  const surPointerCancel = () => { gesteRef.current = null; setGeste(null); };

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

  // Les outils : sons et aide partout ; en partie s'y ajoutent ↺ (revoir le
  // dernier coup, quand il y en a un et que rien ne bouge) et ⌂.
  const outils = (enPartie) => (
    <div style={{ display: "flex", gap: 4 }}>
      {enPartie && game?.replay && !animating && !gel && (
        <button style={S.sndBtn} title="Revoir le dernier coup"
                onClick={() => lancerAnimationReplay(game, "Replay du dernier coup…")}>↺</button>
      )}
      <button style={S.sndBtn} onClick={basculerCigales} title="Cigales">{cigales ? "🦗" : "🔇"}</button>
      <button style={ambiance ? S.sndBtn : { ...S.sndBtn, opacity: 0.45 }} onClick={basculerAmbiance} title="Musique d'ambiance">🎵</button>
      <button style={S.sndBtn} onClick={() => setAide(true)} title="Règles du jeu">?</button>
      {enPartie && <button style={S.sndBtn} onClick={quitter} title="Retour à l'accueil">⌂</button>}
    </div>
  );
  const boutonsSon = (
    <>
      {outils(false)}
      {aide && <PanneauAide fermer={() => setAide(false)} />}
    </>
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
              <div style={S.teamActions}>
                {me && me.team !== t && game.players.filter(p => p.team === t).length < 3 && (
                  <button style={S.miniBtn} onClick={() => pickTeam(t)}>Me placer ici</button>
                )}
                {isHost && game.players.length < 9 && game.players.filter(p => p.team === t).length < 3 && (
                  <button style={S.miniBtn} onClick={() => ajouterBot(t)}>+ 🤖</button>
                )}
              </div>
            </div>
            <div style={S.names}>
              {game.players.filter(p => p.team === t).map(p => (
                <span key={p.id} style={S.nameTag}>
                  {p.bot ? "🤖 " : ""}{p.name}{p.id === meId ? " (toi)" : ""}
                  {p.bot && <span style={S.nivTag}>{NIVEAUX_BOT[p.niveau]?.nom ?? ""}</span>}
                  {p.bot && isHost && (
                    <button style={S.retirerBtn} onClick={() => retirerBot(p.id)} title="Retirer">×</button>
                  )}
                </span>
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
            <label style={S.label}>Niveau des bots ajoutés</label>
            <div style={{ display: "flex", gap: 8 }}>
              {ORDRE_BOTS.map(k => (
                <button key={k} style={niveauBot === k ? S.btnSmallOn : S.btnSmall}
                        onClick={() => setNiveauBot(k)}>{NIVEAUX_BOT[k].nom}</button>
              ))}
            </div>
            <p style={S.hint}>{NIVEAUX_BOT[niveauBot].nom} : {NIVEAUX_BOT[niveauBot].sous}. Un bot joue tout seul, tu peux remplir les équipes et jouer en solo.</p>
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
            Terrain : {terrainDe(game).nom}. En attente que l'hôte ({meneur?.name}) lance la partie…
          </p>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={S.btnGhost} onClick={quitter}>⌂ Accueil</button>
          {boutonsSon}
        </div>
        {notice && <p style={S.notice}>{notice}</p>}
      </div>
    );
  }

  const turnPlayer = game.players.find(p => p.id === turnId);
  // Proposé à l'hôte seulement, et jamais pour le joueur en train de jouer
  const absentAProposer = isHost && game.phase === "playing"
    ? game.players.find(p => !p.bot && (game.absents?.[p.id] || 0) >= 3) : null;
  const pointLive = game.phase === "playing" && game.mene && game.mene.cochonnet && game.mene.boules.length
    ? scoreMene(game) : null;

  // Le fronton du boulodrome : une colonne par équipe (score en chiffres
  // lumineux, boules restantes, tournées, qui tient le point), et dessous
  // la ligne de jeu — mène, joueur au tour, chronomètre — avec les outils.
  const nomCourt = t => TEAM_NAMES[t].replace("Équipe ", "").toUpperCase();
  const ligneTour = game.phase !== "playing" ? "Partie terminée"
    : gel && !gel.commit ? "résultat du lancer…"
    : myTurn ? "À toi !"
    : `${turnPlayer?.bot ? "🤖 " : ""}${turnPlayer?.name ?? "…"}`;
  // Ce qui s'écrit sur le canvas plutôt qu'en rangées d'écran
  const lr = game.lastResult;
  hudRef.current = {
    banniere: lr && game.phase !== "finished"
      ? `${CRIS[lr.mene % CRIS.length]} Mène ${lr.mene} : ${TEAM_NAMES[lr.team]} marque ${lr.pts} point${lr.pts > 1 ? "s" : ""}.`
      : null,
    notice: notice || null,
    indication: !peutLancer || curseurs ? null
      : geste ? (geste.valide ? "Relâche pour lancer" : "Tire vers l'arrière…")
      : cochToThrow ? "Tu ouvres la mène : touche le terrain et tire vers l'arrière"
      : `👆 Touche le terrain et tire vers l'arrière${mode === "tir" ? " — la longueur donne la distance du tir" : ""}`,
  };
  const tableauAffichage = (
    <div style={S.tableau}>
      <div style={S.tableauCols}>
        {activeTeams(game).map(t => {
          const auTour = game.phase === "playing" && turnPlayer?.team === t;
          const tient = pointLive && pointLive.team === t;
          return (
            <div key={t} style={{ ...S.tableauCol, borderTopColor: TEAM_COLORS[t],
                                  background: auTour ? "rgba(255,255,255,0.07)" : "transparent" }}>
              <div style={S.tableauNom}>
                <span style={{ ...S.dot, width: 8, height: 8, background: TEAM_COLORS[t] }} />{nomCourt(t)}
              </div>
              <div style={S.tableauScore}>{String(game.scores[t] || 0).padStart(2, "0")}</div>
              <div style={S.tableauInfo}>
                {game.mene && <span>●{restantes(t)}</span>}
                {(game.drinks?.[t] || 0) > 0 && <span>🍹{game.drinks[t]}</span>}
                {tient && <span style={S.tableauPoint}>+{pointLive.pts}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={S.tableauBas}>
        {game.mene && <span style={S.tableauMene}>M{game.mene.num}</span>}
        <span style={S.tableauTour}>{ligneTour}</span>
        {game.phase === "playing" && !animating && !gel && (
          <span style={{ ...S.tableauChrono, color: resteTemps <= 5 ? "#ff7a5c" : "#ffd23f" }}>{resteTemps}</span>
        )}
        {outils(true)}
      </div>
    </div>
  );

  return (
    <div style={S.pageGame}>
      <style>{CSS_IVRESSE}</style>
      {aide && <PanneauAide fermer={() => setAide(false)} />}
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
      {tableauAffichage}
      {game.tourneePending && me && game.tourneePending === me.team && game.phase === "playing" && (
        <div style={S.tourneeBar}>
          <span style={S.tourneeQ}>Mène gagnée ! La tournée est pour…</span>
          {activeTeams(game).filter(t => t !== me.team).map(t => (
            <button key={t} style={{ ...S.tourneeBtn, borderColor: TEAM_COLORS[t] }} onClick={() => offrirTournee(t)}>{TEAM_NAMES[t]}</button>
          ))}
          <button style={S.tourneeBtn} onClick={() => offrirTournee(null)}>Passer</button>
        </div>
      )}
      {!me && game.phase !== "finished" && (
        <div style={S.tourneeBar}>
          <span style={S.tourneeQ}>👀 Tu regardes la partie.</span>
          {placeLibre(game) && (
            <button style={S.tourneeBtn} onClick={entrerEnJeu}>Entrer dans la partie</button>
          )}
        </div>
      )}
      {absentAProposer && (
        <div style={S.tourneeBar}>
          <span style={S.tourneeQ}>
            {absentAProposer.id === meId
              ? "Tu as laissé filer 3 lancers — un bot peut prendre la suite."
              : `${absentAProposer.name} a laissé filer 3 lancers.`}
          </span>
          <button style={S.tourneeBtn} onClick={() => remplacerParBot(absentAProposer.id)}>
            {absentAProposer.id === meId ? "Qu'un bot joue pour moi" : "Le remplacer par un bot"}
          </button>
          <button style={S.tourneeBtn} onClick={() => laisserJoueur(absentAProposer.id)}>
            {absentAProposer.id === meId ? "Non, je joue" : "L'attendre"}
          </button>
        </div>
      )}
      {me?.bot && me.remplace && (
        <div style={S.tourneeBar}>
          <span style={S.tourneeQ}>🤖 Un bot joue tes boules pendant ton absence.</span>
          <button style={S.tourneeBtn} onClick={reprendreMain}>Je suis là, je reprends</button>
        </div>
      )}
      {game.phase === "finished" ? (
        <div style={S.card}>
          <h1 style={S.h1}>{TEAM_NAMES[game.winner]} gagne !</h1>
          <p style={S.sub}>Score final : {activeTeams(game).map(t => `${TEAM_NAMES[t]} ${game.scores[t]}`).join(" — ")}</p>
          {activeTeams(game).filter(t => t !== game.winner && game.scores[t] === 0).map(t => (
            <p key={t} style={S.sub}>{TEAM_NAMES[t]} est Fanny ! La tournée de pastis est pour eux.</p>
          ))}
          {isHost && <button style={S.btn} onClick={resetGame}>Nouvelle partie</button>}
        </div>
      ) : (
        <>
          <div style={{
            ...S.canvasWrap,
            ...(ivresseNiveau ? {
              animation: `tanguer ${Math.max(2.2, 5.5 - ivresseNiveau * 0.6)}s ease-in-out infinite`,
              filter: `blur(${Math.min(2.2, ivresseNiveau * 0.35)}px) sepia(${Math.min(0.5, ivresseNiveau * 0.08)}) saturate(${1 + ivresseNiveau * 0.06})`,
            } : {}),
          }}>
            <canvas ref={canvasRef} width={VIEW_W} height={CANVAS_H} style={S.canvas}
              onPointerDown={surPointerDown} onPointerMove={surPointerMove}
              onPointerUp={surPointerUp} onPointerCancel={surPointerCancel} />
          </div>
          {myTurn && !animating && !gel && (curseurs || !cochToThrow) && (
            <div style={S.card}>
              {!cochToThrow && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button style={mode === "point" ? S.btnSmallOn : S.btnSmall} onClick={() => setMode("point")}>Pointer</button>
                  <button style={mode === "tir" ? S.btnSmallOn : S.btnSmall} onClick={() => setMode("tir")}>Tirer</button>
                  {!curseurs && (
                    <button style={S.btnGhost} onClick={() => basculerCurseurs(true)} title="Préférer les curseurs">⚙</button>
                  )}
                </div>
              )}
              {curseurs && (
                <>
                  {cochToThrow && <label style={S.label}>Tu ouvres la mène : lance d'abord le cochonnet.</label>}
                  <label style={S.label}>Direction</label>
                  <input type="range" min={-T.angleMax} max={T.angleMax} value={angle} onChange={e => setAngle(+e.target.value)} style={S.range} />
                  <label style={S.label}>{!cochToThrow && mode === "tir" ? "Distance de tir" : "Force"}</label>
                  <input type="range" min={25} max={100} value={power} onChange={e => setPower(+e.target.value)} style={S.range} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={() => throwBoule()}>
                      {cochToThrow ? "Lancer le cochonnet" : mode === "tir" ? "Tirer !" : "Lancer la boule"}
                    </button>
                    <button style={S.btnGhost} onClick={() => basculerCurseurs(false)} title="Lancer au doigt">👆</button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
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
  // Écran de jeu : jamais de défilement, le terrain prend toute la place
  // que les bandeaux lui laissent
  pageGame: {
    height: "100dvh", overflow: "hidden", background: "linear-gradient(180deg, #27607e 0%, #333d24 45%, #232919 100%)", color: "#f2eddd",
    fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "6px 8px", boxSizing: "border-box", gap: 6,
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
    background: "#333b28", borderRadius: 10, padding: 10, width: "100%",
    maxWidth: 380, display: "flex", flexDirection: "column", gap: 6, boxSizing: "border-box",
  },
  label: { fontSize: 13, opacity: 0.8 },
  input: {
    padding: "10px 12px", borderRadius: 8, border: "1px solid #4a5438",
    background: "#242a1a", color: "#f2eddd", fontSize: 16, outline: "none",
  },
  // Toutes les zones tactiles font au moins 44 px de haut
  btn: {
    marginTop: 4, padding: "10px 16px", minHeight: 44, borderRadius: 8, border: "none",
    background: "#f6c324", color: "#26200c", fontSize: 16, fontWeight: 600, cursor: "pointer",
  },
  btnGhost: {
    padding: "10px 16px", minHeight: 44, borderRadius: 8, border: "1px solid #4a5438",
    background: "transparent", color: "#f2eddd", fontSize: 14, cursor: "pointer",
  },
  btnSmall: {
    padding: "8px 18px", minHeight: 44, flex: 1, borderRadius: 8, border: "1px solid #4a5438",
    background: "transparent", color: "#f2eddd", fontSize: 15, cursor: "pointer",
  },
  btnSmallOn: {
    padding: "8px 18px", minHeight: 44, flex: 1, borderRadius: 8, border: "1px solid #f6c324",
    background: "#f6c324", color: "#26200c", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  miniBtn: {
    padding: "6px 12px", minHeight: 40, borderRadius: 6, border: "1px solid #4a5438",
    background: "transparent", color: "#f2eddd", fontSize: 12, cursor: "pointer",
  },
  sndBtn: {
    width: 40, height: 44, borderRadius: 8, border: "1px solid #4a5438", padding: 0,
    background: "#333b28", color: "#f2eddd", fontSize: 16, cursor: "pointer", flexShrink: 0,
  },
  hint: { fontSize: 12, opacity: 0.65, lineHeight: 1.45, margin: 0 },
  notice: { fontSize: 12, color: "#f0b23e", maxWidth: 380, textAlign: "center", margin: 0 },
  canvas: {
    borderRadius: 10, boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
    maxWidth: "100%", maxHeight: "100%", touchAction: "none",
    userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
  },
  scoreRow: { display: "flex", gap: 8, width: "100%", maxWidth: 360 },
  tableau: {
    width: "100%", maxWidth: 380, boxSizing: "border-box",
    background: "linear-gradient(180deg, #1c2114 0%, #141810 100%)",
    border: "1px solid #3d462e", borderRadius: 10, padding: "6px 8px 5px",
    boxShadow: "inset 0 0 22px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)",
  },
  tableauCols: { display: "flex", gap: 6, alignItems: "stretch" },
  tableauCol: {
    flex: 1, minWidth: 0, borderTop: "3px solid", borderRadius: 4,
    padding: "3px 4px 2px", textAlign: "center",
  },
  tableauNom: {
    fontSize: 10, letterSpacing: 1.2, opacity: 0.8, whiteSpace: "nowrap",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
  },
  tableauScore: {
    fontFamily: "'Courier New', Menlo, Consolas, monospace", fontSize: 28, fontWeight: 700,
    lineHeight: 1.05, letterSpacing: 2, color: "#ffd23f",
    textShadow: "0 0 10px rgba(255,210,63,0.75), 0 0 2px rgba(255,210,63,0.9)",
  },
  tableauInfo: {
    fontSize: 11, minHeight: 15, display: "flex", justifyContent: "center", gap: 6,
    color: "#f2eddd", opacity: 0.92, whiteSpace: "nowrap",
  },
  tableauPoint: {
    background: "#f6c324", color: "#26200c", borderRadius: 4, padding: "0 4px", fontWeight: 700,
  },
  tableauBas: {
    display: "flex", alignItems: "center", gap: 8, marginTop: 5, paddingTop: 5,
    borderTop: "1px solid #2f3724", fontSize: 13, minHeight: 36,
  },
  tableauMene: { opacity: 0.55, fontSize: 11, fontWeight: 700, letterSpacing: 1 },
  tableauTour: { flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tableauChrono: {
    fontFamily: "'Courier New', Menlo, Consolas, monospace", fontSize: 20, fontWeight: 700,
    minWidth: 30, textAlign: "right", textShadow: "0 0 8px rgba(255,210,63,0.6)",
  },
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
    display: "inline-flex", alignItems: "center", gap: 6,
  },
  nivTag: { fontSize: 10, opacity: 0.6 },
  retirerBtn: {
    border: "none", background: "transparent", color: "#f0b23e",
    fontSize: 18, lineHeight: 1, padding: "0 6px", minWidth: 36, minHeight: 36, cursor: "pointer",
  },
  teamActions: { marginLeft: "auto", display: "flex", gap: 6 },
  turn: { fontSize: 14, fontWeight: 600, margin: 0, textAlign: "center" },
  pointLive: { fontSize: 12, opacity: 0.85, margin: 0, textAlign: "center" },
  banner: {
    fontSize: 12, background: "#3d462e", borderRadius: 8, padding: "5px 10px",
    maxWidth: 380, margin: 0, textAlign: "center",
  },
  tourneeBar: {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
    background: "#3d462e", borderRadius: 8, padding: "6px 8px",
    width: "100%", maxWidth: 380, boxSizing: "border-box",
  },
  tourneeQ: { fontSize: 12, fontWeight: 600 },
  tourneeBtn: {
    padding: "6px 12px", minHeight: 44, borderRadius: 6, border: "1px solid #4a5438",
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
  range: { width: "100%", height: 36 },

  aideFond: {
    position: "fixed", inset: 0, zIndex: 60, background: "rgba(22, 27, 14, 0.88)",
    overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "16px 12px", boxSizing: "border-box",
  },
  aideCarte: {
    background: "#333b28", borderRadius: 12, padding: 16, width: "100%", maxWidth: 400,
    display: "flex", flexDirection: "column", gap: 10, boxSizing: "border-box",
    border: "1px solid #4a5438",
  },
  aideTitre: {
    fontFamily: "Georgia, serif", fontSize: 21, margin: 0, color: "#f6c324", textAlign: "center",
  },
  aideTitre2: { fontSize: 14, margin: "0 0 2px", color: "#8fd4f0" },
  aideTexte: { fontSize: 13, lineHeight: 1.5, margin: 0, opacity: 0.9 },
};
