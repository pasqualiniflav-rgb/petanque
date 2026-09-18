// Qui joue pour un bot ? La règle doit couvrir les bots du salon, ceux qui
// arrivent en cours de partie, et un joueur remplacé — hôte compris.
//   npx esbuild tests/bots.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/bots.cjs && node /tmp/bots.cjs
import { doitJouerPourLeBot, meneurDe, coupDuBot, TERRAINS } from "../App.jsx";

let echecs = 0;
const verif = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✗ ") + msg); if (!ok) echecs++; };

const partie = (players, left) => ({
  phase: "playing", players, scores: {}, drinks: {}, terrain: "classique",
  mene: { num: 1, firstTeam: "A", cochonnet: { x: 170, y: 200 }, boules: [], left },
});
const H = { id: "h", name: "Hôte", team: "A" }, I = { id: "i", name: "Invité", team: "B" };
const BOT = { id: "b", name: "Marius", team: "C", bot: true, niveau: "pointeur" };

console.log("Bot du salon, hôte présent");
let st = partie([H, I, BOT], { h: 0, i: 0, b: 1 });
verif(doitJouerPourLeBot(st, "h", 0), "l'hôte joue tout de suite");
verif(!doitJouerPourLeBot(st, "i", 0), "l'invité attend");
verif(doitJouerPourLeBot(st, "i", 3000), "l'invité joue après 3 s de grâce (hôte disparu)");

console.log("Bot arrivé en cours de partie (sans boule cette mène, puis avec)");
const TARD = { id: "t", name: "Tardif", team: "B", bot: true, niveau: "fada" };
st = partie([H, I, TARD], { h: 0, i: 0, t: 0 });
verif(!doitJouerPourLeBot(st, "h", 0), "sans boule, personne n'a rien à jouer pour lui");
st = partie([H, I, TARD], { h: 0, i: 0, t: 2 });
verif(doitJouerPourLeBot(st, "h", 0), "avec ses boules, l'hôte joue pour lui");

console.log("Joueur remplacé par un bot");
const IR = { ...I, bot: true, remplace: true, niveau: "fanny" };
st = partie([H, IR, BOT], { h: 0, i: 1, b: 0 });
verif(meneurDe(st).id === "h", "l'hôte reste l'hôte");
verif(doitJouerPourLeBot(st, "h", 0), "l'hôte joue pour l'invité remplacé");

console.log("Hôte remplacé, seul humain (solo)");
const HR = { ...H, bot: true, remplace: true, niveau: "pointeur" };
st = partie([HR, BOT], { h: 1, b: 0 });
verif(meneurDe(st).id === "h", "son appareil reste le meneur");
verif(doitJouerPourLeBot(st, "h", 0), "il joue pour son propre bot");

console.log("Lancer déjà annoncé");
st = { ...partie([H, I, BOT], { h: 0, i: 0, b: 1 }), enCours: true };
verif(!doitJouerPourLeBot(st, "h", 0) && !doitJouerPourLeBot(st, "i", 9000), "personne ne double un lancer en cours");

console.log("Le cerveau accepte un joueur remplacé");
const coup = coupDuBot(partie([H, IR, BOT], { h: 0, i: 1, b: 0 }), TERRAINS.classique, IR);
verif(Number.isFinite(coup.angle) && coup.power >= 25 && coup.power <= 100, `coup valide : angle ${coup.angle}, force ${coup.power}, ${coup.mode}`);

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout passe.");
process.exit(echecs ? 1 : 0);
