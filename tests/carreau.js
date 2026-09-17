// Banc du carreau : pour une boule cible posée devant, quelle plage de
// force (donc de longueur de geste) permet de la déloger ? Plus la plage
// est large, plus le tir est facile.
import { TERRAINS, stepPhysics, corpsLance } from "../App.jsx";
const R_BOULE = 11;
for (const [cle, T] of Object.entries(TERRAINS)) {
  const DEP = { x: T.W / 2, y: T.L - 30 };
  for (const dist of (cle === "classique" ? [200, 300, 400] : [1000, 1600, 2200])) {
    const cible0 = { x: DEP.x, y: DEP.y - dist };
    const parForce = [];
    for (let p = 25; p <= 100; p += 0.5) {
      const cible = { ...cible0, r: R_BOULE, mass: 1, vx: 0, vy: 0, kind: "boule", team: "B" };
      const tir = corpsLance(T, "tir", p, 0, { team: "A" });
      const bodies = [cible, tir];
      let n = 0; while (stepPhysics(bodies, T) && n++ < 1200) {}
      const deplace = Math.hypot(cible.x - cible0.x, cible.y - cible0.y);
      const carreau = deplace > 25 && Math.hypot(tir.x - cible0.x, tir.y - cible0.y) < 2.5 * R_BOULE && !tir.dead;
      parForce.push({ p, touche: deplace > 25, carreau });
    }
    const touche = parForce.filter(x => x.touche).map(x => x.p);
    const carr = parForce.filter(x => x.carreau).map(x => x.p);
    const px = u => (u * 190 / 75).toFixed(0); // 75 unités de force = 190 px de geste
    console.log(`${T.nom.padEnd(10)} cible à ${String(dist).padStart(4)} px : touche pour p∈[${Math.min(...touche)}, ${Math.max(...touche)}] (${touche.length * 0.5} unités = ${px(touche.length * 0.5)} px de geste) ; carreau ${carr.length ? `p∈[${Math.min(...carr)}, ${Math.max(...carr)}] (${px(carr.length * 0.5)} px)` : "jamais"}`);
  }
}
