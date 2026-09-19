// Règle d'or du tir : à force égale, un tir porte à la même distance
// qu'un pointé (écart ≤ 5 % aux forces 25/50/75/100, deux terrains).
// Et une boule de tir qui ne frappe rien glisse puis roule après la chute
// (~60-90 px en classique, ~150-220 px en long).
//   npx esbuild tests/tir.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/tir.cjs && node /tmp/tir.cjs
import { TERRAINS, stepPhysics, corpsLance } from "../App.jsx";
let echecs = 0;
const verif = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✗ ") + msg); if (!ok) echecs++; };
const portee = (T, genre, p) => { const c = corpsLance(T, genre, p, 0, {}); const b = [c]; let n = 0; while (stepPhysics(b, T) && n++ < 1200) {} return { d: Math.hypot(c.x - T.W / 2, c.y - (T.L - 30)), dead: !!c.dead, air: c.air0 }; };
for (const [cle, T] of Object.entries(TERRAINS)) {
  console.log(`\n=== ${T.nom} ===\n  force   pointé     tir    écart   glisse après la chute`);
  const [gmin, gmax] = cle === "classique" ? [60, 90] : [150, 220];
  for (const p of [25, 50, 75, 100]) {
    const a = portee(T, "point", p), b = portee(T, "tir", p);
    const glisse = b.d - T.airTir(p);
    const e = (b.d - a.d) / a.d;
    const mort = a.dead || b.dead;
    console.log(`  ${String(p).padStart(4)}   ${a.d.toFixed(0).padStart(6)}  ${b.d.toFixed(0).padStart(6)}   ${(e * 100).toFixed(1).padStart(5)} %   ${glisse.toFixed(0).padStart(5)} px${mort ? "  (au fond)" : ""}`);
    if (!mort) verif(Math.abs(e) <= 0.05, `force ${p} : écart pointé/tir ${(e * 100).toFixed(1)} %`);
    if (!mort) verif(glisse >= gmin && glisse <= gmax, `force ${p} : glisse ${glisse.toFixed(0)} px dans [${gmin}, ${gmax}]`);
  }
}
console.log(echecs ? `\n${echecs} échec(s)` : "\nTout passe.");
process.exit(echecs ? 1 : 0);
