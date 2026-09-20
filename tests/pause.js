// La pause partagée : elle entre dans l'état de partie, sans horodatage.
// Polarité : autorisée UNIQUEMENT si la partie est marquée privée — un
// marqueur oublié interdit la pause.
import { peutPauser, poserPause, leverPause, expirerPause, nextToPlay, cleDuTour } from "../App.jsx";

let ko = 0;
const ok = (b, m) => { console.log((b ? "  ✓ " : "  ✗ ") + m); if (!b) ko++; };

const base = (extra = {}) => ({
  rev: 1000, phase: "playing", terrain: "classique", privee: true, pause: null,
  players: [
    { id: "p1", name: "Fernand", team: "A" },
    { id: "p2", name: "Marius", team: "B" },
  ],
  scores: { A: 0, B: 0 }, drinks: { A: 0, B: 0 }, absents: {},
  mene: { num: 3, cochonnet: { x: 170, y: 120 }, boules: [], left: { p1: 3, p2: 3 } },
  ...extra,
});

console.log("=== La pause partagée ===");
const auTour = nextToPlay(base());
const pasAuTour = auTour === "p1" ? "p2" : "p1";
console.log(`  (c'est à ${auTour} de jouer)`);

console.log("\n-- Polarité : privée seulement --");
{
  ok(peutPauser(base(), auTour) === true, "partie marquée privée : pause autorisée");
  ok(peutPauser(base({ privee: false }), auTour) === false, "partie classée (privee: false) : refusée");
  const sansMarqueur = base(); delete sansMarqueur.privee;
  ok(peutPauser(sansMarqueur, auTour) === false, "MARQUEUR OUBLIÉ : refusée — la polarité penche du bon côté");
  ok(peutPauser(base({ privee: "oui" }), auTour) === false, "marqueur mal typé : refusée");
}

console.log("\n-- Seul le joueur dont c'est le tour --");
{
  ok(peutPauser(base(), pasAuTour) === false, `${pasAuTour} n'est pas au tour : refusée`);
  const st = base();
  ok(poserPause(st, pasAuTour) === false && st.pause === null, "... et l'écriture ne passe pas non plus");
  ok(poserPause(st, auTour) === true && st.pause.par === auTour, `${auTour} met en pause`);
  ok(poserPause(st, auTour) === false, "deux fois de suite : refusé, une pause est déjà posée");
}

console.log("\n-- Aucun horodatage dans l'état partagé --");
{
  const st = base(); poserPause(st, auTour);
  const champs = Object.keys(st.pause).sort().join(",");
  ok(champs === "par,tour", `l'objet pause ne porte que { par, tour } — trouvé : ${champs}`);
  const valeurs = JSON.stringify(st.pause);
  ok(!/\d{12,}/.test(valeurs), `aucune valeur ressemblant à une horloge — ${valeurs}`);
  ok(st.pause.tour === cleDuTour(st, auTour), "la pause retient la clé du tour, pas une heure");
}

console.log("\n-- Reprise --");
{
  const st = base(); poserPause(st, auTour);
  ok(leverPause(st, pasAuTour) === false && !!st.pause, "un autre joueur ne peut pas reprendre");
  ok(leverPause(st, auTour) === true && st.pause === null, "celui qui a mis en pause reprend");
}

console.log("\n-- Expiration : bascule sur un bot --");
{
  const st = base(); poserPause(st, auTour);
  const avant = st.players.find(p => p.id === auTour);
  ok(!avant.bot, "avant expiration, le joueur est humain");
  ok(expirerPause(st, "fada") === true, "expiration appliquée");
  const apres = st.players.find(p => p.id === auTour);
  ok(apres.bot === true, "le joueur est devenu un bot");
  ok(apres.remplace === true, "il est marqué « remplacé » — il récupérera sa place en rejoignant");
  ok(apres.name === avant.name, "il garde son nom");
  ok(st.mene.left[auTour] === 3, "il garde ses boules");
  ok(st.pause === null, "la pause est levée");
  ok(st.absents[auTour] === 0, "son compteur d'absences est remis à zéro");
}

console.log("\n-- La pause ne touche ni au score ni à la mène --");
{
  const st = base(); const avant = JSON.stringify({ s: st.scores, m: st.mene });
  poserPause(st, auTour); leverPause(st, auTour);
  ok(JSON.stringify({ s: st.scores, m: st.mene }) === avant, "scores et mène inchangés après pause puis reprise");
}

console.log(ko ? `\n${ko} échec(s).` : "\nTout passe.");
process.exit(ko ? 1 : 0);
