// Sensations de jeu : les vitesses ont été multipliées par 1,7 en
// conservant les portées. Ce banc compare aux portées de référence
// (tests/portees-reference.json, figées avant l'accélération) à ±2 %,
// mesure la durée d'un pointé, vérifie qu'aucun sous-pas ne dépasse
// 11 px (pas de tunnel) et que le carreau reste possible.
//   npx esbuild tests/vitesse.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/vitesse.cjs && node /tmp/vitesse.cjs
import { TERRAINS, stepPhysics, corpsLance } from "../App.jsx";
import { readFileSync } from "fs";
const ref = JSON.parse(readFileSync("tests/portees-reference.json", "utf8"));
const R = 11;
let echecs = 0;
const verif = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✗ ") + msg); if (!ok) echecs++; };
for (const [cle, T] of Object.entries(TERRAINS)) {
  console.log(`\n=== ${T.nom} ===`);
  let pire = 0;
  // le tir n'est plus comparé à la référence : sa portée est asservie au
  // pointé (tests/tir.js)
  for (const genre of ["point", "coch"]) for (const p of [25, 40, 55, 70, 85, 100]) {
    const c = corpsLance(T, genre, p, 0, {}); const b = [c]; let n = 0;
    while (stepPhysics(b, T) && n++ < 1200) {}
    const d = Math.hypot(c.x - T.W / 2, c.y - (T.L - 30));
    const r = ref[cle][genre][p];
    if (r.dead || c.dead) continue; // une boule au fond ne mesure rien
    pire = Math.max(pire, Math.abs(d - r.portee) / r.portee);
  }
  verif(pire <= 0.02, `portées conservées : écart maximal ${(pire * 100).toFixed(2)} % (référence avant accélération)`);
  for (const p of [40, 55, 70]) {
    const c = corpsLance(T, "point", p, 0, {}); const b = [c]; let n = 0;
    while (stepPhysics(b, T) && n++ < 1200) {}
    const s = n / 60, sref = ref[cle].point[p].frames / 60;
    verif(s <= 2.6, `pointé à ${p} : ${s.toFixed(2)} s (avant : ${sref.toFixed(2)} s)`);
  }
  const vmax = Math.max(T.vPoint(100) * T.cochVif, T.vTir) / T.subSteps;
  verif(vmax < 11, `déplacement maximal par sous-pas : ${vmax.toFixed(1)} px (${T.subSteps} sous-pas)`);
  // le carreau : une cible devant, une plage de force qui la déloge en laissant la frappante sur place
  const dist = cle === "classique" ? 300 : 1600, cible0 = { x: T.W / 2, y: T.L - 30 - dist };
  const carreaux = [];
  for (let p = 25; p <= 100; p += 0.5) {
    const cible = { ...cible0, r: R, mass: 1, vx: 0, vy: 0, kind: "boule", team: "B" };
    const tir = corpsLance(T, "tir", p, 0, { team: "A" }); const b = [cible, tir]; let n = 0;
    while (stepPhysics(b, T) && n++ < 1200) {}
    const deplace = Math.hypot(cible.x - cible0.x, cible.y - cible0.y);
    if (deplace > 25 && Math.hypot(tir.x - cible0.x, tir.y - cible0.y) < 2.5 * R && !tir.dead) carreaux.push({ p, deplace, reste: Math.hypot(tir.x - cible0.x, tir.y - cible0.y) });
  }
  verif(carreaux.length > 0, `carreau possible : ${carreaux.length * 0.5} unités de force (${(carreaux.length * 0.5 * 190 / 75).toFixed(0)} px de geste)`);
  if (carreaux.length) {
    const m = carreaux[Math.floor(carreaux.length / 2)];
    console.log(`    plein fer à p=${m.p} : la frappée file à ${m.deplace.toFixed(0)} px, la frappante reste à ${m.reste.toFixed(0)} px de l'impact`);
  }
}
console.log(echecs ? `\n${echecs} échec(s)` : "\nTout passe.");
process.exit(echecs ? 1 : 0);
