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
