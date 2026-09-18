// Boules mortes : une boule qui franchit une ligne garde sa vitesse, roule
// encore sans toucher personne et s'arrête dans la bande hors-jeu ; elle
// est conservée avec dead:true, exclue du score et des tours. Et tout ça
// au bit près, deux fois de suite.
//   npx esbuild tests/mortes.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/mortes.cjs && node /tmp/mortes.cjs
import { TERRAINS, stepPhysics, corpsLance, scoreMene, nextToPlay } from "../App.jsx";
const R = 11;
let echecs = 0;
const verif = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✗ ") + msg); if (!ok) echecs++; };
const rouler = bodies => { let n = 0; while (stepPhysics(bodies, T) && n++ < 1200) {} return n; };
let T;
for (const cle of ["classique", "long"]) {
  T = TERRAINS[cle];
  console.log(`\n=== ${T.nom} ===`);
  // sortie par le côté : angle plein, forte puissance
  const partie = () => {
    const temoin = { x: T.W / 2 + 20, y: T.L * 0.4, r: R, mass: 1, vx: 0, vy: 0, kind: "boule", team: "B" };
    const b = corpsLance(T, "point", 100, (T.angleMax * Math.PI) / 180, { team: "A" });
    const bodies = [temoin, b];
    rouler(bodies);
    return { b, temoin };
  };
  const p1 = partie(), p2 = partie();
  verif(p1.b.dead, `sortie par le côté : morte (x = ${p1.b.x.toFixed(1)}, y = ${p1.b.y.toFixed(1)})`);
  verif(p1.b.x > T.W || p1.b.y < 0, "elle s'est arrêtée hors des lignes");
  verif(p1.b.x <= T.W + 28 - R + 1e-9 && p1.b.y >= -28 + R - 1e-9, "dans la bande hors-jeu, contre la planche");
  verif(Math.hypot(p1.b.vx, p1.b.vy) === 0, "et immobile");
  verif(p1.b.x === p2.b.x && p1.b.y === p2.b.y && p1.temoin.x === p2.temoin.x, "au bit près sur deux simulations");
  // sortie par le fond : tout droit, pleine force
  const fond = corpsLance(T, "point", 100, 0, { team: "A" });
  const bf = [fond]; rouler(bf);
  verif(fond.dead && fond.y < 4, `sortie par le fond : morte, y = ${fond.y.toFixed(1)}`);
  // une morte ne touche plus personne
  const cible = { x: T.W / 2, y: 2, r: R, mass: 1, vx: 0, vy: 0, kind: "boule", team: "B", dead: true };
  const vivante = { x: T.W / 2, y: 40, r: R, mass: 1, vx: 0, vy: -3, kind: "boule", team: "A" };
  const bc = [cible, vivante]; rouler(bc);
  verif(cible.x === T.W / 2 && cible.y === 2, "une morte posée n'est pas bousculée par une vivante");
  // règles : les mortes ne comptent ni au score ni pour le tour
  const st = { phase: "playing", players: [{ id: "a", team: "A" }, { id: "b", team: "B" }], scores: {},
    mene: { num: 1, firstTeam: "A", cochonnet: { x: 170, y: 200 },
            boules: [{ x: 172, y: 202, team: "A", dead: true }, { x: 170, y: 260, team: "B" }], left: { a: 1, b: 0 } } };
  verif(scoreMene(st).team === "B", "score : la boule A morte, pourtant plus proche, ne compte pas");
  verif(nextToPlay(st) === "a", "tour : A n'a rien de valable, c'est à A de rejouer");
}
console.log(echecs ? `\n${echecs} échec(s)` : "\nTout passe.");
process.exit(echecs ? 1 : 0);
