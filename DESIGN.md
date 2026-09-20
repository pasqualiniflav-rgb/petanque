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
| ~~Ardoise~~ | **Retirée.** Le bandeau sombre a été chassé deux fois ; il n'existe plus nulle part. |

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

**Message passager sur le terrain** : plaque émaillée, comme tout le reste —
crème, liseré bleu nuit, ombre franche, une ligne, en surimpression sous la
bande fixe. Elle ne prend pas un pixel au terrain et disparaît d'elle-même.
**Aucune bande sombre nulle part**, ni dans le flux ni sur le terrain : c'est
exactement le « toast noir » qu'on a dû chasser deux fois.

**Scoreboard** : conserver l'esprit panneau lumineux existant ; l'habiller
en fronton — cadre bleu nuit, chiffres Oswald jaunes lumineux, compteur
central « MÈNE N » entre les deux équipes (façon panneau de basket),
pastilles boules restantes et verres en icônes SVG. Toutes les pastilles
d'équipe et les jetons portent un liseré brun brûlé `#4a2f16` (1,5 px), lisible
sur bois comme sur crème.

## 5. Terrain

Pleine largeur de l'écran (zéro marge latérale morte) et **bord à bord en
hauteur** : depuis le remplacement des maquettes, le terrain n'a plus de cadre
bois — la bande fixe le borde en haut, la rangée de boutons en bas.
**Le décor de village existant (ciel, façades, platanes) est conservé tel
quel** — validé par Flavio, on ne le retouche pas ; seule la ligne de sol a
été calée sur la ligne de sol du village, pour tenir dans les 130 px de la bande. Traces et impacts
conservés.

## 5 bis. Maquettes de référence (validées)

Trois écrans témoins font foi pour l'application de cette charte : Accueil,
Écran de jeu (fronton + terrain pleine largeur + boutons imprimés), Pop-in
tournée en plaque émaillée. En cas de doute sur un composant, reproduire la
maquette.

## 5 ter. Écran de jeu — budget vertical (maquette-jeu.html)

Quatre bandes, sans gouttière ni padding : **barre d'icônes 46 px**, **bande
fixe 104 px**, **terrain en `flex: 1 1 auto`**, **rangée de boutons 44 px**.
Le total tombe pile sur la hauteur de l'écran ; tout pixel récupéré ailleurs
va au terrain.

La bande fixe a **son propre canvas**, dessiné en pixels CSS 1:1 — elle ne
défile jamais et ne subit aucune mise à l'échelle. Le panneau s'y plante :
un **bandeau replié** calé par le bas — 28 px à deux équipes, 44 px à trois —
sur deux poteaux de 10 × 26 px centrés à **28 % et 72 % de la largeur de la
bande**, et sous chaque pied une ombre **dure et courte de 34 × 5 px**
(`rgba(70,55,30,.28)`). Rien d'autre n'est dessiné là : ni fondu sombre, ni
ombre portée de feuillage.

**Le compteur a deux états, un seul composant.** Replié, le bandeau porte pour
chaque équipe son jeton posé sur son score, ses boules restantes et son verre
de tournées ; à deux équipes la première est collée à gauche, la seconde à
droite, la ligne d'état au centre ; à trois, les groupes se répartissent dans
l'ordre fixe **ciel, rouge, sauge** et la ligne d'état passe dessous. Déplié,
la plaque à rails s'ouvre **en surimpression sur le terrain** — deux secondes
en fin de mène, le temps que le jeton grimpe, ou jusqu'au clic suivant quand
c'est le joueur qui l'ouvre. Elle ne pousse jamais le terrain : un terrain qui
se décale pendant que quelqu'un vise déplace sa cible sous son doigt.

Boutons de jeu : **38 px visuels** dans la rangée de 44, typo 14 px, ombre
dure 2 px. La zone de tap reste à 46 px par un débord invisible
(`::after { inset: -6px 0 }` — la bordure de 2 px en absorbe 2 de chaque côté).
Icônes : 34 px, tap 46 px, sur fond `#27607e`. Le bandeau du compteur fait
28 px visuels et **44 px de zone de tap**, par le même débord invisible.

Le compteur n'est **pas collé au bord haut** : le ciel, les maisons et les
platanes se voient au-dessus du bandeau et le sol de la place derrière. Les
crans gardent leur corps de 10 px : c'est la lisibilité qui commande la hauteur
des rails, jamais l'inverse. Le rail va de 0 au nombre de points choisi (5, 9
ou 13), pas toujours à 13.

Messages passagers : plaque émaillée, sur le terrain comme ailleurs.

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
5. Terrain pleine largeur, testé sur les DEUX terrains, en 390 px et en 360 px ?
6. Budget vertical de la section 5 ter respecté au pixel (mesuré dans le DOM) ?
