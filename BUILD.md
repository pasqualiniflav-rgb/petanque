# Compiler le jeu (source → app.js)

Le jeu est développé dans `App.jsx` (source lisible). Le fichier `app.js`
servi par la page est sa version compilée. Après toute modification de
`App.jsx`, recompiler :

```bash
npm install esbuild react@18 react-dom@18
npx esbuild entry.jsx --bundle --minify --jsx=transform \
  --alias:react=./react-shim.js \
  --alias:react-dom/client=./react-dom-client-shim.js \
  --outfile=app.js
```

Puis committer `app.js` (et `App.jsx`). GitHub Pages redéploie tout seul.

- `entry.jsx` : point d'entrée (monte le composant React)
- `react-shim.js` / `react-dom-client-shim.js` : branchent le code sur le
  React global chargé par CDN dans `index.html`
- Vérification rapide : `node --check app.js`

## Tests numériques de la physique

`tests/portees.js` rejoue des lancers hors navigateur sur les deux
terrains : il compare la portée d'un pointé (vol puis roulé) à celle du
simple roulé d'origine, fait de même pour le cochonnet, et vérifie que
deux simulations identiques donnent le même résultat au bit près. À
lancer après tout changement dans `stepPhysics`, `corpsLance` ou les
constantes `TERRAINS` :

```bash
npx esbuild tests/portees.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/portees.cjs && node /tmp/portees.cjs
```

Tolérance : ±3 % sur les portées. Le script sort en erreur au premier écart.

`tests/chrono.js` vérifie que l'horloge du tour s'ancre sur l'identité du
tour et non sur `rev` : une écriture qui ne joue rien (joueur qui rejoint,
tournée proposée, réglage changé) ne remet pas le chronomètre à zéro.

```bash
npx esbuild tests/chrono.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/chrono.cjs && node /tmp/chrono.cjs
```

`tests/pause.js` vérifie la pause partagée : polarité (privée seulement,
marqueur oublié = refus), droit du seul joueur au tour, absence de tout
horodatage dans l'état écrit, reprise réservée au demandeur, et bascule
sur un bot à l'expiration.

```bash
npx esbuild tests/pause.js --bundle --platform=node --alias:react=./tests/react-vide.js --outfile=/tmp/pause.cjs && node /tmp/pause.cjs
```

`tests/bots.js` vérifie la règle « qui joue pour un bot » (hôte présent,
hôte disparu, bot arrivé en cours de partie, joueur remplacé, hôte remplacé,
lancer déjà annoncé) et que le cerveau accepte un joueur remplacé.

`tests/tir.js` vérifie la règle d'or du tir : à force égale il porte à la même
distance que le pointé (±5 % aux forces 25/50/75/100) et, s'il ne frappe rien,
glisse puis roule après la chute (60-90 px en classique, 150-220 en long).

`tests/vitesse.js` compare les portées aux valeurs de référence figées avant
l'accélération (`tests/portees-reference.json`, ±2 %), mesure la durée d'un
pointé (~2 s), vérifie le déplacement par sous-pas (< 11 px) et que le
carreau reste possible.

`tests/mortes.js` vérifie qu'une boule sortie garde sa vitesse, roule sans
toucher personne jusqu'à la planche hors-jeu, reste enregistrée avec
`dead:true`, ne compte ni au score ni pour le tour — au bit près.

`tests/carreau.js` mesure, pour une boule cible posée à différentes
distances, la plage de force (donc de longueur de geste) qui la déloge :
c'est la tolérance du carreau. Même commande, en remplaçant `portees` par
`carreau`.
