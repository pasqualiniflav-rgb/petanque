import React, { useState, useEffect, useRef, useCallback } from "react";

// ------------------------------------------------------------------
// Pétanque en ligne — jusqu'à 9 joueurs (3 équipes), temps réel.
// Deux terrains au choix de l'hôte : Classique (vue entière) et
// Long 10 m (caméra qui suit l'action + mini-carte).
// ------------------------------------------------------------------

// Bandes hors-jeu visibles autour du terrain (côtés, fond, arrière) : le
// sable couvre toute la fenêtre, les lignes ne bougent pas, et les boules
// sorties viennent s'y arrêter.
const HORS_G = 28, HORS_H = 28, HORS_B = 8;
// La largeur de la fenêtre s'adapte au ratio de l'appareil (voir
// reglerLargeurVue) : le sable couvre tout, pas un pixel de fond de page
// sur les côtés. Les coordonnées physiques, elles, ne bougent jamais.
let VIEW_W = 340 + 2 * HORS_G;              // fenêtre de jeu : le terrain classique et ses bandes, au minimum
const VIEW_H = 520 + HORS_H + HORS_B;
const SKY_H = 84;                  // bande de décor au-dessus du terrain
const CANVAS_H = VIEW_H + SKY_H;   // hauteur réelle du canvas
const decorLargeur = () => VIEW_W + 120; // décor plus large : parallaxe sur le grand terrain
export function reglerLargeurVue(w) {
  const v = Math.max(340 + 2 * HORS_G, Math.min(640, Math.ceil(w))); // vers le haut : pas un pixel de côté
  if (v === VIEW_W) return false;
  VIEW_W = v;
  decorCache = null; voileCache = null; // pré-rendus à la largeur de la fenêtre
  return true;
}
const R_BOULE = 11, R_COCH = 6;
const TEAMS = ["A", "B", "C"];
const TEAM_COLORS = { A: "#2ba3d4", B: "#bd4f3a", C: "#c9a02e" };
const TEAM_NAMES = { A: "Équipe ciel", B: "Équipe rouge", C: "Équipe ocre" };
const CRIS = ["Oh peuchère !", "Tè, vé !", "Oh fan de chichourle !", "Boudiou !", "Adieu vat !"];
const TARGET = 13;
const POLL_MS = 4000; // simple roue de secours : le flux temps réel fait le travail
const TEMPS_LANCER = 20; // secondes par lancer
const TEMPS_TOURNEE = 20; // secondes pour choisir à qui offrir la tournée

// Chaque terrain porte sa géométrie et sa calibration physique.
export const TERRAINS = {
  // Vitesses accélérées pour des sensations de vraie pétanque, portées
  // conservées. Le frottement s'applique dès la frame d'atterrissage, la
  // distance roulée vaut donc v·mu/(1−mu) : quand v est multipliée par k,
  // mu/(1−mu) est divisé par k. Facteur 2,2 ici (le roulé du classique
  // s'éteint lentement, il fallait ça pour qu'un pointé dure ~2 s), 1,7
  // sur le grand terrain.
  classique: {
    nom: "Classique", W: 340, L: 520,
    camera: false, subSteps: 2, stopSeuil: 0.2,
    muRoll: 0.9687, angleMax: 25,
    vPoint: p => (2.9 + (p / 100) * 4.6) * 2.2,
    // Tolérance du carreau : après l'atterrissage la boule tirée ne roule
    // plus que ~35 px — sans jauge de force, la cible se touchait sur
    // 60 px de geste, c'était trop facile. Aucun aléa.
    vTir: 18.7, muTir: 0.59,
    airTir: p => Math.max(60, 140 + (p / 100) * 360 - 26),
    // Dérapage après un choc : la boule frappée part sec et meurt vite,
    // la frappante meurt quasi sur place
    cochMin: 170, skidSeuil: 8.8, skidMu: 0.8,
    volPoint: 0.5,  // part de la portée qu'un pointé fait en l'air avant de rouler
    // Cochonnet : plus léger, il part en cloche plus courte et va un peu
    // plus loin que la boule à force égale — la différence est assumée
    volCoch: 0.4, cochVif: 1.1,
  },
  long: {
    nom: "Long 10 m", W: 640, L: 2750,
    camera: true, subSteps: 12, stopSeuil: 0.34,
    muRoll: 0.9582, angleMax: 8,
    vPoint: p => (12 + (p / 100) * 58) * 1.7,
    vTir: 37.4, muTir: 0.7765,
    airTir: p => Math.max(150, 300 + (p / 100) * 2300 - 60),
    cochMin: 1400, skidSeuil: 20.4, skidMu: 0.78,
    volPoint: 0.5,
    volCoch: 0.4, cochVif: 1.1,
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
export function nextToPlay(st) {
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
    const bs = m.boules.filter(b => b.team === t && !b.dead);
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
export function scoreMene(st) {
  const m = st.mene;
  const teams = activeTeams(st);
  const bestOf = t => {
    const bs = m.boules.filter(b => b.team === t && !b.dead); // les mortes ne comptent pas
    return bs.length ? Math.min(...bs.map(b => dist(b, m.cochonnet))) : Infinity;
  };
  const ranked = teams.map(t => ({ t, d: bestOf(t) })).sort((a, b) => a.d - b.d);
  if (!isFinite(ranked[0].d)) return null;
  const winner = ranked[0].t;
  const rival = ranked.length > 1 ? ranked[1].d : Infinity;
  const pts = m.boules.filter(b => b.team === winner && !b.dead && dist(b, m.cochonnet) < rival).length;
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

// Le corps qui part du rond, tel que le jeu ET le bot le construisent.
// Pointé : la boule vole une part (volPoint) de sa portée puis retombe et
// roule ; la portée totale reste celle du simple roulé de vPoint(p) qu'on
// avait avant — vitesse de retombée (1 − volPoint)·v, portée en vol
// volPoint·v/(1 − muRoll) — pour ne pas dérégler les terrains. En vol elle
// ne touche rien : on peut passer par-dessus une boule. Tir : elle vole
// jusqu'au point de chute et frappe sec. Cochonnet : même modèle, avec
// sa propre part en vol et sa vivacité.
export function corpsLance(T, genre, puissance, rad, sup) {
  const DEP = departDe(T);
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  if (genre === "tir") {
    return { x: DEP.x, y: DEP.y, r: R_BOULE, mass: 1, kind: "boule", tir: true,
             mu: T.muTir, air: T.airTir(puissance), vx: dx * T.vTir, vy: dy * T.vTir, ...sup };
  }
  const coch = genre === "coch";
  const v0 = T.vPoint(puissance) * (coch ? T.cochVif : 1);
  const vol = coch ? T.volCoch : T.volPoint;
  const portee = v0 / (1 - T.muRoll);
  const v = (1 - vol) * v0;
  return { x: DEP.x, y: DEP.y, r: coch ? R_COCH : R_BOULE, mass: coch ? 0.35 : 1,
           kind: coch ? "coch" : "boule", air: vol * portee, vx: dx * v, vy: dy * v, ...sup };
}

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
      } else {
        // Ligne de fond franchie = boule morte ; côtés : morte seulement si
        // entièrement sortie. Elle garde sa vitesse et roule encore, sans
        // plus toucher personne, jusqu'à buter sur la planche hors-jeu.
        if (!b.dead && (b.y < b.r + 4 || b.x < -b.r || b.x > T.W + b.r || b.y > T.L + b.r)) b.dead = true;
        if (b.dead) {
          const xmin = -HORS_G + b.r, xmax = T.W + HORS_G - b.r;
          const ymin = -HORS_H + b.r, ymax = T.L + HORS_B - b.r;
          if (b.x < xmin) { b.x = xmin; b.vx = 0; } else if (b.x > xmax) { b.x = xmax; b.vx = 0; }
          if (b.y < ymin) { b.y = ymin; b.vy = 0; } else if (b.y > ymax) { b.y = ymax; b.vy = 0; }
        }
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
            // Sur le sable le choc est mat : plein fer, la frappante garde
            // ~20 % de sa vitesse (carreau), la frappée part avec ~80 % —
            // et le dérapage tue tout ça très vite. Le pointé pousse mollement.
            const rest = (a.tir || c.tir) ? 0.6 : 0.3;
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
// Pour le dé de l'accueil : de quoi se trouver un prénom d'ici en un geste.
// Tout cet aléa reste hors de la simulation.
const PRENOMS_PROVENCE = ["Marius", "Fanny", "César", "Panisse", "Honorine", "Escartefigue",
  "Titin", "Félicie", "Ugolin", "Manon", "Angèle", "Galinette", "Baptistin", "Mireille",
  "Fernand", "Toinou", "Zézé", "Rosette", "Jeannot", "Aurore", "Lisette", "Paulin", "Amédée",
  "Clémence", "Tonin", "Norine", "Estelle", "Frédéri"];
const MOTS_CODE = ["APERO", "PASTIS", "CIGALE", "PLATANE", "BOULE", "CARREAU", "MISTRAL",
  "SOLEIL", "FANNY", "PETANQUE", "CALANQUE", "GARRIGUE"];
const prenomAleatoire = () => PRENOMS_PROVENCE[Math.floor(Math.random() * PRENOMS_PROVENCE.length)];
const codeAleatoire = () => MOTS_CODE[Math.floor(Math.random() * MOTS_CODE.length)]
  + String(10 + Math.floor(Math.random() * 90));
const lienPartie = code => `${location.origin}${location.pathname}?partie=${encodeURIComponent(code)}`;
// De quoi baptiser les bots sans jamais tomber deux fois sur le même
const PRENOMS_BOT = ["Marius", "Panisse", "César", "Escartefigue", "Honorine",
                     "Titin", "Félicie", "Gervais", "Ugolin"];

// Qui mène la partie (salon, propositions, coups des bots) : le premier
// joueur humain ; si la table n'a plus que des bots, le premier joueur
// qui s'est fait remplacer — son appareil est encore là.
export function meneurDe(st) {
  if (!st) return null;
  return st.players.filter(p => !p.bot)[0] || st.players.filter(p => p.remplace)[0] || null;
}

// Un bot n'a pas d'appareil : quel client exécute son tour ? L'hôte s'il
// est là, sinon n'importe quel client passé un délai de grâce — le
// premier qui écrit gagne, comme pour le chronomètre. Vaut pour tous les
// bots : ajoutés au salon, arrivés en cours de partie, ou remplaçant un
// joueur parti (même un hôte remplacé joue alors pour son propre bot).
const GRACE_BOT_MS = 3000;
export function doitJouerPourLeBot(st, meId, depuisMs) {
  if (!st || st.phase !== "playing") return false;
  const id = nextToPlay(st);
  const lui = id && st.players.find(p => p.id === id);
  if (!lui || !lui.bot) return false;
  if (st.enCours) return false; // un lancer est déjà annoncé, on n'en fait pas un second
  const hote = meneurDe(st);
  return hote && hote.id === meId ? true : depuisMs >= GRACE_BOT_MS;
}

// Rejoue un lancer dans le vide : mêmes corps, même physique, mais rien
// n'est affiché ni enregistré.
export function simulerCoup(st, T, team, angle, power, mode) {
  const bodies = makeBodies(st);
  const rad = (angle * Math.PI) / 180;
  const genre = !st.mene.cochonnet ? "coch" : mode === "tir" ? "tir" : "point";
  bodies.push(corpsLance(T, genre, power, rad, genre === "coch" ? {} : { team }));
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
  return { // la main tremble, mais reste dans les bornes du lancer
    angle: Math.round(Math.max(-A, Math.min(A, best.angle + (Math.random() - 0.5) * 2 * niv.bruitA * A))),
    power: Math.round(Math.max(25, Math.min(100, best.power + (Math.random() - 0.5) * 2 * niv.bruitF))),
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
  st.sansTournee = !!st.sansTournee; // option de l'hôte : ni tournées ni ivresse
  st.enCours = !!st.enCours; // un lancer est annoncé mais pas encore joué jusqu'au bout
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
  // Numéro de version : l'horodatage, mais jamais en dessous de la version
  // de départ + 1 — deux téléphones aux horloges décalées ne doivent pas
  // se faire ignorer mutuellement leurs états comme « périmés »
  st.rev = Math.max(Date.now(), (st.rev || 0) + 1);
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
  cv.width = decorLargeur(); cv.height = SKY_H;
  const cx = cv.getContext("2d");
  if (photoDecor) dessinerPhotoDecor(cx, decorLargeur(), SKY_H);
  else dessinerDecorStylise(cx, decorLargeur(), SKY_H);
  const fondu = cx.createLinearGradient(0, SKY_H - 18, 0, SKY_H);
  fondu.addColorStop(0, "rgba(58,44,24,0)");
  fondu.addColorStop(1, "rgba(58,44,24,0.38)");
  cx.fillStyle = fondu; cx.fillRect(0, SKY_H - 18, decorLargeur(), 18);
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

    // Le vol est dans la simulation : on n'en déduit que la hauteur
    // apparente (une cloche) et le moment de la retombée.
    if (b._air0 === undefined) b._air0 = b.air || 0;
    if (enVol) {
      b._lob = b._air0 > 0 ? Math.sin((1 - b.air / b._air0) * Math.PI) : 0;
      b._saut = true; // rien au sol tant qu'elle vole
      if (b.tir) { // sillage de la boule tirée : purement visuel
        const sil = b._sillage || (b._sillage = []);
        sil.push({ x: b.x, y: b.y, h: b._lob * 16 });
        if (sil.length > 10) sil.shift();
      }
      continue;
    }
    if (b._sillage && b._sillage.length) b._sillage = b._sillage.slice(-Math.max(0, b._sillage.length - 2));
    if (b._tAir > 0 && !b.dead) {
      b._lob = 0;
      if (inscrire) (b.tir ? marquerImpact : marquerPose)(t.cx, b, ech);
    }
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

export function drawField(ctx, st, bodiesOverride, aim, ivresse, T) {
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
    cam = { // la fenêtre peut montrer les bandes hors-jeu
      x: Math.max(VIEW_W / 2 - HORS_G, Math.min(T.W + HORS_G - VIEW_W / 2, foc.x)),
      y: Math.max(VIEW_H / 2 - HORS_H, Math.min(T.L + HORS_B - VIEW_H / 2, foc.y)),
    };
  }
  // coin haut-gauche de la fenêtre, en coordonnées terrain
  const fen = cam ? { x: cam.x - VIEW_W / 2, y: cam.y - VIEW_H / 2 } : { x: -(VIEW_W - T.W) / 2, y: -HORS_H };

  // bande de décor : elle glisse doucement quand la caméra se déplace
  const glisse = cam ? (cam.x / T.W - 0.5) : 0;
  ctx.drawImage(bandeDecor(), -(decorLargeur() - VIEW_W) / 2 - glisse * (decorLargeur() - VIEW_W), 0);

  // le terrain vit sous la bande de décor
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SKY_H, VIEW_W, VIEW_H);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, -fen.x, SKY_H - fen.y);

  // sable : le grain couvre toute la fenêtre, bandes hors-jeu comprises ;
  // nuances et traces ne concernent que le terrain lui-même. On ne peint
  // que la portion visible : le grand terrain fait 640 x 2750.
  ctx.fillStyle = motifDuSable(ctx);
  ctx.fillRect(fen.x, fen.y, VIEW_W, VIEW_H);
  ctx.fillStyle = "rgba(60,45,20,0.07)"; // hors des lignes, le sable est un peu plus terne
  ctx.fillRect(fen.x, fen.y, VIEW_W, VIEW_H);
  const vue = { x: Math.max(0, fen.x), y: Math.max(0, fen.y) };
  vue.w = Math.min(T.W, fen.x + VIEW_W) - vue.x;
  vue.h = Math.min(T.L, fen.y + VIEW_H) - vue.y;
  ctx.fillStyle = motifDuSable(ctx); // le terrain lui-même, net
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
    if (b.dead) { // hors-jeu : grisée, translucide, posée dans la bande
      ctx.save();
      ctx.globalAlpha = 0.55;
      const eo = b.r * 2.5;
      ctx.drawImage(spriteOmbreBoule(), b.x + 1.6 - eo / 2, b.y + 3.2 - eo * 0.33, eo, eo * 0.66);
      dessinerBoule(ctx, b.x, b.y, b.r, b.kind === "coch" ? "coch" : "#8f8c86");
      ctx.restore();
      continue;
    }
    // ombre portée : elle s'élargit, s'écarte et pâlit quand la boule
    // quitte le sol ; en tir, on doit voir qu'elle vole
    const lob = b._lob || 0;
    const lift = lob * (b.tir ? 16 : 7); // hauteur apparente en vol
    const eo = b.r * (2.5 + lift * 0.08);
    ctx.globalAlpha = lift ? Math.max(0.3, 1 - lob * 0.6) : 1;
    ctx.drawImage(spriteOmbreBoule(),
      b.x + 1.6 + lift * 0.45 - eo / 2, b.y + 3.2 + lift * 0.7 - eo * 0.33, eo, eo * 0.66);
    ctx.globalAlpha = 1;
    // fine traînée derrière la boule tirée
    if (b.tir && b._sillage && b._sillage.length > 1) {
      ctx.save();
      ctx.lineCap = "round"; ctx.lineWidth = 1.5;
      for (let i = 1; i < b._sillage.length; i++) {
        const p0 = b._sillage[i - 1], p1 = b._sillage[i];
        ctx.strokeStyle = `rgba(255,255,255,${(0.35 * i) / b._sillage.length})`;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y - p0.h); ctx.lineTo(p1.x, p1.y - p1.h); ctx.stroke();
      }
      ctx.restore();
    }
    // corps : la boule tirée grossit nettement en l'air
    const by = b.y - lift;
    dessinerBoule(ctx, b.x, by, b.r * (1 + lob * (b.tir ? 0.55 : 0.12)),
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

  // Repère de visée, en coordonnées écran, ancré en bas au centre là où le
  // joueur se tient : une courte ligne pointillée à faible opacité, qui
  // s'estompe à mesure que le geste s'allonge. La direction se devine.
  if (aim) {
    const ax = VIEW_W / 2, ay = SKY_H + VIEW_H - HORS_B - 30;
    const rad = (aim.angle * Math.PI) / 180;
    const len = 52;
    const alpha = 0.38 - 0.28 * Math.min(1, aim.progression || 0);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(107,87,58,${alpha.toFixed(3)})`; ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(ax, ay - 14); ctx.lineTo(ax + Math.sin(rad) * len, ay - 14 - Math.cos(rad) * len); ctx.stroke();
    ctx.restore();
  }

  // mini-carte du grand terrain
  if (T.camera && cam) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const mw = 40, mh = Math.round(mw * T.L / T.W);
    const mx = VIEW_W - mw - 6, my = SKY_H + 52, s = mw / T.W; // sous le fronton planté en haut
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

// ---------- Direction artistique (DESIGN.md) ----------------------
// « Le boulodrome de 1962 » : plaques émaillées crème à liseré bleu nuit,
// boutons imprimés à ombre dure, chiffres Oswald, titres Alfa Slab One.
// Les valeurs viennent des maquettes validées, reprises telles quelles.

const CREME = "#f2ecdc", NUIT = "#1d3a4f", ARDOISE = "#2e2a24", PASTIS = "#f6c324";

const CSS_BASE = `
.bp,.bs,.bi{font-family:'Oswald',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;box-sizing:border-box}
.bp{background:${PASTIS};border:2px solid ${NUIT};border-radius:4px;box-shadow:0 3px 0 ${NUIT};padding:13px 10px;font-size:17px;font-weight:700;letter-spacing:1.5px;color:${NUIT};min-height:48px}
.bs{background:${CREME};border:2px solid ${NUIT};border-radius:4px;box-shadow:0 3px 0 rgba(29,58,79,.6);padding:11px 10px;font-size:15px;font-weight:600;letter-spacing:1.5px;color:${NUIT};display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px}
.bs.petit{padding:6px 10px;font-size:12px;letter-spacing:1px;min-height:36px;gap:6px;white-space:nowrap}
.bs.creux{background:transparent}
.bi{width:40px;height:40px;background:${CREME};border:2px solid ${NUIT};border-radius:4px;box-shadow:0 3px 0 rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;color:${NUIT};font-size:18px;font-weight:700}
.bi.g{width:46px;height:46px;font-size:20px}
.bi.p{width:36px;height:36px;font-size:16px}
.bi.off svg{opacity:.35}
.bp:active,.bs:active,.bi:active{transform:translateY(3px);box-shadow:none}
.bp:disabled,.bs:disabled{opacity:.45;cursor:default}
.bp:disabled:active,.bs:disabled:active{transform:none;box-shadow:0 3px 0 ${NUIT}}
input[type=range]:disabled{opacity:.45}
.champ{background:#faf6ea;border:2px solid ${NUIT};border-radius:4px;padding:10px 12px;font-family:'Oswald',sans-serif;font-size:17px;color:${NUIT};outline:none;box-sizing:border-box;width:100%;min-width:0}
.champ:focus{box-shadow:inset 0 0 0 1px ${NUIT}}
.puce{display:inline-flex;align-items:center;gap:5px;background:${NUIT};color:${CREME};border-radius:4px;padding:5px 9px;font-family:'Oswald',sans-serif;font-size:13px;font-weight:600;letter-spacing:.5px}
.puce .x{border:none;background:transparent;color:${CREME};padding:0 0 0 4px;cursor:pointer;display:flex;align-items:center;min-height:24px}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:30px;background:transparent;margin:0;flex:1;min-width:0}
input[type=range]::-webkit-slider-runnable-track{height:6px;background:${NUIT};border-radius:3px}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:${PASTIS};border:2px solid ${NUIT};box-shadow:0 2px 0 ${NUIT};margin-top:-11px}
input[type=range]::-moz-range-track{height:6px;background:${NUIT};border-radius:3px}
input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:${PASTIS};border:2px solid ${NUIT};box-shadow:0 2px 0 ${NUIT}}
`;

// Le set d'icônes, trait 2 px, même graisse partout. Chemins repris des
// maquettes ; aucun émoji dans l'interface.
const ICONES = {
  rejouer: ["M3 12a9 9 0 1 0 2.6-6.4", "M3 4v5h5"],
  tourner: ["M21 12a9 9 0 1 1-2.6-6.4", "M21 3v6h-6"],
  son: ["M11 5 6 9H3v6h3l5 4z", "M15.5 8.5a5 5 0 0 1 0 7", "M18.5 5.5a9.5 9.5 0 0 1 0 13"],
  muet: ["M11 5 6 9H3v6h3l5 4z", "M16 9l5 6", "M21 9l-5 6"],
  note: ["M10 18V5l10-2v13", { c: [7, 18, 3] }, { c: [17, 16, 3] }],
  maison: ["M3 11 12 4l9 7", "M5 10v9h14v-9", "M10 19v-5h4v5"],
  de: [{ r: [3, 3, 18, 18, 3] }, { p: [8.5, 8.5] }, { p: [15.5, 15.5] }, { p: [15.5, 8.5] }, { p: [8.5, 15.5] }],
  partage: ["M12 15V4", "M8 8l4-4 4 4", "M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"],
  engrenage: [{ c: [12, 12, 3] }, "M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"],
  croix: ["M6 6l12 12", "M18 6 6 18"],
  horloge: [{ c: [12, 13, 8] }, "M12 9v4l3 2", "M9 2h6"],
  robot: [{ r: [5, 8, 14, 11, 2] }, "M12 8V5", { c: [12, 4, 1] }, { p: [9.5, 13] }, { p: [14.5, 13] }, "M9 16.5h6", "M5 12H3", "M19 12h2"],
  oeil: [{ c: [12, 12, 3] }, "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"],
};

function Ico({ nom, taille = 20, couleur = NUIT, epaisseur = 2 }) {
  const el = ICONES[nom] || [];
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur}
         strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {el.map((e, i) => typeof e === "string" ? <path key={i} d={e} />
        : e.c ? <circle key={i} cx={e.c[0]} cy={e.c[1]} r={e.c[2]} />
        : e.r ? <rect key={i} x={e.r[0]} y={e.r[1]} width={e.r[2]} height={e.r[3]} rx={e.r[4]} />
        : <circle key={i} cx={e.p[0]} cy={e.p[1]} r={1.4} fill={couleur} stroke="none" />)}
    </svg>
  );
}

// Le verre de pastis dessiné (anisette et glaçon) : petit sur le fronton,
// grand sur la pop-in de tournée. Chemins de la maquette.
function Verre({ grand, couleur = CREME }) {
  if (grand) return (
    <svg width="54" height="70" viewBox="0 0 54 70" fill="none" stroke={NUIT} strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4h36l-6 40a12 12 0 0 1-24 0z" fill="#faf6ea" />
      <path d="M13.5 14h27l-3.6 27a9.5 9.5 0 0 1-19.8 0z" fill={PASTIS} stroke="none" />
      <rect x="20" y="17" width="10" height="10" rx="2" fill="#dff0f6" stroke={NUIT} strokeWidth="1.6" transform="rotate(12 25 22)" />
      <path d="M27 46v14" /><path d="M15 66h24" />
    </svg>
  );
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke={couleur} strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 1h8l-1.2 7a2.8 2.8 0 0 1-5.6 0z" /><path d="M6 9v3" /><path d="M3.5 13h5" />
      <rect x="4" y="2.4" width="4" height="4.4" fill={PASTIS} stroke="none" />
    </svg>
  );
}
const Boule = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#d9d9d9" stroke="#8f8f8f" strokeWidth="1" /></svg>
);

// Le trophée : cochonnet d'or sur son socle
const Trophee = () => (
  <svg width="86" height="92" viewBox="0 0 86 92" aria-hidden="true" style={{ animation: "dore 1s cubic-bezier(.2,1.4,.4,1) both" }}>
    <defs>
      <radialGradient id="or" cx="35%" cy="30%" r="70%">
        <stop offset="0" stopColor="#fff6c8" /><stop offset=".3" stopColor="#ffd23f" />
        <stop offset=".75" stopColor="#c98a12" /><stop offset="1" stopColor="#6b4a08" />
      </radialGradient>
    </defs>
    <rect x="18" y="72" width="50" height="10" rx="2" fill={NUIT} />
    <rect x="10" y="80" width="66" height="10" rx="2" fill={NUIT} />
    <rect x="36" y="58" width="14" height="16" fill="#c98a12" stroke={NUIT} strokeWidth="2" />
    <circle cx="43" cy="34" r="26" fill="url(#or)" stroke={NUIT} strokeWidth="2.5" />
    <path d="M30 26a17 17 0 0 1 12-8" stroke="#fff6c8" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
);

// Fin de partie : confettis, cochonnet doré, tampon Fanny
const CSS_FETE = `
@keyframes confetti {
  0% { transform: translateY(-12vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(105vh) rotate(720deg); opacity: 0.85; }
}
@keyframes dore {
  0% { transform: scale(0.2) rotate(-30deg); opacity: 0; }
  60% { transform: scale(1.15) rotate(8deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}
@keyframes tampon {
  0% { transform: scale(2.4) rotate(-18deg); opacity: 0; }
  70% { transform: scale(0.95) rotate(-12deg); opacity: 1; }
  100% { transform: scale(1) rotate(-12deg); opacity: 1; }
}`;

function Confettis({ graine }) {
  // Un jet de confettis aux couleurs des équipes et du pastis ; l'aléa
  // ne sert qu'à la fête, jamais au jeu.
  const pieces = React.useMemo(() => {
    const couleurs = [PASTIS, "#2ba3d4", "#bd4f3a", "#c9a02e", "#8fd4f0", CREME];
    return Array.from({ length: 48 }, (_, i) => ({
      left: Math.random() * 100, delai: Math.random() * 2.5, duree: 3 + Math.random() * 2.5,
      taille: 6 + Math.random() * 8, couleur: couleurs[i % couleurs.length],
      rond: Math.random() > 0.5,
    }));
  }, [graine]);
  return (
    <div style={styles.confettis} aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: "absolute", top: 0, left: `${p.left}%`, width: p.taille, height: p.taille * (p.rond ? 1 : 0.5),
          background: p.couleur, borderRadius: p.rond ? "50%" : 2,
          animation: `confetti ${p.duree}s ${p.delai}s linear infinite`,
        }} />
      ))}
    </div>
  );
}

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

// ---------- Mini-didacticiel du lancer ----------------------------
// À la première partie sur l'appareil : trois étapes, un tap pour passer.
// Revoyable depuis l'aide.

function Didacticiel({ fermer }) {
  const S = styles;
  const [etape, setEtape] = React.useState(0);
  const dessin = i => {
    const terrain = <rect x="20" y="10" width="80" height="120" rx="3" fill="#d8c49a" stroke={NUIT} strokeWidth="2" />;
    const doigt = (x, y) => (
      <g stroke={NUIT} strokeWidth="2" fill="#faf6ea" strokeLinejoin="round">
        <path d={`M${x} ${y}v-14a4 4 0 0 1 8 0v20l6-3a4 4 0 0 1 6 3v10a10 10 0 0 1-10 10h-6a10 10 0 0 1-10-10v-16a4 4 0 0 1 6 0z`} />
      </g>
    );
    if (i === 0) return <svg width="120" height="140" viewBox="0 0 120 140" aria-hidden="true">{terrain}<circle cx="60" cy="96" r="16" fill="none" stroke={NUIT} strokeWidth="2" strokeDasharray="4 4" />{doigt(56, 90)}</svg>;
    if (i === 1) return <svg width="120" height="140" viewBox="0 0 120 140" aria-hidden="true">{terrain}<path d="M60 40v46" stroke="#6b573a" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" /><path d="M60 62v52" stroke={NUIT} strokeWidth="3" strokeLinecap="round" /><path d="M52 106l8 10 8-10" fill="none" stroke={NUIT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{doigt(56, 114)}</svg>;
    return <svg width="120" height="140" viewBox="0 0 120 140" aria-hidden="true">{terrain}<circle cx="60" cy="44" r="9" fill="#2ba3d4" stroke={NUIT} strokeWidth="2" /><path d="M60 100V62M48 84l-4-8M72 84l4-8" stroke={NUIT} strokeWidth="2" strokeLinecap="round" opacity=".6" />{doigt(80, 118)}</svg>;
  };
  const etapes = [
    ["TOUCHE LE TERRAIN", "Pose le doigt sur le sable, là où tu veux."],
    ["TIRE VERS L'ARRIÈRE", "La direction du geste donne la direction, sa longueur la force."],
    ["RELÂCHE", "La boule part. C'est tout — à toi de jouer."],
  ];
  const suivant = () => { if (etape < 2) setEtape(etape + 1); else fermer(); };
  return (
    <div style={S.voile} onClick={suivant}>
      <div style={S.plaquePopin}>
        {dessin(etape)}
        <div style={S.popinTitre}>{etapes[etape][0]}</div>
        <div style={S.popinSous}>{etapes[etape][1]}</div>
        <div style={S.pastilles}>{[0, 1, 2].map(i => <span key={i} style={{ ...S.pastilleTuto, background: i === etape ? NUIT : "transparent" }} />)}</div>
        <button className="bp" style={{ width: "100%" }} onClick={e => { e.stopPropagation(); suivant(); }}>{etape < 2 ? "SUIVANT" : "ALLEZ, ON JOUE"}</button>
      </div>
    </div>
  );
}

// ---------- Écran d'aide ------------------------------------------
// Les nouveaux arrivent par un lien, sans rien connaître : tout ce qu'il
// faut savoir tient sur une plaque, accessible de partout par le « ? ».

function PanneauAide({ fermer, revoirGeste }) {
  const S = styles;
  const section = (titre, texte) => (
    <div key={titre}>
      <h3 style={S.aideTitre2}>{titre}</h3>
      <p style={S.aideTexte}>{texte}</p>
    </div>
  );
  return (
    <div style={S.voile} onClick={fermer}>
      <div style={{ ...S.plaque, maxWidth: 400, gap: 10 }} onClick={e => e.stopPropagation()}>
        <h2 style={S.plaqueTitre}>PÉTANQUE ! — LES RÈGLES EN DEUX MINUTES</h2>
        {section("Le but",
          `Le premier à ${TARGET} points gagne. À chaque mène, l'équipe qui a la boule
           la plus proche du cochonnet marque un point par boule mieux placée que la
           meilleure boule adverse.`)}
        {section("Une mène",
          `Le premier joueur lance le cochonnet — assez loin, sinon il faut recommencer.
           Ensuite joue toujours l'équipe qui n'a pas le point. Quand il n'y a plus de
           boules, on compte.`)}
        {section("Pointer ou tirer",
          `Pointer : la boule part en cloche, retombe à mi-chemin et roule jusqu'au
           cochonnet — en l'air, elle passe par-dessus les autres. Tirer : elle vole
           jusqu'à son point de chute et frappe sec — c'est comme ça qu'on fait un
           carreau.`)}
        {section("Le geste",
          `Touche le terrain et tire vers l'arrière : la flèche donne la direction,
           la longueur du geste donne la force — elle ne s'affiche pas, ça se juge à
           l'œil, comme au vrai jeu. Vingt secondes par lancer, après quoi la boule
           part toute seule.`)}
        {section("Boule morte",
          `Une boule qui franchit la ligne du fond est perdue. Sur les côtés, elle ne
           meurt que si elle sort entièrement.`)}
        {section("Les terrains",
          `Classique : tout le terrain tient à l'écran. Long 10 m : la caméra suit
           l'action et la mini-carte montre l'ensemble.`)}
        {section("Les bots",
          `L'hôte peut ajouter des joueurs artificiels — Fanny la débutante, le Pointeur
           correct, le Fada chirurgical — dans n'importe quelle équipe : on peut jouer
           seul. Un joueur qui laisse filer trois lancers peut être remplacé par un bot,
           et reprendre sa place dès qu'il revient.`)}
        {section("La tournée",
          `L'équipe qui gagne une mène offre une tournée de pastis à qui elle veut. Trois
           mènes d'affilée et les vainqueurs trinquent aussi. Chaque verre trouble un peu
           plus la vue — et l'ouïe. L'équipe qui finit à zéro est Fanny.`)}
        {section("À plusieurs",
          `Jusqu'à 9 joueurs et 3 équipes. Tout le monde entre le même code de partie,
           chacun sur son appareil, et chaque lancer se rejoue en direct chez les autres.`)}
        {revoirGeste && <button className="bs" onClick={revoirGeste}>REVOIR LE GESTE</button>}
        <button className="bp" onClick={fermer}>ALLEZ, ON JOUE</button>
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
  // Mini-didacticiel : à la première partie sur cet appareil
  const [tuto, setTuto] = useState(false);
  useEffect(() => {
    if (screen !== "in" || game?.phase !== "playing") return;
    try { if (!localStorage.getItem("petanque.tuto")) setTuto(true); } catch {}
  }, [screen, game?.phase]);
  const fermerTuto = () => { setTuto(false); try { localStorage.setItem("petanque.tuto", "1"); } catch {} };
  // Lancer au doigt par défaut ; les curseurs restent disponibles (bureau,
  // accessibilité) et le choix est retenu sur l'appareil.
  const [curseurs, setCurseurs] = useState(() => {
    try { return localStorage.getItem("petanque.curseurs") === "1"; } catch { return false; }
  });
  const [geste, setGeste] = useState(null); // { angle, power, valide } pendant le glissé
  const gesteRef = useRef(null);
  // Le cri du Sud : quand l'équipe qui tient le point change (premier
  // point de la mène compris), on le crie — pas sur le lancer qui termine
  // la mène, la pop-in prend le relais. Cri choisi par rotation.
  const [cri, setCri] = useState(null);
  // Largeur interne du canvas épousant le cadre : mesurée au chargement
  // et à chaque changement de taille
  const cadreRef = useRef(null);
  const [largeurVue, setLargeurVue] = useState(VIEW_W);
  useEffect(() => {
    const el = cadreRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const mesurer = () => {
      const bw = el.clientWidth, bh = el.clientHeight; // la boîte intérieure, bordures exclues
      if (bw < 10 || bh < 10) return;
      const w = (CANVAS_H * bw) / bh;
      if (reglerLargeurVue(w)) setLargeurVue(VIEW_W);
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen, game?.phase]);
  const tenantRef = useRef({ mene: null, team: null });
  const criCompteurRef = useRef(0);
  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.mene) { tenantRef.current = { mene: null, team: null }; return; }
    const m = game.mene;
    const tenant = m.cochonnet && m.boules.some(b => !b.dead) ? (scoreMene(game)?.team ?? null) : null;
    const ref = tenantRef.current;
    if (ref.mene !== m.num) { ref.mene = m.num; ref.team = tenant; return; } // nouvelle mène : on repart sans crier
    if (tenant && tenant !== ref.team && m.boules.length >= 3) { // avant, prendre le point est trivial
      const n = criCompteurRef.current++;
      setCri(`${CRIS[n % CRIS.length]} ${TEAM_NAMES[tenant].replace("Équipe ", "").toUpperCase()} PREND LE POINT`);
      const t = setTimeout(() => setCri(null), 2500);
      ref.team = tenant;
      return () => clearTimeout(t);
    }
    ref.team = tenant ?? ref.team; // on suit le tenant même sans crier
  }, [game?.rev]);
  // Tapis figé à l'écran entre un lancer et la suite (voir « figer »)
  const [gel, setGel] = useState(null);
  const gelRef = useRef(null);
  gelRef.current = gel;
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const replayedRef = useRef(null); // id du dernier lancer déjà animé sur cet appareil
  const meIdRef = useRef(null);
  const seenTourneeRef = useRef(0);
  const autoLancerRef = useRef(""); // évite de déclencher deux fois le lancer du timer
  const botRef = useRef("");        // idem pour le coup d'un bot
  const tourneeBotRef = useRef("");   // ... et pour sa tournée
  const tourneeExpRef = useRef("");   // expiration de la tournée déjà appliquée
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
  // Une tournée en attente bloque la mène suivante : personne ne lance
  // tant que l'équipe gagnante n'a pas choisi (ou laissé passer 20 s).
  const tourneeEnAttente = !!game && game.phase === "playing" && !!game.tourneePending;
  const tourneeVueRef = useRef(null);
  const tourneeDepuisRef = useRef(Date.now());
  if ((game?.tourneePending || null) !== tourneeVueRef.current) {
    tourneeVueRef.current = game?.tourneePending || null;
    tourneeDepuisRef.current = Date.now();
  }
  const tourneeReste = Math.max(0, TEMPS_TOURNEE - Math.floor((Date.now() - tourneeDepuisRef.current) / 1000));
  // Depuis quand ce client voit un lancer annoncé (enCours) : passé 8 s sans
  // résultat, le lanceur a disparu et quelqu'un d'autre peut jouer
  const enCoursVuRef = useRef(false);
  const enCoursDepuisRef = useRef(0);
  if (!!game?.enCours !== enCoursVuRef.current) {
    enCoursVuRef.current = !!game?.enCours;
    enCoursDepuisRef.current = Date.now();
  }

  const me = game?.players.find(p => p.id === meId) || null;
  // Qui mène la partie (salon, propositions, coups des bots) : le premier
  // joueur humain ; si la table n'a plus que des bots, l'appareil du
  // premier joueur qui s'est fait remplacer — sinon personne ne les ferait
  // jouer.
  const meneur = meneurDe(game);
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

  // Arrivée par un lien ?partie=CODE : le code est déjà rempli. Sinon on en
  // propose un, pour que créer une partie ne demande qu'un prénom.
  useEffect(() => {
    let dansLien = null;
    try { dansLien = new URLSearchParams(location.search).get("partie"); } catch {}
    setCode(c => c || (dansLien ? dansLien.toUpperCase() : codeAleatoire()));
  }, []);

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

  // Le son ne part que sur demande : les boutons cigales et musique sont les seuls déclencheurs
  // (décision des joueurs de la partie test).

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
    if (etiquette) setNotice(etiquette);
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
        prov.mene.boules = bodies.filter(b => b.kind === "boule")
          .map(b => ({ x: b.x, y: b.y, team: b.team, pid: b.pid, dead: b.dead || undefined }));
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
        drawField(ctx, g, bodies, null, ivresse, Tg);
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
    if (!game || game.phase !== "playing" || animating || gel || tourneeEnAttente || !turnId) return;
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
  // Voir doitJouerPourLeBot : l'hôte tout de suite, les autres après la
  // grâce ; throwBoule revérifie l'état et s'efface si un lancer est déjà
  // annoncé, donc deux clients ne jouent jamais le même coup.
  useEffect(() => {
    if (!game || animating || gel || tourneeEnAttente || !turnId) return;
    if (!doitJouerPourLeBot(game, meId, ecouleMs)) return;
    const lui = game.players.find(p => p.id === turnId);
    const marque = turnId + ":" + (game.rev || 0);
    if (botRef.current === marque) return;
    botRef.current = marque;
    setTimeout(() => {
      const g = gameRef.current;
      if (!g || g.phase !== "playing" || animatingRef.current || nextToPlay(g) !== turnId || g.enCours) {
        botRef.current = ""; // rien joué : on retentera au prochain battement d'horloge
        return;
      }
      const coup = coupDuBot(g, terrainDe(g), lui); // il essaie ses lancers dans sa tête
      throwBoule(turnId, coup.angle, coup.power, coup.mode);
    }, 1200);
  });

  // Passé le délai, l'hôte passe la tournée pour l'équipe qui n'a pas
  // choisi : une tournée ne bloque jamais une partie.
  // (l'hôte à l'échéance, n'importe quel client 3 s plus tard : l'hôte
  // peut être parti)
  useEffect(() => {
    if (!tourneeEnAttente || tourneeReste > 0) return;
    if (!isHost && Date.now() - tourneeDepuisRef.current < (TEMPS_TOURNEE + 3) * 1000) return;
    const marque = game.tourneePending + ":" + (game.mene?.num ?? 0);
    if (tourneeExpRef.current === marque) return;
    tourneeExpRef.current = marque;
    offrirTournee(null, game.tourneePending);
  });

  // Une équipe qui n'a que des bots offre sa tournée toute seule, sinon
  // personne ne boirait jamais dans une partie en solo.
  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.tourneePending) return;
    if (!isHost && Date.now() - tourneeDepuisRef.current < GRACE_BOT_MS) return; // l'hôte d'abord
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
    const visee = geste ? { angle: geste.angle, progression: (geste.power - 25) / 75 }
      : (myTurn && !gel && curseurs ? { angle, progression: 0 } : null);
    drawField(cv.getContext("2d"), game, gel ? gel.bodies : null, visee, ivresseNiveau, T);
  }, [game, angle, myTurn, animating, screen, ivresseNiveau, T, decorPret, gel, geste, curseurs, largeurVue]);

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
  const setSansTournee = v => mutate(g => { g.sansTournee = !!v; });
  const setTerrain = k => mutate(g => { g.terrain = k; });

  async function start() {
    const base = (await loadGame(code)) || game;
    if (!activeTeams(base).length) { setNotice("Il faut au moins un joueur."); return; }
    await mutate(g => {
      if (activeTeams(g).length < 2) { // une seule équipe : un bot complète une équipe vide, pas d'impasse
        const vide = TEAMS.find(t => !g.players.some(p => p.team === t));
        const pris = new Set(g.players.map(p => p.name));
        const prenom = PRENOMS_BOT.find(n => !pris.has(n)) || "Marius";
        g.players.push({ id: "b" + Date.now() + Math.floor(Math.random() * 1000), name: prenom, team: vide, bot: true, niveau: "pointeur" });
        setNotice(`${prenom} complète ${TEAM_NAMES[vide]}`);
        setTimeout(() => setNotice(""), 5000);
      }
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
    if (pid === meId && !myTurn && !me?.bot) return;
    poserAnimating(true);
    // Revérifier avec la dernière version : quelqu'un a pu jouer entre-temps
    const latest = (await loadGame(code)) || game;
    if (latest.phase !== "playing" || nextToPlay(latest) !== pid) {
      setGame(latest);
      poserAnimating(false);
      botRef.current = "";
      if (pid === meId && !me?.bot) setNotice("Le jeu a évolué entre-temps — vérifie que c'est bien ton tour.");
      return;
    }
    // Un autre client a déjà annoncé ce lancer et n'a pas fini de le jouer :
    // on s'efface, sauf si ça dure trop (lanceur disparu)
    const annonceRecente = latest.enCours && !(enCoursVuRef.current && Date.now() - enCoursDepuisRef.current > 8000);
    if (annonceRecente) { setGame(latest); poserAnimating(false); botRef.current = ""; return; }
    const lanceur = latest.players.find(p => p.id === pid);
    if (!lanceur) { poserAnimating(false); return; }
    setNotice("");
    const st = structuredClone(latest);
    const Ts = terrainDe(st);
    const bodies = makeBodies(st);
    // L'ivresse ne touche plus au geste (décision des joueurs : le flou
    // suffit) ; seule l'imprécision naturelle du lancer demeure, et elle
    // grandit avec la force.
    const ivresse = Math.min(6, (st.drinks && st.drinks[lanceur.team]) || 0);
    const echelle = Ts.angleMax / 25; // le bruit angulaire suit l'ouverture du terrain
    const noise = (Math.random() - 0.5) * 3 * (powerV / 100) * echelle;
    const puissance = Math.min(100, Math.max(25, powerV));
    const rad = ((angleV + noise) * Math.PI) / 180;
    const genre = !st.mene.cochonnet ? "coch" : modeV === "tir" ? "tir" : "point";
    const thrown = corpsLance(Ts, genre, puissance, rad, genre === "coch" ? { pid } : { team: lanceur.team, pid });
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
    annonce.enCours = true; // levé par le commit
    saveGame(code, annonce); // sans attendre
    // Le canvas peut manquer (écran d'accueil, partie terminée) : le lancer
    // doit aboutir quand même, sinon la partie reste figée sur ce coup.
    const ctx = canvasRef.current ? canvasRef.current.getContext("2d") : null;
    let frames = 0;
    const loop = () => {
      try {
        const moving = stepPhysics(bodies, Ts);
        marquerTraces(bodies, Ts);
        if (ctx) drawField(ctx, st, bodies, null, ivresse, Ts);
        frames++;
        if (moving && frames < 1200) { requestAnimationFrame(loop); }
        else { fusionnerTraces(); commit(st, bodies, thrown, replayMeta, pid, auto); }
      } catch (e) {
        poserAnimating(false); // jamais bloquer la partie sur un souci d'affichage
        setNotice("Souci d'affichage pendant le lancer — le jeu se resynchronise.");
      }
    };
    setTimeout(() => requestAnimationFrame(loop), Math.max(0, replayMeta.startAt - Date.now()));
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
      const encore = structuredClone(st); encore.enCours = false;
      saveGame(code, encore); // le lancer annoncé est abandonné : la table est libre
      setNotice("Cochonnet trop court — relance-le !");
      return;
    }
    setNotice("");
    st.replay = { id: replayMeta.id, startAt: replayMeta.startAt, before: replayMeta.before, thrown };
    st.enCours = false;
    replayedRef.current = st.replay.id;
    st.mene.cochonnet = { x: coch.x, y: coch.y };
    st.mene.boules = bodies // les mortes restent, grisées, jusqu'à la fin de la mène
      .filter(b => b.kind === "boule")
      .map(b => ({ x: b.x, y: b.y, team: b.team, pid: b.pid, tir: b.tir || undefined, dead: b.dead || undefined }));
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
          if (!st.sansTournee) {
            st.tourneePending = res.team; // la mène gagnée ouvre droit à une tournée
            if (st.streak.count % 3 === 0) { // 3 d'affilée : les vainqueurs trinquent aussi
              st.drinks[res.team] = (st.drinks[res.team] || 0) + 1;
              st.lastTournee = { to: res.team, surprise: true, id: Date.now() };
            }
          }
        }
      } else {
        st.streak = null; // mène blanche : la série retombe
        newMene(st, st.mene.firstTeam, st.mene.num + 1);
      }
    }
    // Quelqu'un a pu rejoindre la table pendant le lancer : on le garde
    const frais = await loadGame(code);
    if (frais) for (const p of frais.players) {
      if (!st.players.some(q => q.id === p.id)) {
        st.players.push(p);
        if (st.mene && st.mene.left[p.id] === undefined) st.mene.left[p.id] = 0;
      }
    }
    if (finMene) figer(bodies, st.rev, true, true); // on laisse voir le tapis final
    setGame(st);
    poserAnimating(false);
    randomizeAim();
    if (!(await saveGame(code, st))) setNotice("Échec de synchronisation — le jeu réessaiera.");
  }

  // Partager le lien de la partie : la feuille de partage du téléphone si
  // elle existe, sinon le presse-papiers, et à défaut le lien affiché.
  const partager = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { setNotice("Choisis d'abord un code de partie."); return; }
    const url = lienPartie(c);
    try {
      if (navigator.share) { await navigator.share({ title: "Pétanque en ligne", text: `Rejoins la partie ${c} !`, url }); return; }
      await navigator.clipboard.writeText(url);
      setNotice("Lien copié — envoie-le à tes amis.");
    } catch (e) {
      if (e && e.name === "AbortError") return; // partage annulé
      setNotice(url);
    }
    setTimeout(() => setNotice(""), 5000);
  };

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
  const peutLancer = myTurn && !animating && !gel && !tourneeEnAttente;

  const basculerCurseurs = v => {
    setCurseurs(v);
    try { localStorage.setItem("petanque.curseurs", v ? "1" : "0"); } catch {}
  };

  const posCanvas = e => {
    // L'image est ajustée et centrée dans la boîte (object-fit: contain) :
    // on retrouve son échelle et ses décalages
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.min(r.width / VIEW_W, r.height / CANVAS_H);
    const dx = (r.width - VIEW_W * k) / 2, dy = r.height - CANVAS_H * k; // calée en bas
    return { x: (e.clientX - r.left - dx) / k, y: (e.clientY - r.top - dy) / k };
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
  // Les outils : rejouer (en partie, quand il y a un coup à revoir et que
  // rien ne bouge), cigales, musique, aide, maison (en partie).
  const outils = (enPartie, grand) => {
    const cl = "bi" + (grand ? " g" : enPartie ? " p" : "");
    const t = grand ? 22 : enPartie ? 18 : 20;
    return (
      <div style={S.outils}>
        {enPartie && game?.replay && !animating && !gel && (
          <button className={cl} aria-label="Revoir le coup" title="Revoir le coup"
                  onClick={() => lancerAnimationReplay(game, "Replay du dernier coup…")}><Ico nom="rejouer" taille={t} /></button>
        )}
        <button className={cl} aria-label="Cigales" title="Cigales" onClick={basculerCigales}><Ico nom={cigales ? "son" : "muet"} taille={t} /></button>
        <button className={cl + (ambiance ? "" : " off")} aria-label="Musique" title="Musique" onClick={basculerAmbiance}><Ico nom="note" taille={t} /></button>
        <button className={cl} aria-label="Aide" title="Aide" onClick={() => setAide(true)}>?</button>
        {enPartie && <button className={cl} aria-label="Accueil" title="Accueil" onClick={quitter}><Ico nom="maison" taille={t} /></button>}
      </div>
    );
  };

  const restantes = t => game && game.mene
    ? game.players.filter(p => p.team === t).reduce((s, p) => s + (game.mene.left[p.id] || 0), 0)
    : 0;
  const nomCourt = t => TEAM_NAMES[t].replace("Équipe ", "").toUpperCase();
  const nomLong = t => TEAM_NAMES[t].toUpperCase();

  // ---- Accueil -----------------------------------------------------
  if (screen === "entry") {
    return (
      <div style={S.page}>
        <style>{CSS_BASE}</style>
        {aide && <PanneauAide fermer={() => setAide(false)} />}
        <div style={S.enseigne}>
          <h1 style={S.titre}>PÉTANQUE&nbsp;!</h1>
          <div style={S.accroche}>9 JOUEURS · 13 POINTS · 1 LIEN</div>
        </div>
        <div style={S.plaque}>
          <label style={S.etiquette} htmlFor="nom">NOM DE JOUEUR</label>
          <div style={S.rangee}>
            <input id="nom" className="champ" value={name} onChange={e => setName(e.target.value)} placeholder="Fernand" />
            <button className="bi g" aria-label="Nom au hasard" title="Nom au hasard" onClick={() => setName(prenomAleatoire())}><Ico nom="de" taille={22} /></button>
          </div>
          <label style={S.etiquette} htmlFor="code">CODE DE LA PARTIE</label>
          <div style={S.rangee}>
            <input id="code" className="champ" style={{ letterSpacing: 1 }} value={code} onChange={e => setCode(e.target.value)} placeholder="PLATANE66" />
            <button className="bi g" aria-label="Code au hasard" title="Code au hasard" onClick={() => setCode(codeAleatoire())}><Ico nom="tourner" taille={22} /></button>
          </div>
          <button className="bp" style={{ marginTop: 6 }} disabled={busy} onClick={join}>REJOINDRE LA PARTIE</button>
          <button className="bs" onClick={partager}><Ico nom="partage" taille={18} />PARTAGER LE LIEN</button>
          {notice && <div style={S.ardoise}>{notice}</div>}
        </div>
        {outils(false, true)}
      </div>
    );
  }

  if (!game) return <div style={S.page}><style>{CSS_BASE}</style><div style={S.ardoise}>Chargement…</div></div>;

  // ---- Salon -------------------------------------------------------
  if (game.phase === "lobby") {
    const compte = t => game.players.filter(p => p.team === t).length;
    return (
      <div style={S.page}>
        <style>{CSS_BASE}</style>
        {aide && <PanneauAide fermer={() => setAide(false)} />}
        <div style={S.enseigne}>
          <h1 style={S.titrePetit}>PARTIE {code}</h1>
          <div style={S.accroche}>{game.players.length}/9 JOUEURS · CHACUN CHOISIT SON ÉQUIPE</div>
        </div>
        <button className="bs" style={S.large} onClick={partager}><Ico nom="partage" taille={18} />PARTAGER LE LIEN</button>
        {TEAMS.map(t => (
          <div key={t} style={S.plaqueEquipe}>
            <div style={S.equipeTete}>
              <span style={{ ...S.pastille, background: TEAM_COLORS[t] }} />
              <span style={S.equipeNom}>{nomLong(t)}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {me && me.team !== t && compte(t) < 3 && (
                  <button className="bs petit" onClick={() => pickTeam(t)}>ME PLACER ICI</button>
                )}
                {isHost && game.players.length < 9 && compte(t) < 3 && (
                  <button className="bi" aria-label="Ajouter un bot" title="Ajouter un bot" style={{ width: 36, height: 36 }}
                          onClick={() => ajouterBot(t)}><Ico nom="robot" taille={18} /></button>
                )}
              </div>
            </div>
            {compte(t) > 0 && (
              <div style={S.puces}>
                {game.players.filter(p => p.team === t).map(p => (
                  <span key={p.id} className="puce">
                    {p.bot && <Ico nom="robot" taille={14} couleur={CREME} />}
                    {p.name}{p.id === meId ? " (toi)" : ""}
                    {p.bot && <span style={{ opacity: 0.6, fontWeight: 500 }}>· {NIVEAUX_BOT[p.niveau]?.nom ?? ""}</span>}
                    {p.bot && isHost && (
                      <button className="x" aria-label="Retirer" title="Retirer" onClick={() => retirerBot(p.id)}><Ico nom="croix" taille={14} couleur={CREME} /></button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {isHost && (
          <div style={S.plaque}>
            <label style={S.etiquette}>BOULES PAR JOUEUR</label>
            <div style={S.rangee}>
              {[1, 2, 3].map(n => (
                <button key={n} className={game.boulesEach === n ? "bp" : "bs"} style={S.segment} onClick={() => setBoules(n)}>{n}</button>
              ))}
            </div>
            <p style={S.note}>Équipes inégales ? Le total de boules par équipe est équilibré tout seul.</p>
            <label style={S.etiquette}>NIVEAU DES BOTS</label>
            <div style={S.rangee}>
              {ORDRE_BOTS.map(k => (
                <button key={k} className={niveauBot === k ? "bp" : "bs"} style={S.segment} onClick={() => setNiveauBot(k)}>{NIVEAUX_BOT[k].nom.toUpperCase()}</button>
              ))}
            </div>
            <label style={S.etiquette}>TOURNÉES DE PASTIS</label>
            <div style={S.rangee}>
              <button className={!game.sansTournee ? "bp" : "bs"} style={S.segment} onClick={() => setSansTournee(false)}>AVEC</button>
              <button className={game.sansTournee ? "bp" : "bs"} style={S.segment} onClick={() => setSansTournee(true)}>SANS</button>
            </div>
            <label style={S.etiquette}>TERRAIN</label>
            <div style={S.rangee}>
              {Object.entries(TERRAINS).map(([k, tt]) => (
                <button key={k} className={(game.terrain || "classique") === k ? "bp" : "bs"} style={S.segment} onClick={() => setTerrain(k)}>{tt.nom.toUpperCase()}</button>
              ))}
            </div>
            <button className="bp" style={{ marginTop: 6 }} onClick={start}>LANCER LA PARTIE</button>
          </div>
        )}
        {!isHost && (
          <div style={{ ...S.ardoise, maxWidth: 390, width: "100%" }}>
            Terrain {terrainDe(game).nom}{game.sansTournee ? ", sans tournée" : ""} — {meneur?.name ?? "l'hôte"} lance la partie…
          </div>
        )}
        <div style={S.outils}>
          <button className="bi g" aria-label="Accueil" title="Accueil" onClick={quitter}><Ico nom="maison" taille={22} /></button>
          {outils(false, true)}
        </div>
        {notice && <div style={{ ...S.ardoise, maxWidth: 390, width: "100%" }}>{notice}</div>}
      </div>
    );
  }

  // ---- Partie ------------------------------------------------------
  const turnPlayer = game.players.find(p => p.id === turnId);
  // Proposé à l'hôte seulement, et jamais pour le joueur en train de jouer
  const absentAProposer = isHost && game.phase === "playing"
    ? game.players.find(p => !p.bot && (game.absents?.[p.id] || 0) >= 3) : null;
  const pointLive = game.phase === "playing" && game.mene && game.mene.cochonnet && game.mene.boules.length
    ? scoreMene(game) : null;
  const equipes = activeTeams(game);

  // Le fronton : une colonne par équipe, un compteur central « MÈNE N »
  // avec le chronomètre et qui joue — façon panneau de basket.
  const ligneTour = game.phase !== "playing" ? "PARTIE FINIE"
    : tourneeEnAttente ? "TOURNÉE…"
    : gel && !gel.commit ? "RÉSULTAT…"
    : animating ? "…"
    : myTurn ? "À TOI !"
    : (turnPlayer?.name ?? "…").toUpperCase();
  const chrono = game.phase !== "playing" ? null
    : tourneeEnAttente ? tourneeReste
    : (!animating && !gel) ? resteTemps : null;
  const NOMS_CLAIRS = { A: "#7cc9e8", B: "#e8a08e", C: "#e6c977" };
  // Le fronton : une seule rangée, comme une plaque de comptage —
  // « ● CIEL 01 ●2 | MÈNE 4 ⏱19 À TOI | ROUGE 03 ●3 ● »
  const serre = equipes.length > 2;
  const blocEquipe = (t, miroir) => {
    const auTour = game.phase === "playing" && turnPlayer?.team === t;
    const tient = pointLive && pointLive.team === t;
    return (
      <div key={t} style={{ ...S.frontonEquipe, flexDirection: miroir ? "row-reverse" : "row",
                            background: auTour ? "rgba(242,236,220,0.1)" : "transparent" }}>
        <span style={{ ...S.pastille, width: 7, height: 7, background: TEAM_COLORS[t] }} />
        <span style={{ ...S.frontonNom, color: NOMS_CLAIRS[t], fontSize: serre ? 9 : 10 }}>{nomCourt(t)}</span>
        <span style={{ ...S.frontonScore, fontSize: serre ? 20 : 24 }}>{String(game.scores[t] || 0).padStart(2, "0")}</span>
        <span style={S.frontonInfo}>
          {game.mene && <span style={S.frontonItem}><Boule />{restantes(t)}</span>}
          {(game.drinks?.[t] || 0) > 0 && <span style={S.frontonItem}><Verre />{game.drinks[t]}</span>}
          {tient && <span style={S.frontonPoint}>+{pointLive.pts}</span>}
        </span>
      </div>
    );
  };
  const centre = (
    <div style={S.frontonCentre}>
      <span style={S.frontonMene}>MÈNE {game.mene?.num ?? "–"}</span>
      <span style={S.frontonLigne2}>
        {chrono !== null && (
          <span style={S.frontonChrono}>
            <Ico nom="horloge" taille={11} couleur="#ffd84d" epaisseur={2.6} />
            <span style={{ color: chrono <= 5 && !tourneeEnAttente ? "#ff8a6a" : "#ffd84d" }}>{chrono}</span>
          </span>
        )}
        <span style={S.frontonTour}>{ligneTour}</span>
      </span>
    </div>
  );
  const fronton = (
    <div style={S.fronton}>
      {blocEquipe(equipes[0], false)}
      {centre}
      {equipes.slice(1).map((t, i) => blocEquipe(t, i === equipes.length - 2))}
    </div>
  );

  // Rien n'est écrit sur le sable, et rien ne bouge le terrain : messages
  // passagers en ardoise posée sous le fronton, cri du Sud en plaque
  // posée sur le terrain — tout en position absolue.
  const texteArdoise = notice
    || (tourneeEnAttente && !(me && game.tourneePending === me.team) ? `${TEAM_NAMES[game.tourneePending]} choisit à qui offrir la tournée…` : null);

  const plaqueInfo = (texte, boutons) => (
    <div style={S.plaqueInfo}>
      <span style={S.plaqueInfoTexte}>{texte}</span>
      {boutons}
    </div>
  );
  const surimpressions = (
    <>
      {texteArdoise && <div style={S.ardoiseFlottante}>{texteArdoise}</div>}
      {cri && <div style={S.criPlaque}><span style={S.criTexte}>{cri}</span></div>}
      {!me && game.phase !== "finished" && plaqueInfo(
        <><Ico nom="oeil" taille={16} /> Tu regardes la partie.</>,
        placeLibre(game) && <button className="bs petit" onClick={entrerEnJeu}>ENTRER</button>)}
      {absentAProposer && plaqueInfo(
        absentAProposer.id === meId ? "Tu as laissé filer 3 lancers — un bot peut prendre la suite."
                                    : `${absentAProposer.name} a laissé filer 3 lancers.`,
        <>
          <button className="bs petit" onClick={() => remplacerParBot(absentAProposer.id)}><Ico nom="robot" taille={14} />{absentAProposer.id === meId ? "UN BOT POUR MOI" : "LE REMPLACER"}</button>
          <button className="bs petit creux" onClick={() => laisserJoueur(absentAProposer.id)}>{absentAProposer.id === meId ? "JE JOUE" : "L'ATTENDRE"}</button>
        </>)}
      {me?.bot && me.remplace && plaqueInfo(
        <><Ico nom="robot" taille={16} /> Un bot joue tes boules pendant ton absence.</>,
        <button className="bs petit" onClick={reprendreMain}>JE REPRENDS</button>)}
    </>
  );

  return (
    <div style={S.pageGame}>
      <style>{CSS_BASE}{CSS_IVRESSE}</style>
      {aide && <PanneauAide fermer={() => setAide(false)} revoirGeste={() => { setAide(false); setTuto(true); }} />}
      {tuto && !aide && <Didacticiel fermer={fermerTuto} />}
      {tourneeAnim && (
        <div style={S.voile}>
          <div style={S.tourneeVerres}>
            {[0, 0.18, 0.36].map((d, i) => (
              <span key={i} style={{ display: "inline-block", animation: `monterVerre .6s ${d}s ease-out both` }}><Verre grand /></span>
            ))}
          </div>
          <p style={{ ...S.tourneeTxt, animation: "trinquer .8s .55s both" }}>{tourneeAnim}</p>
        </div>
      )}
      {outils(true)}
      {tourneeEnAttente && me && !me.bot && game.tourneePending === me.team && (
        <div style={S.voile}>
          <div style={S.plaquePopin}>
            <Verre grand />
            <div style={S.popinTitre}>MÈNE GAGNÉE&nbsp;!</div>
            <div style={S.popinSous}>La tournée est pour…</div>
            {equipes.filter(t => t !== me.team).map(t => (
              <button key={t} className="bp" style={{ background: TEAM_COLORS[t], color: t === "C" ? NUIT : CREME, letterSpacing: 2, fontSize: 16 }}
                      onClick={() => offrirTournee(t)}>{nomLong(t)}</button>
            ))}
            <button className="bs creux" style={{ letterSpacing: 2 }} onClick={() => offrirTournee(null)}>PASSER · {tourneeReste}</button>
          </div>
        </div>
      )}
      {game.phase === "finished" ? (
        <>
          <style>{CSS_FETE}</style>
          <Confettis graine={game.winner + ":" + (game.rev || 0)} />
          <div style={{ ...S.plaquePopin, zIndex: 2, marginTop: 10 }}>
            <Trophee />
            <div style={{ ...S.popinTitre, color: TEAM_COLORS[game.winner] }}>{nomLong(game.winner)}</div>
            <div style={{ ...S.popinTitre, fontSize: 21 }}>GAGNE&nbsp;!</div>
            <div style={S.popinSous}>{equipes.map(t => `${nomCourt(t)} ${game.scores[t]}`).join("  —  ")}</div>
            {equipes.filter(t => t !== game.winner && game.scores[t] === 0).map(t => (
              <div key={t} style={S.fanny}>
                <div style={S.fannyTampon}>FANNY !</div>
                <div style={S.popinSous}>{TEAM_NAMES[t]} finit à zéro : {game.sansTournee ? "il faut embrasser Fanny." : "la tournée de pastis est pour eux."}</div>
              </div>
            ))}
            {isHost && <button className="bp" style={{ marginTop: 4 }} onClick={resetGame}>NOUVELLE PARTIE</button>}
          </div>
        </>
      ) : (
        <>
          <div ref={cadreRef} style={{
            ...S.cadreTerrain,
            ...(ivresseNiveau ? {
              animation: `tanguer ${Math.max(2.2, 5.5 - ivresseNiveau * 0.6)}s ease-in-out infinite`,
              filter: `blur(${Math.min(2.2, ivresseNiveau * 0.35)}px) sepia(${Math.min(0.5, ivresseNiveau * 0.08)}) saturate(${1 + ivresseNiveau * 0.06})`,
            } : {}),
          }}>
            <canvas ref={canvasRef} width={largeurVue} height={CANVAS_H} style={S.canvas}
              onPointerDown={surPointerDown} onPointerMove={surPointerMove}
              onPointerUp={surPointerUp} onPointerCancel={surPointerCancel} />
            {fronton}
            {surimpressions}
          </div>
          <div style={{ ...S.commandes, height: curseurs ? 150 : 52 }}>
            <div style={S.rangee}>
              <button className={mode === "point" ? "bp" : "bs"} disabled={!peutLancer || cochToThrow} style={{ flex: 1, letterSpacing: 2, fontSize: 17, padding: "10px 8px", minHeight: 44 }} onClick={() => setMode("point")}>POINTER</button>
              <button className={mode === "tir" ? "bp" : "bs"} disabled={!peutLancer || cochToThrow} style={{ flex: 1, letterSpacing: 2, fontSize: 17, padding: "10px 8px", minHeight: 44 }} onClick={() => setMode("tir")}>TIRER</button>
              <button className="bs" style={{ width: 50, padding: 0, minHeight: 44 }} aria-label="Options" title={curseurs ? "Lancer au doigt" : "Préférer les curseurs"} onClick={() => basculerCurseurs(!curseurs)}><Ico nom="engrenage" /></button>
            </div>
            {curseurs && (
              <div style={S.plaqueCurseurs}>
                <div style={S.ligneCurseur}>
                  <span style={S.etiquetteCurseur}>DIRECTION</span>
                  <input type="range" min={-T.angleMax} max={T.angleMax} value={angle} disabled={!peutLancer} onChange={e => setAngle(+e.target.value)} />
                </div>
                <div style={S.ligneCurseur}>
                  <span style={S.etiquetteCurseur}>{!cochToThrow && mode === "tir" ? "DISTANCE" : "FORCE"}</span>
                  <input type="range" min={25} max={100} value={power} disabled={!peutLancer} onChange={e => setPower(+e.target.value)} />
                </div>
                <button className="bp" disabled={!peutLancer} style={{ width: "100%", minHeight: 44, padding: "8px 10px" }} onClick={() => throwBoule()}>
                  {cochToThrow ? "LANCER LE COCHONNET" : mode === "tir" ? "TIRER !" : "LANCER"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Styles ------------------------------------------------

const styles = {
  page: {
    // Le body ne défile pas (index.html) : c'est cet écran qui défile lui-même,
    // il lui faut donc une hauteur fixe, pas un minimum
    height: "100dvh", overflowY: "auto", background: "linear-gradient(180deg, #27607e 0%, #333d24 62%, #232919 100%)",
    color: CREME, fontFamily: "'Oswald', -apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "24px 20px", boxSizing: "border-box", gap: 18,
  },
  // Écran de jeu : jamais de défilement, le terrain prend toute la place
  // que le fronton et les boutons lui laissent
  pageGame: {
    height: "100dvh", overflow: "hidden", background: "linear-gradient(180deg, #27607e 0%, #333d24 62%, #232919 100%)",
    color: CREME, fontFamily: "'Oswald', -apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "stretch",
    padding: "6px 0 6px", boxSizing: "border-box", gap: 6, // bord à bord
    maxWidth: 520, margin: "0 auto", // sur grand écran, le jeu reste une colonne
  },
  enseigne: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 8, textAlign: "center" },
  titre: {
    margin: 0, fontFamily: "'Alfa Slab One', serif", fontSize: 46, lineHeight: 1, color: CREME,
    textShadow: "3px 3px 0 rgba(16, 26, 16, 0.45)", letterSpacing: 1, fontWeight: 400,
  },
  titrePetit: {
    margin: 0, fontFamily: "'Alfa Slab One', serif", fontSize: 30, lineHeight: 1.1, color: CREME,
    textShadow: "3px 3px 0 rgba(16, 26, 16, 0.45)", letterSpacing: 1, fontWeight: 400,
  },
  accroche: { fontSize: 12, fontWeight: 600, letterSpacing: 2.5, color: "#8fd4f0" },
  // La plaque émaillée : crème, double liseré bleu nuit, ombre franche
  plaque: {
    width: "100%", maxWidth: 390, boxSizing: "border-box", background: CREME, color: NUIT,
    border: `3px solid ${NUIT}`, borderRadius: 6,
    boxShadow: `0 4px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 3px ${CREME}, inset 0 0 0 4px ${NUIT}`,
    padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12,
  },
  plaquePopin: {
    width: "100%", maxWidth: 330, boxSizing: "border-box", background: CREME, color: NUIT,
    border: `3px solid ${NUIT}`, borderRadius: 8,
    boxShadow: `0 5px 0 rgba(0, 0, 0, 0.45), inset 0 0 0 4px ${CREME}, inset 0 0 0 6px ${NUIT}`,
    padding: "26px 22px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center",
  },
  plaqueEquipe: {
    width: "100%", maxWidth: 390, boxSizing: "border-box", background: CREME, color: NUIT,
    border: `2px solid ${NUIT}`, borderRadius: 6, boxShadow: "0 3px 0 rgba(0, 0, 0, 0.35)",
    padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
  },
  plaqueInfo: { // surimpression au bas du terrain
    position: "absolute", left: 6, right: 6, bottom: 8, zIndex: 3, boxSizing: "border-box", background: CREME, color: NUIT,
    border: `2px solid ${NUIT}`, borderRadius: 4, boxShadow: "0 3px 0 rgba(0, 0, 0, 0.35)",
    padding: "6px 10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
  },
  plaqueInfoTexte: { flex: 1, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, minWidth: 140 },
  plaqueTitre: { fontFamily: "'Alfa Slab One', serif", fontSize: 21, lineHeight: 1.15, margin: 0, color: NUIT, textAlign: "center", fontWeight: 400 },
  popinTitre: { fontFamily: "'Alfa Slab One', serif", fontSize: 25, lineHeight: 1.1, color: NUIT, fontWeight: 400 },
  popinSous: { fontSize: 15, fontWeight: 500, letterSpacing: 0.5, color: NUIT, marginTop: -4 },
  pastilles: { display: "flex", gap: 8 },
  pastilleTuto: { width: 10, height: 10, borderRadius: "50%", border: `2px solid ${NUIT}`, boxSizing: "border-box" },
  etiquette: { fontSize: 12, fontWeight: 600, letterSpacing: 1.5, color: NUIT },
  note: { fontSize: 12, lineHeight: 1.4, margin: "-4px 0 0", color: NUIT, opacity: 0.75, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" },
  rangee: { display: "flex", gap: 8, alignItems: "stretch" },
  segment: { flex: 1, padding: "10px 6px", fontSize: 15, letterSpacing: 1, minHeight: 46 },
  large: { width: "100%", maxWidth: 390, boxSizing: "border-box" },
  outils: { display: "flex", justifyContent: "center", gap: 8, padding: "0 6px" },
  pastille: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  equipeTete: { display: "flex", alignItems: "center", gap: 8 },
  equipeNom: { fontSize: 15, fontWeight: 700, letterSpacing: 2 },
  puces: { display: "flex", flexWrap: "wrap", gap: 6 },
  // L'ardoise : bande opaque, texte crème, une ligne
  ardoise: {
    background: ARDOISE, color: CREME, fontSize: 12, fontWeight: 500, letterSpacing: 0.5,
    padding: "7px 12px", textAlign: "center", borderRadius: 4, boxSizing: "border-box",
  },
  // Ardoise posée sous le fronton (messages passagers) : ne bouge rien
  ardoiseFlottante: {
    position: "absolute", left: 6, right: 6, top: 62, zIndex: 3,
    background: ARDOISE, color: CREME, fontSize: 12, fontWeight: 500, letterSpacing: 0.5,
    padding: "5px 12px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  // Le cri du Sud : plaque posée sur le terrain, le temps de le dire
  criPlaque: {
    position: "absolute", left: 16, right: 16, top: "42%", zIndex: 4, boxSizing: "border-box",
    background: CREME, color: NUIT, border: `3px solid ${NUIT}`, borderRadius: 6,
    boxShadow: `0 4px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 3px ${CREME}, inset 0 0 0 4px ${NUIT}`,
    padding: "12px 14px", textAlign: "center", animation: "trinquer .5s both",
  },
  criTexte: { fontFamily: "'Alfa Slab One', serif", fontSize: 19, lineHeight: 1.2, letterSpacing: 0.5 },
  // Le terrain : pleine largeur, fin cadre bois ; les bandeaux s'y collent
  // Le terrain : bord à bord, fin cadre bois, fond sable uni ; le fronton
  // est planté dessus, en haut
  cadreTerrain: {
    position: "relative", flex: 1, minHeight: 0, width: "100%", boxSizing: "border-box",
    borderTop: "5px solid #8a6b43", borderBottom: "5px solid #8a6b43", overflow: "hidden",
    // ciel en haut (le vide éventuel passe sous le fronton), sable hors-jeu ailleurs
    background: "linear-gradient(180deg, #3f95cd 0, #3f95cd 12%, #cdb992 12%, #cdb992 100%)",
    display: "flex", justifyContent: "center", alignItems: "flex-start",
  },
  // Le canvas remplit le cadre ; l'image garde son ratio, calée en bas —
  // l'éventuel vide du haut est du ciel, sous le fronton
  canvas: {
    display: "block", width: "100%", height: "100%", objectFit: "contain", objectPosition: "50% 100%",
    touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
  },
  commandes: { display: "flex", flexDirection: "column", gap: 6, padding: "0 6px", boxSizing: "border-box", flexShrink: 0 },
  plaqueCurseurs: {
    background: CREME, color: NUIT, border: `2px solid ${NUIT}`, borderRadius: 4,
    boxShadow: "0 3px 0 rgba(0, 0, 0, 0.35)", padding: "4px 8px 6px", display: "flex", flexDirection: "column", gap: 2,
  },
  ligneCurseur: { display: "flex", alignItems: "center", gap: 8, minHeight: 32 },
  etiquetteCurseur: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, width: 78, flexShrink: 0 },
  // Le fronton du boulodrome
  // Le fronton, plaque de comptage plantée en haut du terrain : une seule
  // rangée, tout inline, chiffres lumineux
  fronton: {
    position: "absolute", top: 6, left: 6, right: 6, zIndex: 3, boxSizing: "border-box", height: 52,
    background: NUIT, border: "2px solid #10222f", borderRadius: 6,
    boxShadow: "0 4px 0 rgba(0, 0, 0, 0.4), inset 0 0 0 2px rgba(242, 236, 220, 0.35)",
    padding: "0 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
  },
  frontonEquipe: { flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", gap: 5, borderRadius: 4, padding: "2px 4px", whiteSpace: "nowrap" },
  frontonNom: { fontWeight: 600, letterSpacing: 1.5 },
  frontonScore: { lineHeight: 1, fontWeight: 700, color: "#ffd84d", textShadow: "0 0 10px rgba(255, 216, 77, 0.55)" },
  frontonInfo: { display: "flex", alignItems: "center", gap: 5, color: CREME, fontSize: 11, fontWeight: 600 },
  frontonItem: { display: "flex", alignItems: "center", gap: 2 },
  frontonPoint: { background: PASTIS, color: NUIT, borderRadius: 3, padding: "0 3px", fontWeight: 700, fontSize: 10 },
  frontonCentre: {
    flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "0 8px", borderLeft: "1px solid rgba(242, 236, 220, 0.35)", borderRight: "1px solid rgba(242, 236, 220, 0.35)", whiteSpace: "nowrap",
  },
  frontonMene: { fontSize: 9, fontWeight: 600, letterSpacing: 2, color: CREME },
  frontonLigne2: { display: "flex", alignItems: "center", gap: 6 },
  frontonChrono: { display: "flex", alignItems: "center", gap: 2, fontSize: 14, fontWeight: 700 },
  frontonTour: { fontSize: 8.5, fontWeight: 600, letterSpacing: 1, color: CREME, opacity: 0.9, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis" },
  // Voile sombre des pop-ins
  voile: {
    position: "fixed", inset: 0, zIndex: 60, background: "rgba(16, 20, 11, 0.78)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
    padding: 20, boxSizing: "border-box", overflowY: "auto",
  },
  tourneeVerres: { display: "flex", gap: 14 },
  tourneeTxt: { fontFamily: "'Alfa Slab One', serif", fontSize: 21, color: PASTIS, textAlign: "center", maxWidth: 300, margin: 0, lineHeight: 1.3, fontWeight: 400 },
  confettis: { position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 },
  fanny: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  fannyTampon: {
    fontFamily: "'Alfa Slab One', serif", fontSize: 30, letterSpacing: 3, color: "#bd4f3a", fontWeight: 400,
    border: "4px solid #bd4f3a", borderRadius: 6, padding: "2px 14px",
    animation: "tampon .7s .5s cubic-bezier(.2,1.2,.4,1) both",
  },
  aideTitre2: { fontSize: 13, fontWeight: 700, letterSpacing: 1.5, margin: "0 0 2px", color: NUIT, textTransform: "uppercase" },
  aideTexte: { fontSize: 13, lineHeight: 1.5, margin: 0, color: NUIT, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" },
};
