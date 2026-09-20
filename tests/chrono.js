// L'horloge du tour ne doit repartir QUE quand le tour change. Avant, elle
// s'ancrait sur `rev`, qui bouge à chaque écriture : un joueur qui rejoignait
// en pleine partie rendait vingt secondes au joueur en train de viser.
import { cleDuTour, nextToPlay } from "../App.jsx";

let ko = 0;
const ok = (b, m) => { console.log((b ? "  ✓ " : "  ✗ ") + m); if (!b) ko++; };

const base = () => ({
  rev: 1000, phase: "playing", terrain: "classique",
  players: [
    { id: "p1", name: "Fernand", team: "A" },
    { id: "p2", name: "Marius", team: "B" },
  ],
  scores: { A: 0, B: 0 }, drinks: { A: 0, B: 0 }, absents: {},
  mene: { num: 3, cochonnet: { x: 170, y: 120 }, boules: [], left: { p1: 3, p2: 3 } },
});
const cle = st => cleDuTour(st, nextToPlay(st));

console.log("=== L'horloge du tour ===");

// 1. une écriture qui ne joue rien
{
  const a = base(), b = base();
  b.rev = 999999;                       // saveGame incrémente rev à chaque écriture
  ok(cle(a) === cle(b), `rev seul modifié : clé inchangée (${cle(a)})`);
}
// 2. un joueur qui rejoint en pleine partie
{
  const a = base(), b = base();
  b.rev = 999999;
  b.players.push({ id: "p3", name: "Panisse", team: "A" });
  b.mene.left.p3 = 0;
  ok(cle(a) === cle(b), "un joueur rejoint : clé inchangée");
}
// 3. une tournée proposée, un réglage changé
{
  const a = base(), b = base();
  b.rev = 999999; b.tourneePending = "A"; b.sansCris = true; b.cible = 9;
  ok(cle(a) === cle(b), "tournée proposée et réglages changés : clé inchangée");
}
// 4. ce qui DOIT faire repartir l'horloge
{
  const a = base();
  const boule = { x: 170, y: 150, team: "A", pid: "p1" };
  const joue = base(); joue.mene.boules.push(boule); joue.mene.left.p1 = 2;
  ok(cle(a) !== cle(joue), "une boule jouée : clé changée");

  const menes = base(); menes.mene.num = 4;
  ok(cle(a) !== cle(menes), "mène suivante : clé changée");

  const sansCoch = base(); sansCoch.mene.cochonnet = null;
  ok(cle(a) !== cle(sansCoch), "cochonnet posé : clé changée");

  const fini = base(); fini.phase = "finished";
  ok(cle(a) !== cle(fini), "partie finie : clé changée");
}
// 5. le joueur au tour entre bien dans la clé — même mène, même nombre de
//    boules posées, mais c'est l'autre équipe qui est loin du cochonnet
{
  const pose = (dA, dB) => {
    const st = base();
    st.mene.boules = [
      { x: 170, y: 120 - dA, team: "A", pid: "p1" },
      { x: 170, y: 120 - dB, team: "B", pid: "p2" },
    ];
    st.mene.left = { p1: 2, p2: 2 };
    return st;
  };
  const aProche = pose(10, 60);   // A est proche : c'est à B de jouer
  const bProche = pose(60, 10);   // B est proche : c'est à A de jouer
  ok(nextToPlay(aProche) !== nextToPlay(bProche),
     `le joueur au tour diffère bien (${nextToPlay(aProche)} vs ${nextToPlay(bProche)})`);
  ok(cle(aProche) !== cle(bProche), "joueur au tour différent : clé changée");
  ok(cle(aProche).split("|")[2] === cle(bProche).split("|")[2],
     "... alors que le nombre de boules posées est identique");
}

console.log(ko ? `\n${ko} échec(s).` : "\nTout passe.");
process.exit(ko ? 1 : 0);
