# 🎯 Pétanque en ligne — Backlog complet

*Effort : S = une session de travail · M = plusieurs sessions · L = chantier. Chaque version se termine par une partie test à 9.*

---

## ✅ v1 — Livré

Jeu à 9 joueurs (3 équipes) sans compte, hébergé sur GitHub Pages, synchro temps réel Firebase (SSE, top départ commun 0,6 s). Règles : cochonnet lancé par le premier joueur (min 6 m), 1-3 boules/joueur avec équilibrage des équipes inégales, pointé/tir différenciés (carreau), boule morte au fond, glitch des côtés conservé. Deux terrains au choix de l'hôte : Classique et Long 10 m (caméra + mini-carte). Difficulté : direction seule, réglages remélangés, valeurs masquées, timer 15 s puis lancer automatique. HUD : boules restantes, point en direct, replay du dernier coup. Ambiance : bleu ciel/jaune pastis, cigales (mp3 ou synthèse) + musique superposée dès l'accueil, son au premier geste. La tournée : offre après mène gagnée, ivresse progressive (écran + geste + son), tournée surprise à 3 mènes d'affilée, la Fanny.

---

## 🤖 v1.5 — Le bot & consolidation

| # | Item | Détail | Effort | Dépend de |
|---|------|--------|--------|-----------|
| G1 | **Marche graphique 1** 🎨 | ~~Décor de place de village, design du sable (traces persistantes, impacts de tir, grain, lumière chaude), boules métalliques à reflets, ombres~~ ✅ Fait — reste à déposer une vraie photo `decor.jpg` (panoramique ~5:1) si on en veut une. Marches 2 (pseudo-3D) et 3 (three.js) en réserve selon les tests | M | — |
| 1 | **Fichiers audio** | ~~Déposer `cigales.mp3` et `musique.mp3` à la racine du dépôt~~ ✅ Fait | S | Flavio |
| 2 | **Bot : cerveau** | ~~Le bot simule des lancers candidats avec la vraie physique et choisit le meilleur, bruité selon son niveau~~ ✅ Fait | M | — |
| 3 | **Bot : niveaux** | ~~3 difficultés~~ ✅ Fait : *Fanny* / *Pointeur* / *Fada*, du très maladroit au chirurgical | S | 2 |
| 4 | **Bot : au salon** | ~~L'hôte ajoute un bot dans n'importe quelle équipe ; jouable 100 % solo~~ ✅ Fait (les équipes de bots offrent même leur tournée) | S | 2 |
| 5 | **Bot remplaçant** | ~~Après 3 timeouts consécutifs d'un joueur, proposition de le remplacer par un bot~~ ✅ Fait (il garde son nom et ses boules, et reprend la main quand il revient) | S | 2 |
| 6 | **Écran d'aide** | ~~Règles + commandes en une page (les nouveaux arrivent sans rien connaître)~~ ✅ Fait — bouton « ? » présent sur les trois écrans | S | — |
| 7 | **Reprise de partie** | ~~Rejoindre en cours de partie proprement~~ ✅ Fait : on entre dans une équipe engagée et on reçoit ses boules à la mène suivante ; spectateur seulement si toutes les places sont prises | M | — |
| 8 | **QA multi-supports** | ~~Passe complète PC + mobiles, corrections~~ ✅ Fermé par le sprint mobile ci-dessous (retours de la partie test, 14 points traités) | M | — |

## 📱 Sprint mobile — retours de la partie test *(item 8)*

| # | Item | Détail | État |
|---|------|--------|------|
| A1 | **Synchro** | ~~Sauts/coupures entre un lancer, son affichage et le tour suivant~~ ✅ Corrigé — le rafraîchissement de fin de rejeu se croyait encore en animation et ne faisait rien (attente du sondage, 0-4 s) ; résultat officiel désormais en ~30 ms, tapis figé le temps qu'il arrive, pause de 3 s sur le tapis final en fin de mène, chronomètre local (plus de dérive d'horloge entre téléphones) | ✅ |
| B2 | **Lancer au doigt** | ~~Glisser-relâcher sur le terrain : direction + force, flèche de visée ; curseurs gardés en option~~ ✅ Fronde : on touche, on tire vers l'arrière, on relâche ; flèche + jauge de force ; « Préférer les curseurs » retenu sur l'appareil | ✅ |
| B3 | **Mise en page mobile** | ~~Zéro scroll, terrain agrandi, zones tactiles ≥ 44 px~~ ✅ Mesuré à 375×812 et 360×640 : aucun défilement, tous les boutons ≥ 44 px ; bandeau de résultat, indication du geste et messages dessinés dans le canvas, une seule rangée de commandes | ✅ |
| B4 | **Scoreboard de stade** | ~~Panneau d'affichage compact façon fronton de boulodrome~~ ✅ Fond sombre, chiffres lumineux, une colonne par équipe (score, ●, 🍹, qui tient le point), ligne de jeu avec mène, joueur au tour, chronomètre et outils | ✅ |
| B5 | **Boutons** | ~~Suppression d'Actualiser, ↺ pour revoir, ⌂ retour accueil~~ ✅ Outils regroupés dans le fronton : ↺ (quand un coup est à revoir), 🦗, 🎵, ?, ⌂ ; ⌂ aussi au salon | ✅ |
| C6 | **Sons** | ~~Plus de démarrage automatique : 🦗 et 🎵 seuls déclencheurs~~ ✅ | ✅ |
| C7 | **Chronomètre** | ~~15 → 20 s~~ ✅ (24 s de grâce avant qu'un autre appareil ne lance pour un absent) | ✅ |
| C8 | **Tournée** | ~~Popin bloquante pour l'équipe gagnante, expiration 20 s → Passer~~ ✅ La mène suivante attend le choix (joueurs, bots et chrono bloqués) ; l'hôte passe à 20 s ; testé : choix, Passer, expiration | ✅ |
| C9 | **Ivresse** | ~~Plus d'aléa sur le geste ; effets visuels et sonores conservés~~ ✅ Tangage, flou, vision double et son ralenti gardés ; la main ne tremble plus | ✅ |
| C10 | **Mode sans tournée** | ~~Option de l'hôte, préfigure la version tous publics~~ ✅ Réglage « Tournées de pastis : Avec / Sans » au salon ; sans : ni popin, ni verre surprise, ni ivresse | ✅ |
| C11 | **Accès** | ~~🎲 prénom provençal, code auto, « Partager le lien » (?partie=CODE)~~ ✅ Web Share, sinon presse-papiers, sinon lien affiché ; le lien pré-remplit le code | ✅ |
| D12 | **Pointé avec portée** | ~~La boule vole 40-60 % puis roule ; recalibrage des deux terrains, tests numériques~~ ✅ 50 % en vol (elle passe par-dessus les autres), portées conservées à ±1,3 % ; banc `tests/portees.js` documenté dans BUILD.md | ✅ |
| D13 | **Cochonnet** | ~~Calibration propre, un peu plus vif que les boules~~ ✅ 40 % en vol, +10 % de portée à force égale (constantes volCoch / cochVif par terrain, couvertes par le banc) | ✅ |
| D14 | **Fin de partie** | ~~Bonus : confettis, cochonnet doré, rappel de la Fanny~~ ✅ Confettis aux couleurs des équipes, cochonnet d'or, tampon FANNY ! et sa phrase (variante sobre en mode sans tournée) | ✅ |

## 🎨 Sprint polish — direction artistique (DESIGN.md)

| # | Item | État |
|---|------|------|
| A1 | Polices Alfa Slab One + Oswald auto-hébergées (`/fonts`, woff2, @font-face, sans CDN) | ✅ |
| A2 | Set d'icônes SVG inline trait 2 px (haut-parleur, note, aide, maison, rejouer, dé, partage, robot, verre, engrenage, croix, horloge) ; plus aucun émoji dans l'interface | ✅ |
| B3 | Fronton façon boulodrome : cadre bleu nuit émaillé, chiffres Oswald lumineux, compteur central « MÈNE N » + chrono, boules et verres en icônes | ✅ |
| B4 | Terrain pleine largeur sous cadre bois, décor de village conservé tel quel | ✅ |
| B5 | Bandeaux « ardoise » opaques collés en haut/bas du terrain ; rappels de geste effacés après les deux premiers lancers | ✅ |
| B6 | Boutons POINTER/TIRER imprimés, rangée d'icônes normalisée (maison, rejouer) | ✅ |
| B7 | Visée = direction seule (pleine / pointillée), boule tirée grossie + ombre détachée + traînée ; carreau resserré sur le classique (`muTir` 0,88 → 0,76 : 60 → 35 px de geste, banc `tests/carreau.js`) | ✅ |
| C8 | Accueil : enseigne « PÉTANQUE ! », accroche, plaque émaillée, « Nom de joueur », rien sous les icônes | ✅ |
| C9 | Salon : plaques et boutons à la charte, note d'équilibrage sous « Boules par joueur », bots en une ligne, puces avec robot SVG | ✅ |
| C10 | Pop-in tournée : plaque à double liseré, verre dessiné, « PASSER · N » | ✅ |
| C11 | Victoire : plaque crème contrastée, trophée dessiné, confettis conservés | ✅ |

## 🔧 Sprint retouches — retours de partie après le polish

| # | Item | État |
|---|------|------|
| A1 | Bot à qui on passe la main : reproduit à deux navigateurs (hôte parti → chrono à 0, rien ne se passe). Règle commune `doitJouerPourLeBot` : l'hôte, sinon n'importe quel client après 3 s de grâce, premier écrit gagne ; garde `enCours` contre les doubles lancers ; hôte remplacé joue pour son propre bot ; même grâce pour les tournées. `tests/bots.js` | ✅ |
| B2 | Fronton compact planté en haut du terrain, terrain bord à bord sur toute la hauteur, toutes les infos conservées | ✅ |
| B3 | Bords flous (dégradé) des côtés du terrain supprimés | ✅ |
| B4 | Panneau des curseurs compacté (étiquettes en ligne, une rangée par curseur) | ✅ |
| B5 | Plus aucun texte sur le sable : messages et résultat dans une ardoise au-dessus du terrain, rappels de geste supprimés | ✅ |
| B6 | Visée : courte ligne pointillée à faible opacité qui s'estompe pendant le glissé | ✅ |
| C7 | Polices diagnostiquées « error » (chemins de `polices.css` résolus en `/fonts/fonts/`) : `@font-face` désormais inlinés dans `index.html`, chargement vérifié (`document.fonts.check`) | ✅ |
| C8 | Alternatives Passion One / Fraunces : non préparées, la règle ne s'applique qu'une fois les vraies polices vues | ⏸️ |
| C9 | Plus de « La Pétanque » : l'aide s'intitule « PÉTANQUE ! — LES RÈGLES EN DEUX MINUTES » | ✅ |
| D10 | Salon : phrase sous le niveau des bots supprimée | ✅ |
| D11 | Accueil : accroche « 9 JOUEURS · 13 POINTS · 1 LIEN » | ✅ |

## 📐 Sprint affinage mobile — retours après re-test

| # | Item | État |
|---|------|------|
| A1 | Fronton sur une seule rangée (52 px) en surimpression : « ● CIEL 01 ●2 \| MÈNE 4 ⏱19 À TOI \| ROUGE 03 ●3 ● », chiffres lumineux conservés | ✅ |
| B2 | Sable sur toute la largeur du canvas, bandes hors-jeu visibles (côtés 28 px, fond 28 px, arrière 8 px), plus de remplissage flou | ✅ |
| B3 | Boules sorties : marquées mortes mais gardent leur vitesse, roulent sans collision jusqu'à la planche, restent grisées (55 %) et enregistrées `dead:true`, exclues du score et des tours. `tests/mortes.js` ; vérifié à deux navigateurs : position enregistrée = recalcul node au bit près | ✅ |
| C4 | Curseurs : poignées de 28 px, étiquette et curseur en ligne, LANCER pleine largeur, bloc ≤ 160 px | ✅ |
| D5 | Messages de fin de mène supprimés | ✅ |
| D6 | Cri du Sud quand l'équipe qui tient le point change (premier point compris), rotation sur compteur, pas sur le lancer qui termine la mène | ✅ |
| D7 | Cri en plaque en position absolue, 2,5 s ; plus aucun élément de flux ajouté ou retiré autour du terrain (ardoise, plaques d'info et cri en surimpression, bloc de commandes à hauteur fixe) — cadre mesuré identique avant/pendant/après | ✅ |
| — | Au passage : numéro de version `rev` rendu monotone (`max(Date.now(), rev + 1)`) — deux téléphones aux horloges décalées pouvaient s'ignorer mutuellement leurs états | ✅ |

## 🎯 Sprint pétanque vraie — sensations de jeu

| # | Item | État |
|---|------|------|
| A1 | Vitesses accélérées à portées conservées : ×2,2 sur le classique (son roulé s'éteint lentement, il fallait ça pour ~2 s), ×1,7 sur le long ; `mu/(1−mu)` divisé d'autant (le frottement s'applique dès la frame d'atterrissage) ; sous-pas 2 et 12 (< 11 px). `tests/vitesse.js` : portées ≤ 1,96 % de la référence figée, pointés 2,1–2,35 s | ✅ |
| A2 | Chocs mats : restitution tir 0,9 → 0,6 (la frappante garde 20 % vers l'avant, la frappée part avec 80 %), roulé 0,45 → 0,3 ; dérapage plus mordant (`skidMu` 0,80 / 0,78). Carreau toujours possible (39 px de geste sur le classique, la frappante meurt à 16 px de l'impact). Déterminisme à deux navigateurs : recalcul hors navigateur identique au bit près | ✅ |
| B3 | Largeur interne du canvas adaptée au ratio de la boîte (ResizeObserver, 396–640 px), sable sur toute la largeur, lignes centrées et inchangées, coordonnées physiques intouchées. Mesuré en 360×640 : 0 px de côté | ✅ |
| C4 | Cris du Sud à partir de la 3ᵉ boule de la mène | ✅ |
| C5 | Pointer / Tirer toujours visibles, grisés hors tour | ✅ |
| C6 | Lancer seul : un bot Pointeur complète une équipe vide, bandeau « Marius complète Équipe rouge » | ✅ |
| C7 | Mini-didacticiel en 3 étapes illustrées à la première partie sur l'appareil, revoyable depuis l'aide | ✅ |
| D8 | Backlog v2 : page d'accueil hub | ✅ |
| — | Au passage : un joueur qui rejoint pendant un lancer n'est plus effacé par le commit (fusion des joueurs avant l'écriture) | ✅ |

## 🧭 Sprint cohérence — retours de partie

| # | Item | État |
|---|------|------|
| A1 | Une boule qui touche une ligne de côté est morte, comme au fond : elle garde sa vitesse, roule hors des lignes sans collision, reste grisée. `tests/mortes.js` (frôler la ligne = morte, 2 px avant = vivante) ; déterminisme vérifié à deux navigateurs | ✅ |
| B2 | Ivresse : moments de clarté — le flou/tangage oscille entre net et trouble, fenêtres de netteté de 54 % du cycle au niveau 1 à 3 % au niveau 6, cycle qui s'allonge. CSS seulement | ✅ |
| B3 | Annonce de tournée reçue dans le même bandeau que les cris du Sud, plus d'écran sombre ; pop-in de choix conforme à la maquette (elle paraissait en serif tant que les polices ne chargeaient pas) | ✅ |
| B4 | Victoire : plaque émaillée centrée verticalement, typo de la charte | ✅ |
| C6 | Marge de sécurité en bas (24 px + `env(safe-area-inset-bottom)`, `viewport-fit=cover`) ; bouton plein écran (SVG) là où l'API existe (Android, bureau) | ✅ |
| C7 | Accueil : « CRÉER UNE PARTIE » (code tiré, entrée directe) et « REJOINDRE AVEC UN CODE » ; un lien `?partie=CODE` affiche « REJOINDRE LA PARTIE CODE » | ✅ |
| C8 | Partage : `navigator.share` (feuille native), sinon presse-papier + bandeau « Lien copié ! » | ✅ |

## 🪵 Mission scoreboard — le panneau de bois à rails *(arbitrage rendu)*

| # | Item | État |
|---|------|------|
| 1 | Plaque de bois gravée à rails 0-13 (valeurs de `maquette-scoreboard.html` : bois veiné, bordure #7a5a35, patine, chiffres gravés #4a2f16 + rehaut) ; le score est la position du jeton, pastille pleine à la couleur de l'équipe ; 3 rails à 3 équipes | ✅ |
| 2 | Plantée : deux poteaux derrière la plaque jusqu'au sable, ombre portée au sol (offsets de la maquette) | ✅ |
| 3 | Bandeau bas en miroir strict (flancs `flex: 1`) : pastille · boules · verre — « MÈNE N · cadran · secondes · NOM » — verre · boules · pastille ; tout gravé sauf pastilles, liquide des verres et le nom du joueur au tour, teinté à sa couleur (unique indicateur du tour) | ✅ |
| 4 | Chrono : cadran SVG, rouge garance + pulsation douce sous 5 s | ✅ |
| 5 | Le jeton glisse le long de son rail (transition CSS 0,6 s) ; cases de largeur égale pour que le jeton tombe exactement sur son chiffre | ✅ |
| 6 | Plaque de 90 px (84 + bordures), hors poteaux ; à 3 équipes : 3 rails, bandeau en 3 groupes, micro-ligne « MÈNE · chrono · NOM » sous la plaque | ✅ |
| 7 | Testé : classique et long, 390 px, partie à 3 équipes, changement de score vu en direct chez l'hôte (35 → 82 px) et chez l'invitée au premier plan (112 → 136 px) | ✅ |

| — | Au passage : les cris du Sud et les annonces de tournée ne s'effaçaient plus dès qu'une écriture survenait dans les 2,5 s (le nettoyage de l'effet annulait leur minuteur) — un cri d'une partie pouvait survivre jusque dans la suivante. Minuteur porté par un ref, cri effacé en quittant ; mesuré : 2,4 s de vie malgré 22 rafraîchissements | ✅ |

| 8 | Retouches : l'équipe ocre devient **sauge** (`#7f9f78`, nom gravé `#4b6a44`, charte mise à jour) ; la plaque est plantée sur le sable qui déborde au-dessus des lignes, sous le sol de la place — façades et platanes restent visibles au-dessus (bande de sable vue élargie à 64 unités, rendu seul : la planche des boules mortes ne bouge pas) | ✅ |

L'item « scoreboard » (B4 du sprint mobile, B3 polish, A1 affinage) est **fermé** par cette plaque.

## 🧽 Sprint finitions — retours + captures

| # | Item | État |
|---|------|------|
| A1 | Règle d'or du tir : portée asservie à la carte du pointé (forme fermée déduite des constantes + ajustement par terrain). `tests/tir.js` : écart pointé/tir ≤ 2 % aux forces 25/50/75 sur les deux terrains | ✅ |
| A2 | Atterrissage à vide : glisse puis roulé après la chute, 80-84 px classique / 189-219 px long (muTir adouci) ; dérapage post-impact agressif conservé et appliqué à toute boule tirée après un choc — carreau plein fer sec (frappante à 7-10 px). Déterminisme : tir réel joué à deux navigateurs, recalcul hors navigateur identique au bit près | ✅ |
| B3 | Plaque de 76 px remontée dans la bande de décor (elle mord sur les façades) ; le terrain ne bouge pas, ligne du haut visible, plaque au-dessus de la ligne du fond (87 px contre 124) — aucune boule dessous | ✅ |
| B4 | Poteaux raccourcis, à 28 % / 72 % de la plaque, pieds 6 px au-dessus de la ligne du fond — jamais dans l'aire de jeu | ✅ |
| B5 | Sauge officiel, cohérent partout ; liseré `#4a2f16` de 1,5 px sur toutes les pastilles et jetons ; DESIGN.md mis à jour | ✅ |
| B6 | Parité terrain long : même plaque plantée, mini-carte dessous ; letterbox résolu sur les deux terrains (fenêtre descendue à 340 sur téléphone étroit : canvas 352×640, 0 px de côté) — captures des deux terrains à 390 px | ✅ |
| C7 | POINTER / TIRER à 44 px, padding resserré, même rangée que l'engrenage ; bloc de commandes 46 px | ✅ |
| C8 | Accueil : « JUSQU'À 9 JOUEURS » | ✅ |
| C9 | Salon : « Cris du Sud » Avec/Sans, actifs par défaut ; Sans coupe les cris de prise de point | ✅ |
| C10 | Messages legacy sur fond noir translucide : aucun ne subsistait (vérifié) ; messages passagers en ardoise opaque de la charte | ✅ |

## 🔩 Sprint retouches II — tir, bande fixe, interface

| # | Item | État |
|---|------|------|
| A1 | Tir à vide (3e récidive) : **instrumenté avant correction**. La distance était bonne (74 px classique, 183 long) mais la glisse durait 0,33 s / 0,42 s contre 2,3 s pour un pointé — c'était la durée, pas la distance. Cause : `corpsLance` posait `mu: muTir` dès la création et `stepPhysics` faisait `b.mu \|\| muRoll`, sans transition — une boule tirée n'atteignait jamais le roulement du terrain ; et `muTir` valait 0,8, **exactement `skidMu`** : la constante du carreau freinait aussi les boules qui ne frappent rien | ✅ |
| A2 | Trois régimes distincts : `muChute` (morsure à l'atterrissage, valeur inchangée), `muRoll` (roulé sous `vRoule`), `skidMu` (dérapage posé par un choc, sans sortie en roulé — le carreau reste sec). `airTir` s'ajuste à la nouvelle glisse : la règle d'or tient. Mesuré : 89 px en 0,77 s (classique), 206 px en 0,67 s (long). Déterminisme vérifié à deux navigateurs, recalcul hors navigateur identique au bit près (115 images) | ✅ |
| B2 | Poteaux allongés (~32 px visibles), épaissis à 10 px, bois foncé contrasté | ✅ |
| B3 | Ombre de la plaque : dure et courte, plus de halo radial diffus | ✅ |
| C4 | Visée depuis le cercle : pendant toute la phase de visée la caméra s'ancre sur le cercle de lancer (`aim` couvre désormais la phase entière, pas seulement le glissé) ; dès le relâcher elle suit la boule. Mini-carte inchangée | ✅ |
| C5 | Bande fixe : la bande de décor passe de 84 à 112 unités et reçoit un tablier de sable hors-jeu où se plantent les poteaux — le sol ne défile plus jamais sous le panneau. Village descendu pour rester visible sous la plaque | ✅ |
| C5b | Alignement DOM/canvas : `echelleVue` ignorait le letterbox d'`object-fit`, les pieds pouvaient tomber dans le terrain selon la géométrie. Remplacé par la même échelle et le même décalage que le geste (`vueBoite`) | ✅ |
| D6 | POINTER / TIRER : 44 px dans une rangée de 52 px, police 15 px, gap 6, sans padding vertical (cotes de maquette-jeu.html) | ✅ |
| D7 | Barre d'icônes stable : « Revoir » toujours présent, grisé quand indisponible (#ddd6c1 / #8a8f96) ; boutons à 38 px | ✅ |
| D8 | Phase cochonnet : un unique bouton jaune « LANCER LE COCHONNET », engrenage conservé à droite ; retour à la paire dès la première boule | ✅ |
| D9 | Toast noir supprimé du code : `ardoiseFlottante` (posée à `top: 62`, donc **en plein sur la plaque**) et la pastille sombre arrondie `ardoise` remplacées par le bandeau de charte — bande opaque pleine largeur collée au bas du terrain | ✅ |

## 🪟 Sprint retouches II bis — maquettes remplacées, cotes au pixel

Maquettes `maquette-jeu.html` et `maquette-terrain-long.html` remplacées par Flavio (commit `e42b060`) : elles font foi, cote par cote.

| # | Item | État |
|---|------|------|
| A1 | Tir à vide (4e passage) : **ré-instrumenté avant toute correction**, par deux mesures indépendantes. Verdict : aucune ligne n'écrasait la vitesse, et le frottement du carreau n'était PAS appliqué à l'atterrissage — le code était déjà conforme à la lettre du point 1, et la cible en pixels déjà tenue. Le vrai défaut était la **durée** : 84 % de la glisse se faisait dans le premier quart de seconde, puis la boule se figeait | ✅ |
| A2 | Correction : le frottement d'atterrissage devient une **morsure unique** (`amorti`), appliquée à l'image où la boule touche terre ; ensuite elle roule comme un pointé (`muRoll`). `muChute` et `vRoule` disparaissent — un seul régime au sol, plus le dérapage `skidMu` posé par un choc, qui colle jusqu'à l'arrêt. `airTir` se règle sur la nouvelle glisse : la règle d'or tient (écart max 2,6 %). Mesuré : **75 px en 1,32 s dont 0,52 s visibles** (classique, contre 0,22 s) et **177 px en 1,22 s dont 0,82 s** (long, contre 0,32 s) | ✅ |
| A3 | Contrepartie assumée et chiffrée : la fenêtre de carreau se resserre (classique 30,5 → 21,5 unités de force, long 9,5 → 7,5) et la boule frappée part moins loin sur le grand terrain (332 → 94 px). Une seule constante par terrain la règle : `amorti` | ✅ |
| B2 | Bande fixe 118 px, plaque 68 px, rails 16 px à 5 et 25, pastilles 14 px, poteaux 10 × 34 px de bois foncé, centrés à 28 % et 72 % de la largeur — mesurés dans le DOM à 0,2 px près, à 390 et à 360 | ✅ |
| B3 | Les « deux longues barres claires » : c'étaient les ombres des pieds, larges de **84 px au lieu de 34**, posées sur un dégradé sombre qui les faisait lire en clair. Ramenées à 34 × 5 px sous chaque pied. Supprimés avec elles : le fondu sombre au bas de la bande et l'ombre portée des platanes en haut du terrain — sous les poteaux, plus rien d'autre n'est dessiné | ✅ |
| C4 | Le repère de direction **part du cercle de lancer** (dessiné en coordonnées monde, pointillé 6/6 sur 64 px) et reste visible pendant toute la visée, au doigt comme aux curseurs. Mini-carte aux cotes de la maquette (46 × 336), avec la zone du cochonnet et le cadre de vue | ✅ |
| C5 | **La bande fixe a son propre canvas**, en pixels CSS 1:1, hors du canvas du terrain. Plus de parallaxe, plus de calcul de letterbox, plus de DOM qui court après une ligne du canvas : les cotes des maquettes s'appliquent littéralement | ✅ |
| D6 | POINTER / TIRER / engrenage : 38 px visuels dans une rangée de 44 px, typo 14 px, ombre dure 2 px, zone de tap ramenée à 46 px par débord invisible (`::after`, `inset:-6px 0` — la bordure de 2 px mange 2 px du débord) | ✅ |
| D7 | Barre d'icônes : 46 px de haut, fond `#27607e`, icônes 34 px, tap 46 px. « Revoir » toujours présent, grisé (`#ddd6c1` / `#8a8f96`, opacité .75) | ✅ |
| D8 | Bouton unique « LANCER LE COCHONNET » — et il **fonctionne enfin au doigt** : il lançait dans le vide hors mode curseurs | ✅ |
| D9 | Le composant legacy était `styles.ardoise` : une bande quasi noire posée **dans le flux**, hors terrain. Supprimée, ses quatre usages passent en plaque émaillée (`motInfo`). Sur le terrain il ne reste qu'un seul bandeau ardoise, en surimpression, désormais collé **en haut** sous la bande fixe | ✅ |
| D10 | Budget vertical exact : 46 + 118 + terrain + 44 = 844 à 390 px, et 740 à 360 px. Padding et gouttières de la colonne supprimés, bordures bois du terrain retirées (10 px rendus) | ✅ |

### Restes signalés, non corrigés (hors autorisation de ce sprint)

- **La planche hors-jeu coupe la vitesse à zéro** (`stepPhysics`, butée des boules mortes) : un tir qui franchit la ligne du fond encore rapide s'arrête d'un coup, mesuré à 297 px/s sur le grand terrain à force 100. C'est un vrai « plantage net », mais il est hors du frottement d'atterrissage, seul point autorisé à bouger.
- **Un frôlement pose `skidMu`** comme un carreau plein fer : à 21 px du centre la glisse tombe de moitié, en falaise.
- **La boucle de rendu cadence la physique sur l'écran** : à 120 Hz la simulation va deux fois plus vite. Le déterminisme tient (même nombre de pas), mais pas la sensation.
- **Le grand terrain ne montre que ~53 % de sa largeur** : les lignes de côté sortent du cadre, alors que la maquette les montre.
- **Blocage au cochonnet** reproduit sur le build commité : `enCours` reste vrai et avale le lancer en silence pendant 8 s.

## 🏆 v2 — Compétitif (« chess.com de la pétanque »)

| # | Item | Détail | Effort | Dépend de |
|---|------|--------|--------|-----------|
| 9 | **Identité légère** | Pseudo réservé + authentification anonyme Firebase persistante (pas de mot de passe, pas d'email) | M | — |
| 10 | **Sécurisation Firebase** | Règles de lecture/écriture, fin du mode ouvert ; passage hors « mode test » | M | 9 |
| 11 | **Anti-triche serveur** | Cloud Function qui rejoue chaque lancer (la physique déterministe le permet) et rejette les résultats truqués | L | 10 |
| 12 | **Classement Elo** | Elo par pseudo, historique des parties, page classement | M | 9, 11 |
| 13 | **Matchmaking public (Elo vs inconnus)** | ⏸️ Conservé mais **dépriorisé** (analyse concurrentielle : le poison de la catégorie) — à rouvrir quand le jeu entre amis tournera fort | L | 9, 12 |
| 14 | **Mode 2 équipes** | Le format classique 1 c. 1 / doublette / triplette, nécessaire pour un Elo sérieux | S | — |
| 15 | **Spectateurs & partage** | Lien spectateur d'une partie en cours, replay complet d'une partie finie | M | — |
| 36 | **Page d'accueil hub** | Partie rapide 1-clic (vs bot, sans alcool, terrain classique), multijoueur, classement Elo, boutique | M | 9 |

## 🏔️ v3 — Contenus & profondeur

| # | Item | Détail | Effort | Dépend de |
|---|------|--------|--------|-----------|
| 16 | **Terrains à effets** | Gravier (freine), terrain dur (les tirs rebondissent), bosselé (déviations), dévers, racine de platane en obstacle | L | — |
| 17 | **Rotation de terrains** | Terrain du jour / choix en matchmaking | S | 16, 13 |
| 18 | **Tournois** | Bracket à élimination entre équipes, sur un code partagé | M | 14 |
| 19 | **Statistiques joueur** | % de carreaux, précision de pointé, mènes gagnées, historique d'ivresse 🍹 | M | 9 |
| 20 | **Cosmétiques** | Couleurs et motifs de boules, cochonnets fantaisie | M | 9 |

## 📱 v2.5 — Distribution & rétention *(ajouté après l'analyse concurrentielle)*

| # | Item | Détail | Effort | Dépend de |
|---|------|--------|--------|-----------|
| 30 | **PWA installable** | Icône sur l'écran d'accueil, plein écran, chargement instantané — le jeu « ressemble » à une app, sans store ni 290 Mo | S | — |
| 31 | **Notifications push** | « C'est ton tour ! », « Tournée reçue 🍹 » — LA clé de rétention d'un jeu au tour par tour (Android + iOS ≥ 16.4 en PWA) | M | 30 |
| 32 | **App native (wrapper Capacitor)** | Le même code web empaqueté pour App Store/Play. Modèle « un possède, tous jouent » : le porteur de l'app crée la partie et invite les autres par simple lien web | M | 30 |
| 33 | **Stratégie d'achats** | Stores : achat d'impulsion facile mais 15-30 % de commission ; web : Stripe ~2 %. Mixte : le Pastis Club vendu sur le web (modèle chess.com), le confort en app | M | 32 |

## 💰 v4 — Commercialisation

| # | Item | Détail | Effort | Dépend de |
|---|------|--------|--------|-----------|
| 21 | **Contenu alcool** | ⚠️ Bloquant pubs : version publique sans alcool (gages) ou vérification 18+ — **à valider avec un juriste** (loi Évin) | M | Juriste |
| 22 | **Marque** | Nom du jeu, logo, nom de domaine | S | Flavio |
| 23 | **Hébergement dédié** | Quitter GitHub Pages (interdit aux sites commerciaux) pour un hébergeur adapté | S | 22 |
| 24 | **Firebase Blaze** | Plan payant, quotas, monitoring des coûts | S | 10 |
| 25 | **RGPD & CMP** | Bannière de consentement certifiée, politique de confidentialité, mentions légales, modération des pseudos | M | 21, 23 |
| 26 | **Distribution** | Soumission aux portails de jeux (CrazyGames, Poki…) : trafic + partage de revenus, chemin le plus court vers les premiers euros | M | 21 |
| 27 | **Publicité directe** | Régie (rewarded ads : une pub pour rejouer/bonus) une fois le trafic établi | M | 25, 26 |
| 28 | **Pastis Club 🍹** | Abonnement premium : sans pub, stats avancées, terrains exclusifs, cosmétiques — le vrai moteur de revenus (modèle chess.com : ~88 % du CA en abonnements) | L | 19, 25 |
| 29 | **Encaisser** | Rattacher les revenus au statut d'indépendant — **à valider avec le comptable** | S | Comptable |
| 34 | **i18n : version anglaise** | Textes du jeu, de l'aide et du salon en anglais (sélection par la langue du navigateur) — prérequis des portails de jeux | M | 26 |

---

## Le chemin critique

**Marche graphique 1 → Bot (2-4) → PWA + notifications (30-31) → Identité (9) → Sécurisation (10-11) → Classement entre amis (12) → App stores (32) → Portails (21, 26) → Pastis Club (28, 33)**

Chaque étape rend la suivante possible : les graphismes réparent la première impression, le bot crée la rétention solo, les notifications ramènent les joueurs à chaque tour, l'identité permet le classement, le classement crée l'habitude, l'app donne la vitrine, et le trafic seul rend la monétisation intéressante. La pub n'arrive qu'en avant-dernier — comme chez le modèle de référence.
