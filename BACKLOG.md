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
| 8 | **QA multi-supports** | Passe complète PC (Chrome/Firefox/Safari/Edge) + mobiles, corrections | M | — |

## 📱 Sprint mobile — retours de la partie test *(item 8)*

| # | Item | Détail | État |
|---|------|--------|------|
| A1 | **Synchro** | ~~Sauts/coupures entre un lancer, son affichage et le tour suivant~~ ✅ Corrigé — le rafraîchissement de fin de rejeu se croyait encore en animation et ne faisait rien (attente du sondage, 0-4 s) ; résultat officiel désormais en ~30 ms, tapis figé le temps qu'il arrive, pause de 3 s sur le tapis final en fin de mène, chronomètre local (plus de dérive d'horloge entre téléphones) | ✅ |
| B2 | **Lancer au doigt** | Glisser-relâcher sur le terrain : direction + force, flèche de visée ; curseurs gardés en option | ⬜ |
| B3 | **Mise en page mobile** | Zéro scroll, terrain agrandi, zones tactiles ≥ 44 px | ⬜ |
| B4 | **Scoreboard de stade** | Panneau d'affichage compact façon fronton de boulodrome | ⬜ |
| B5 | **Boutons** | Suppression d'Actualiser, ↺ pour revoir, ⌂ retour accueil | ⬜ |
| C6 | **Sons** | Plus de démarrage automatique : 🦗 et 🎵 seuls déclencheurs | ⬜ |
| C7 | **Chronomètre** | 15 → 20 s | ⬜ |
| C8 | **Tournée** | Popin bloquante pour l'équipe gagnante, expiration 20 s → Passer | ⬜ |
| C9 | **Ivresse** | Plus d'aléa sur le geste ; effets visuels et sonores conservés | ⬜ |
| C10 | **Mode sans tournée** | Option de l'hôte, préfigure la version tous publics | ⬜ |
| C11 | **Accès** | 🎲 prénom provençal, code auto, « Partager le lien » (?partie=CODE) | ⬜ |
| D12 | **Pointé avec portée** | La boule vole 40-60 % puis roule ; recalibrage des deux terrains, tests numériques | ⬜ |
| D13 | **Cochonnet** | Calibration propre, un peu plus vif que les boules | ⬜ |
| D14 | **Fin de partie** | Bonus : confettis, cochonnet doré, rappel de la Fanny | ⬜ |

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

---

## Le chemin critique

**Marche graphique 1 → Bot (2-4) → PWA + notifications (30-31) → Identité (9) → Sécurisation (10-11) → Classement entre amis (12) → App stores (32) → Portails (21, 26) → Pastis Club (28, 33)**

Chaque étape rend la suivante possible : les graphismes réparent la première impression, le bot crée la rétention solo, les notifications ramènent les joueurs à chaque tour, l'identité permet le classement, le classement crée l'habitude, l'app donne la vitrine, et le trafic seul rend la monétisation intéressante. La pub n'arrive qu'en avant-dernier — comme chez le modèle de référence.
