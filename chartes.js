// Les deux chartes. La charte ivoire est une SECONDE PEAU : ses couleurs
// n'existent que dans ce fichier. Aucune ne doit apparaître dans App.jsx —
// c'est la preuve de non-fuite demandée par le lot 2.
export const CHARTES = {
  actuelle: {
    nom: "Boulodrome 62",
    fond: "linear-gradient(180deg, #27607e 0%, #333d24 62%, #232919 100%)",
    barre: "#27607e",          // bande d'icônes
    rangee: "#232919",         // rangée de boutons
    emailFond: "#f2ecdc",      // plaque émaillée
    trait: "#1d3a4f",          // liseré
    accent: "#f6c324",         // bouton primaire
    traitEp: 2,                // épaisseur de liseré
    ombre: "0 2px 0",          // ombre dure, vers le bas
    ombreForte: "0 3px 0 rgba(0, 0, 0, 0.35)",
    rayon: 4,
    titre: "'Oswald', sans-serif",
    ciel: ["#3f95cd", "#8ec8e6", "#e7d2a6", "#dcc191"],
    sable: "#d8c49a",
    lignes: "rgba(242,236,220,0.8)",
  },
  ivoire: {
    nom: "Ivoire",
    fond: "#f2e8d5",
    barre: "#1f3a56",
    rangee: "#1f3a56",
    emailFond: "#f2e8d5",
    trait: "#1f3a56",
    accent: "#c9a02e",
    traitEp: 3,
    ombre: "3px 3px 0",        // ombre décalée en diagonale
    ombreForte: "3px 3px 0 rgba(0, 0, 0, 0.35)",
    rayon: 0,
    titre: "'Alfa Slab One', serif",
    ciel: ["#9fc9de", "#bcdcea", "#e6d8bb", "#ddc9a4"],
    sable: "#e3d3b0",
    lignes: "rgba(255,255,255,0.85)",
  },
};
export const ORDRE_CHARTES = ["actuelle", "ivoire"];
export const charteDe = cle => CHARTES[cle] || CHARTES.actuelle;
