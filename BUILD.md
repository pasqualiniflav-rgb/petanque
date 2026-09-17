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
