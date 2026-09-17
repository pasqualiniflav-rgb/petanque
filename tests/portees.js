// Banc numérique des portées : compare l'ancien modèle (la boule roule dès
// le rond) au modèle actuel (elle vole une part de sa portée, puis roule)
// sur les deux terrains, et vérifie que la simulation est déterministe.
//   npx esbuild tests/portees.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/portees.cjs && node /tmp/portees.cjs
import { TERRAINS, stepPhysics, corpsLance } from "../App.jsx";

const R_BOULE = 11, R_COCH = 6;
const depart = T => ({ x: T.W / 2, y: T.L - 30 });

function simuler(T, corps) {
  const bodies = [corps];
  let n = 0;
  while (stepPhysics(bodies, T) && n++ < 1200) {}
  const d = depart(T);
  return { dist: Math.hypot(corps.x - d.x, corps.y - d.y), frames: n, dead: !!corps.dead };
}
// l'ancien modèle : même vitesse, aucune phase en l'air
function ancien(T, genre, p) {
  const d = depart(T);
  const v = T.vPoint(p) * (genre === "coch" ? T.cochVif : 1);
  return { x: d.x, y: d.y, r: genre === "coch" ? R_COCH : R_BOULE, mass: genre === "coch" ? 0.35 : 1,
           kind: genre === "coch" ? "coch" : "boule", vx: 0, vy: -v };
}

let echecs = 0;
const verif = (ok, msg) => { if (!ok) { echecs++; console.log("  ✗ " + msg); } };

for (const [cle, T] of Object.entries(TERRAINS)) {
  console.log(`\n=== ${T.nom} (${T.W} x ${T.L}, cochonnet min ${T.cochMin}) ===`);
  for (const genre of ["point", "coch"]) {
    const vol = genre === "coch" ? T.volCoch : T.volPoint;
    console.log(`-- ${genre === "coch" ? "cochonnet" : "pointé"} : ${Math.round(vol * 100)} % de la portée en vol`);
    console.log("  force   ancien   nouveau   en vol   écart");
    for (const p of [25, 40, 55, 70, 85, 100]) {
      const a = simuler(T, ancien(T, genre, p));
      const c = corpsLance(T, genre, p, 0, {});
      const enVol = c.air;
      const b = simuler(T, c);
      const ecart = (b.dist - a.dist) / a.dist;
      console.log(`  ${String(p).padStart(4)}   ${a.dist.toFixed(0).padStart(6)}   ${b.dist.toFixed(0).padStart(7)}   ${enVol.toFixed(0).padStart(6)}   ${(ecart * 100).toFixed(1).padStart(5)} %${b.dead ? "  (morte)" : ""}`);
      verif(Math.abs(ecart) < 0.03 || b.dead === a.dead && b.dead, `${cle} ${genre} p=${p} : portée ${b.dist.toFixed(0)} vs ${a.dist.toFixed(0)} (écart ${(ecart*100).toFixed(1)} %)`);
      // déterminisme : deux simulations identiques donnent le même résultat au bit près
      const c2 = corpsLance(T, genre, p, 0.1, {}), c3 = corpsLance(T, genre, p, 0.1, {});
      simuler(T, c2); simuler(T, c3);
      verif(c2.x === c3.x && c2.y === c3.y, `${cle} ${genre} p=${p} : non déterministe`);
    }
    if (genre === "coch") {
      const min = simuler(T, corpsLance(T, "coch", 25, 0, {})).dist;
      console.log(`  cochonnet à la force minimale : ${min.toFixed(0)} px (minimum réglementaire ${T.cochMin})`);
    }
  }
}
console.log(echecs ? `\n${echecs} écart(s) hors tolérance` : "\nTout est dans la tolérance (±3 %), simulation déterministe.");
process.exit(echecs ? 1 : 0);
