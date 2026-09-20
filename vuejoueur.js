// LE SECOND RENDU : vue à la 3ᵉ personne, caméra basse derrière le cercle.
// Il ne touche à rien de la physique : c'est une PROJECTION à l'affichage.
// Aucune coordonnée écran ne remonte dans le moteur.
import { charteDe } from "./chartes.js";

// Un seul point d'entrée pour la projection. Il prend une position du
// terrain et rend une position écran plus une échelle. Tout passe par lui :
// boules, cochonnet, figures, cercle, panneau.
// `camY` : la ligne du terrain derrière laquelle se tient la caméra. Au repos
// c'est le cercle de lancer — tout le monde lance du même endroit, la caméra
// ne bouge donc pas de la mène. Pendant un vol, elle avance avec la boule.
export function vueDe(T, largeur, hauteur, camY) {
  const cam = camY == null ? T.L - 30 : camY;
  return {
    f: 0.14 * T.L,                       // « focale » : règle l'écrasement
    cx: largeur / 2,
    horizon: Math.round(hauteur * 0.16), // ligne d'horizon, sous la bande fixe
    bas: hauteur - Math.round(hauteur * 0.06),
    ex: (largeur * 0.8) / Math.max(1, T.W / 2),
    cam, largeur, hauteur,
  };
}
export function projeter(v, T, x, y) {
  const d = Math.max(0, v.cam - y);
  const k = v.f / (v.f + d);
  return { x: v.cx + (x - T.W / 2) * k * v.ex, y: v.horizon + (v.bas - v.horizon) * k, k };
}
// Où doit se tenir la caméra à cette image : derrière la boule qui vole,
// sinon derrière le cercle. Entièrement déduit de l'état déjà partagé —
// qui joue, ce qu'il lance, où la boule en est. Rien de neuf à diffuser.
export function cameraVisee(T, corps, depart, precedent) {
  let cible = null, vmax = 0.6;
  for (const b of corps) {
    if (b.dead) continue;
    const sp = Math.hypot(b.vx || 0, b.vy || 0);
    if (sp > vmax) { vmax = sp; cible = b; }
  }
  const repos = depart.y;
  const voulu = cible ? Math.min(repos, cible.y + T.L * 0.14) : repos;
  if (precedent == null) return voulu;
  // lissage : la caméra décroche et revient sans à-coup
  return precedent + (voulu - precedent) * (cible ? 0.18 : 0.08);
}

const R_BOULE_VUE = 16; // les boules sont volontairement grossies
const R_COCH_VUE = 9;

export function dessinerVueJoueur(ctx, st, corps, aim, T, opts) {
  const { largeur, hauteur, charte, depart, figures } = opts;
  const C = charteDe(charte);
  const v = vueDe(T, largeur, hauteur, opts.camY);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, largeur, hauteur);

  // --- le sol, en perspective : du sable clair au loin, plus chaud au pied
  const sol = ctx.createLinearGradient(0, v.horizon, 0, hauteur);
  sol.addColorStop(0, C.sable);
  sol.addColorStop(1, ombrer(C.sable, -18));
  ctx.fillStyle = sol;
  ctx.fillRect(0, v.horizon, largeur, hauteur - v.horizon);

  // --- les lignes du terrain, projetées
  ctx.strokeStyle = C.lignes; ctx.lineWidth = 2;
  const cote = (x) => {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const y = (T.L / 24) * i;
      const p = projeter(v, T, x, y);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  };
  cote(4); cote(T.W - 4);
  // ligne de fond
  ctx.beginPath();
  const g = projeter(v, T, 4, 4), d2 = projeter(v, T, T.W - 4, 4);
  ctx.moveTo(g.x, g.y); ctx.lineTo(d2.x, d2.y); ctx.stroke();

  // --- le cercle de lancer, au pied de la caméra
  const c0 = projeter(v, T, depart.x, depart.y);
  ctx.strokeStyle = "#8a6b43"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c0.x, c0.y, 26 * c0.k * v.ex * 0.5 + 18, 9 + 6 * c0.k, 0, 0, Math.PI * 2);
  ctx.stroke();

  // --- le repère de visée, en pointillés, partant du cercle
  if (aim && aim.trace) {
    const rad = (aim.angle * Math.PI) / 180;
    ctx.save();
    ctx.strokeStyle = "rgba(107,87,58,0.6)"; ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const dd = (T.L * 0.16 / 12) * i;
      const p = projeter(v, T, depart.x + Math.sin(rad) * dd, depart.y - Math.cos(rad) * dd);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --- les corps, du plus loin au plus près
  const tries = corps.filter(b => !b.dead).slice().sort((a, b) => a.y - b.y);
  for (const b of tries) {
    const p = projeter(v, T, b.x, b.y);
    const coch = b.kind === "coch";
    const r = Math.max(2.5, (coch ? R_COCH_VUE : R_BOULE_VUE) * p.k);
    const vol = (b.air || 0) > 0 ? Math.min(26, b.air * 0.08) : 0;
    // ombre au sol : elle reste au sol quand la boule vole
    ctx.fillStyle = "rgba(70,55,30,0.30)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.05, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    const cy = p.y - vol - r * 0.35;
    const grad = ctx.createRadialGradient(p.x - r * 0.35, cy - r * 0.4, r * 0.1, p.x, cy, r);
    const ton = coch ? "#c67f1e" : (opts.couleurs[b.team] || "#999");
    grad.addColorStop(0, eclaircir(ton, 70));
    grad.addColorStop(0.55, ton);
    grad.addColorStop(1, ombrer(ton, -55));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  // --- la figure du lanceur, de dos, dans le cercle
  if (figures && figures.lanceur) {
    dessinerVillageois(ctx, c0, figures.lanceur, opts.couleurs, C, {
      angle: aim ? aim.angle : 0, geste: opts.geste || 0, mode: opts.mode,
    });
  }
  return v;
}

// Le villageois de dos : silhouette, foulard d'équipe, numéro dans le dos.
// Le polo personnel ne s'affiche PAS ici — sur le terrain, l'équipe prime.
// `pose.geste` va de 0 à 1 pendant le lancer : balancier ample pour le
// pointé, élan sec pour le tir. `pose.angle` fait pivoter la figure quand le
// joueur règle sa direction.
export function dessinerVillageois(ctx, p, fig, couleurs, C, pose) {
  const h = 74;                       // hauteur au premier plan
  const l = h * 0.42;
  const g = pose ? Math.max(0, Math.min(1, pose.geste || 0)) : 0;
  const tir = pose && pose.mode === "tir";
  // le balancier : ample et lent au pointé, court et sec au tir
  const bras = g > 0 ? Math.sin(g * Math.PI) * (tir ? 0.5 : 1) : 0;
  const x = p.x + (pose ? Math.sin(((pose.angle || 0) * Math.PI) / 180) * l * 0.18 : 0);
  const y = p.y - 4 + bras * (tir ? 3 : 6);
  const teinte = couleurs[fig.team] || "#888";
  ctx.save();
  if (pose && pose.angle) {
    ctx.translate(p.x, p.y);
    ctx.rotate(((pose.angle || 0) * Math.PI) / 180 * 0.35);
    ctx.translate(-p.x, -p.y);
  }
  // ombre au sol
  ctx.fillStyle = "rgba(70,55,30,0.28)";
  ctx.beginPath(); ctx.ellipse(x, y + 2, l * 0.62, 6, 0, 0, Math.PI * 2); ctx.fill();
  // corps : tunique neutre, jamais la couleur du polo
  ctx.fillStyle = "#e8dfc8"; ctx.strokeStyle = C.trait; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - l * 0.5, y);
  ctx.quadraticCurveTo(x - l * 0.52, y - h * 0.5, x - l * 0.3, y - h * 0.58);
  ctx.lineTo(x + l * 0.3, y - h * 0.58);
  ctx.quadraticCurveTo(x + l * 0.52, y - h * 0.5, x + l * 0.5, y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // foulard : c'est lui qui porte l'équipe
  ctx.fillStyle = teinte;
  ctx.beginPath();
  ctx.moveTo(x - l * 0.34, y - h * 0.58);
  ctx.lineTo(x + l * 0.34, y - h * 0.58);
  ctx.lineTo(x + l * 0.26, y - h * 0.5);
  ctx.lineTo(x - l * 0.26, y - h * 0.5);
  ctx.closePath(); ctx.fill();
  // numéro dans le dos, dimensionné pour se lire du fond du terrain
  ctx.fillStyle = teinte;
  ctx.beginPath(); ctx.arc(x, y - h * 0.34, l * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#4a2f16"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(l * 0.4)}px 'Oswald', sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(fig.num ?? ""), x, y - h * 0.33);
  // tête et couvre-chef
  ctx.fillStyle = "#e0a878"; ctx.strokeStyle = C.trait; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y - h * 0.72, l * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = fig.chef === "paille" ? "#ecd9a0" : fig.chef === "casquette" ? "#2d4a68" : C.trait;
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.82, l * (fig.chef === "paille" ? 0.52 : 0.34), l * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // le bras qui lance, pendant le geste
  if (g > 0) {
    ctx.strokeStyle = "#e0a878"; ctx.lineWidth = l * 0.17; ctx.lineCap = "round";
    const a = (tir ? -1.5 : -2.2) + bras * (tir ? 1.7 : 2.6);
    ctx.beginPath();
    ctx.moveTo(x + l * 0.42, y - h * 0.52);
    ctx.lineTo(x + l * 0.42 + Math.cos(a) * l * 0.62, y - h * 0.52 + Math.sin(a) * l * 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

function canal(hex, i) { return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16); }
function ombrer(hex, d) {
  const c = [0, 1, 2].map(i => Math.max(0, Math.min(255, canal(hex, i) + d)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const eclaircir = (hex, d) => ombrer(hex, d);
