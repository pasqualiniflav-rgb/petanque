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
