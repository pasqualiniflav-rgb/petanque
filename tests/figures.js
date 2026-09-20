// Le numéro est un identifiant : unique dans la partie, de 1 à 9. Et deux
// joueurs de la même équipe qui prennent la même figure portent forcément
// des couvre-chefs différents.
import { numeroLibre, numeroDisponible, chefImpose, figureParDefaut, ajouterJoueur } from "../App.jsx";
import { FIGURES, ORDRE_FIGURES, ORDRE_CHEFS, ORDRE_POLOS, figureValide } from "../figures.jsx";

let ko = 0;
const ok = (b, m) => { console.log((b ? "  ✓ " : "  ✗ ") + m); if (!b) ko++; };

const vide = () => ({
  rev: 0, phase: "lobby", terrain: "classique", privee: true, pause: null,
  players: [], scores: { A: 0, B: 0, C: 0 }, drinks: { A: 0, B: 0, C: 0 },
  absents: {}, mene: null, boulesEach: 3,
});

console.log("=== Les neuf figures ===");
ok(ORDRE_FIGURES.length === 9, `neuf figures déclarées : ${ORDRE_FIGURES.length}`);
ok(ORDRE_FIGURES.every(f => FIGURES[f] && FIGURES[f].corps.length > 200),
   "chacune porte un tracé complet");
ok(new Set(ORDRE_FIGURES.map(f => FIGURES[f].corps)).size === 9,
   "les neuf tracés sont tous différents — aucune silhouette dupliquée");
ok(ORDRE_FIGURES.every(f => FIGURES[f].corps.includes("{POLO}")),
   "chacune a son torse paramétrable : c'est là que se pose le polo");

console.log("\n=== Neuf joueurs entrent : aucun doublon de numéro ===");
{
  const st = vide();
  for (let i = 1; i <= 9; i++) ajouterJoueur(st, "Joueur" + i);
  ok(st.players.length === 9, `neuf joueurs à table : ${st.players.length}`);
  const nums = st.players.map(p => p.fig.num);
  ok(nums.every(n => Number.isInteger(n) && n >= 1 && n <= 9), `tous les numéros dans 1-9 : ${nums.join(",")}`);
  ok(new Set(nums).size === 9, "les neuf numéros sont distincts");
  ok(st.players.every(p => figureValide(p.fig)), "chaque joueur a une figure valide");
  ok(numeroLibre(st) === null, "table pleine : plus aucun numéro libre");

  console.log("\n=== Un dixième changement vers un numéro pris est refusé ===");
  const cible = st.players[0].fig.num;
  const autre = st.players[8];
  ok(numeroDisponible(st, cible, autre.id) === false,
     `le numéro ${cible} est pris par ${st.players[0].name} : refusé pour ${autre.name}`);
  ok(numeroDisponible(st, autre.fig.num, autre.id) === true, "son propre numéro lui reste disponible");
  ok(numeroDisponible(st, 0, autre.id) === false && numeroDisponible(st, 10, autre.id) === false,
     "hors de 1-9 : refusé");
}

console.log("\n=== Même équipe, même figure : couvre-chefs forcés ===");
{
  const st = vide();
  const a = { id: "x1", name: "A", team: "A", fig: { nom: "marius", chef: "beret", polo: "creme", num: 1 } };
  st.players.push(a);
  const impose = chefImpose(st, "x2", "A", "marius", "beret");
  ok(impose !== null && impose !== "beret", `second joueur, même équipe, même figure : chef imposé « ${impose} »`);
  ok(chefImpose(st, "x2", "B", "marius", "beret") === null, "autre équipe : le béret reste libre");
  ok(chefImpose(st, "x2", "A", "meme", "beret") === null, "autre figure, même équipe : le béret reste libre");

  const b = { id: "x2", name: "B", team: "A", fig: { nom: "marius", chef: impose, polo: "creme", num: 2 } };
  st.players.push(b);
  const troisieme = chefImpose(st, "x3", "A", "marius", "beret");
  ok(troisieme && troisieme !== "beret" && troisieme !== impose,
     `troisième : le dernier chef restant « ${troisieme} »`);
  ok(new Set([a.fig.chef, b.fig.chef, troisieme]).size === 3, "les trois chefs sont distincts");
}

console.log("\n=== La figure par défaut ne recopie pas un coéquipier ===");
{
  const st = vide();
  for (let i = 0; i < 3; i++) {
    const p = { id: "y" + i, name: "J" + i, team: "A" };
    st.players.push(p);
    p.fig = figureParDefaut(st, p.id, "A");
  }
  const noms = st.players.map(p => p.fig.nom);
  ok(new Set(noms).size === 3, `trois figures différentes dans la même équipe : ${noms.join(", ")}`);
}

console.log("\n=== Les bots suivent exactement la même règle ===");
{
  const st = vide();
  const b = { id: "b1", name: "Marius", team: "B", bot: true };
  st.players.push(b);
  b.fig = figureParDefaut(st, b.id, "B");
  ok(figureValide(b.fig) && Number.isInteger(b.fig.num), "un bot reçoit figure et numéro");
  ok(!("botFig" in b) && ORDRE_FIGURES.includes(b.fig.nom), "il pioche dans les neuf mêmes figures");
}

console.log(ko ? `\n${ko} échec(s).` : "\nTout passe.");
process.exit(ko ? 1 : 0);
