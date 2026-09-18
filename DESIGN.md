# DESIGN.md — Direction artistique « Le boulodrome de 1962 »

Référence obligatoire pour toute modification d'interface. L'objectif : un jeu
qui semble **peint à la main dans le Sud**, pas généré. Chaque écran doit
évoquer la plaque émaillée, l'affiche de pastis et le panneau de score du
boulodrome municipal — jamais la carte sombre arrondie générique.

## 1. Palette (figée)

| Usage | Couleur |
|---|---|
| Fond d'app (dégradé ciel du soir → olive) | `#27607e → #333d24 → #232919` (existant, conservé) |
| Émail crème (plaques, pop-ins, panneaux) | `#f2ecdc` |
| Bleu nuit émaillé (liserés, textes sur crème) | `#1d3a4f` |
| Sable | `#d8c49a` clair / `#c9b488` ombre |
| Équipe ciel | `#2ba3d4` |
| Équipe rouge (garance) | `#bd4f3a` |
| Équipe sauge | `#7f9f78` |
| Jaune pastis (action principale) | `#f6c324` |
| Ardoise (bandeaux d'info sur le terrain) | `#2e2a24`, opaque |

Interdits : violets, roses, dégradés multicolores, néons (une seule exception :
la lueur des chiffres du scoreboard, légitime façon panneau lumineux).

## 2. Typographie (auto-hébergée dans /fonts, licences OFL)

- **Titres & plaques** : Alfa Slab One — la lettre d'affiche peinte. Titres
  d'écrans, noms d'équipes sur plaques, pop-ins.
- **Chiffres de score & timer** : Oswald (bold, condensé) — le panneau
  d'affichage. Jamais de police système pour un chiffre de score.
- **Corps de texte** : pile système (perf) — mais rare : ce jeu se lit peu,
  il se regarde.
- Interdit : Georgia/serif par défaut, italiques décoratives génériques.

## 3. Icônes — LA règle qui tue le « style IA »

**Zéro émoji dans l'interface.** Un seul set d'icônes SVG inline, trait 2 px,
même graisse partout : haut-parleur, note de musique, aide (?), maison,
rejouer (↺), dé, partage, robot (bot), verre de pastis (anisette + glaçon,
dessiné), engrenage, croix.
Les émojis restent autorisés **uniquement** dans les messages festifs
(cris provençaux, annonce de tournée) — jamais sur un bouton, jamais en icône.

## 4. Composants

**Plaque émaillée** (pop-ins, panneaux de salon, carte de victoire) : fond
crème `#f2ecdc`, double liseré bleu nuit (2 px + 1 px espacés), coins 6 px
max, ombre franche `0 3px 0 rgba(0,0,0,.35)` — jamais d'ombre diffuse molle,
jamais de translucide flouté.

**Bouton primaire** : jaune pastis, texte bleu nuit, bordure 2 px bleu nuit,
ombre dure décalée (2 px) ; état pressé = translation de l'ombre. Effet
« imprimé », pas « web ».

**Bouton secondaire** : crème, trait bleu nuit. **Bouton icône** : carré
36-44 px, même langage.

**Bandeau d'information sur le terrain** : bande « ardoise » opaque pleine
largeur, collée en haut ou en bas du terrain (jamais flottante au milieu),
texte crème, une ligne. Disparaît d'elle-même.

**Scoreboard** : conserver l'esprit panneau lumineux existant ; l'habiller
en fronton — cadre bleu nuit, chiffres Oswald jaunes lumineux, compteur
central « MÈNE N » entre les deux équipes (façon panneau de basket),
pastilles boules restantes et verres en icônes SVG.

## 5. Terrain

Pleine largeur de l'écran (zéro marge latérale morte), fin cadre bois.
**Le décor de village existant (ciel, façades, platanes) est conservé tel
quel** — validé par Flavio, on ne le retouche pas. Traces et impacts
conservés.

## 5 bis. Maquettes de référence (validées)

Trois écrans témoins font foi pour l'application de cette charte : Accueil,
Écran de jeu (fronton + terrain pleine largeur + boutons imprimés), Pop-in
tournée en plaque émaillée. En cas de doute sur un composant, reproduire la
maquette.

## 6. Lisibilité du geste

- Flèche de visée : **direction seule**, style distinct par mode —
  pointé : trait plein sable foncé ; tir : trait pointillé. Aucune jauge de
  force affichée, aucun point de chute : la distance se jauge au geste.
- Boule en vol (tir) : grossit nettement, son ombre se détache au sol,
  fine traînée — on doit *voir* qu'elle vole.

## 7. Ton des textes

Court, direct, provençal léger. Une phrase là où il y en avait trois.
Les règles vivent dans l'aide (?), pas sur les écrans.

## 8. Checklist avant tout commit UI

1. Aucun émoji en icône ou bouton ?
2. Tout panneau/pop-in est une plaque émaillée (pas une carte sombre floue) ?
3. Chiffres de score en Oswald, titres en Alfa Slab One ?
4. Aucune ombre diffuse, aucun translucide flouté ?
5. Terrain pleine largeur, testé sur les DEUX terrains et en 360 px ?
