# 🔍 Analyse concurrentielle — « La Pétanque » (Thomas Royer) et le marché de la pétanque virtuelle

*Sources : fiches App Store / Google Play, notes de versions, avis joueurs, captures d'écran de Flavio, scan du marché. Septembre 2026.*

---

## 1. Fiche d'identité du concurrent

| | |
|---|---|
| **Jeu** | La Pétanque — Thomas Royer Interactive |
| **Ancienneté** | Première sortie octobre 2015 → **10 ans d'itérations** (v36.x) |
| **Plateformes** | iOS + Android, natif, **~290 Mo à installer** |
| **Traction** | 1 M+ téléchargements (Play), 250 k+ (App Store) |
| **Note** | **3,5 / 5** (≈5 500 avis Play, ≈345 iOS) |
| **Modèle éco** | Gratuit + **publicités + achats intégrés** |
| **Équipe** | Développeur solo (portfolio d'une dizaine de petites apps), très réactif aux avis |

## 2. Ce qu'il fait bien (et qu'on doit respecter)

- **Rendu 3D** (Unity vraisemblablement) : fonds photo de vraies places de village, boules métalliques réfléchissantes, ombres, traces dans le sable, vue de dessus en incrustation + anneau de visée pour le tir
- **Boules à caractéristiques** (curseurs Tir/Pointe par modèle) et **progression par niveaux** : boules débloquées au niveau 10, terrains au niveau 5 — la boucle de rétention classique
- **Terrains personnalisés à partir d'une photo**, curseur de graviers qui modifie le comportement du terrain
- **Multijoueur mature** : doublette/triplette/duels jusqu'à 6, duel automatique contre le prochain connecté, tournois (top 16 connectés), compensation de lag, classement mondial + classement des actifs sur 7 jours
- **Anti rage-quit** : système de cartons progressifs (+15 min par carton, carton rouge de 24 h au 4ᵉ) — signe qu'il a beaucoup souffert du problème

## 3. Ses faiblesses (ce que disent ses propres joueurs)

- **3,5/5 après dix ans** : le plafond de verre. Les avis récents mentionnent des bugs bloquants (« impossible de tirer » sur des parties entières), des mises à jour qui fâchent les habitués, de la confusion sur les règles de victoire quand l'adversaire quitte
- **Le multijoueur avec des inconnus est son talon d'Achille** : quitters, comportements toxiques — tout son arsenal (cartons, coupes automatiques) est défensif
- **290 Mo et un store entre toi et la partie** : impossible d'embarquer 8 copains en 30 secondes un soir d'apéro
- **6 joueurs maximum, 2 camps** : pas de format 3 équipes, pas de grosse tablée
- **Zéro mécanique sociale ou festive** : c'est un simulateur sérieux, pas un jeu de soirée
- UX chargée (menus à l'ancienne), audience de passionnés plutôt que grand public

## 4. Le marché élargi : un étang, pas un océan

| Concurrent | Signal |
|---|---|
| **Pétanque** (Giraffe Games) | Modèle à mises/pièces contesté ; avis récents : joueurs qui refusent les parties, soupçons de triche sur les gains, « le jeu est mort depuis la mise à jour de mai 2026 » |
| **Pétanque 3D** (bocce en ligne) | Tournois verrouillés derrière des pièces à farmer — frustration en avis |
| **Pétanque Multijoueur** (boule lyonnaise) | Niche dans la niche |
| Jeux web gratuits | Reliques de l'ère Flash, sans multijoueur sérieux |

**Trois enseignements de marché :**
1. **Le TAM est petit.** Le leader incontesté, après une décennie à temps plein, plafonne à 1 M+ d'installations et une note moyenne. C'est un marché de passion, pas un marché de masse — l'ambition « chess.com de la pétanque » doit être redimensionnée en conséquence.
2. **Le poison n°1 de toute la catégorie : le multijoueur avec des inconnus** (quitters, toxicité, matchmaking vide). Tous les acteurs s'y cassent les dents.
3. **Personne n'occupe le créneau « party game »** : le jeu qu'on lance en 30 secondes entre gens qui se connaissent, avec du délire dedans.

## 5. Verdict stratégique : deux produits différents

**Ne pas attaquer le simulateur de front.** Royer a dix ans d'avance sur son terrain ; le rattraper coûterait des années pour se partager un petit étang.

**Notre créneau, validé en creux par ses faiblesses :**

| | La Pétanque (Royer) | Nous |
|---|---|---|
| Accès | Store, 290 Mo, compte | **Un lien web, 30 secondes, zéro compte** |
| Format | 6 joueurs max, 2 camps | **9 joueurs, 3 équipes** |
| Public | Passionnés qui jouent avec des inconnus | **Bandes d'amis** (le problème des quitters disparaît de lui-même) |
| Ton | Simulation sérieuse | **Apéro : tournées, ivresse, Fanny, cigales** — unique sur le marché |
| Rétention | Niveaux, boules à débloquer | Ranked Elo entre amis + saison d'apéro |

Positionnement en une phrase : **« le jeu de pétanque de la soirée, pas du championnat »** — le Jackbox/Gartic Phone de la pétanque, pas son Football Manager.

## 6. Réponse au choc graphique — plan en trois marches

Constat honnête : on ne gagnera pas le concours de beauté contre dix ans d'Unity. Objectif réaliste : **« assez beau pour ne pas faire fuir »** — le fun fait le reste (Among Us et Wii Sports n'ont jamais brillé par leurs graphismes).

- **Marche 1 — gros effet, faisable vite (notre canvas actuel le permet)** : fond photo de place de village au-dessus du terrain, **traces des boules qui restent dans le sable** (calque persistant), boules métalliques en dégradé travaillé, grain et ombres du terrain, impacts de tir marqués
- **Marche 2 — moyen** : vue en perspective pseudo-3D (terrain en trapèze, caméra basse, boules qui grossissent en approchant) — toujours en canvas, exigeant mais faisable
- **Marche 3 — gros chantier, seulement si les tests l'exigent** : vrai rendu 3D (three.js), le niveau Royer

Décision proposée : livrer la marche 1, tester auprès des 9, et ne monter les marches suivantes que si le verdict des joueurs l'impose.

## 7. Conséquences sur le backlog

- **Inchangé** : bot → identité → sécurisation → Elo (le chemin critique tient)
- **Ajouté en priorité haute** : Marche graphique 1 (photo + traces + polish)
- **Dépriorisé** : matchmaking public avec inconnus (le poison de la catégorie ; notre force est justement de ne pas en dépendre) — remplacé par : classement et tournois **entre amis / entre bandes**
- **Redimensionné** : la commercialisation vise un revenu d'appoint fièrement gagné, pas une licorne — portails de jeux + Pastis Club léger, coûts quasi nuls, et on laisse le volume décider

## 8. Devoir maison 🏠

Tester le multijoueur de Royer avec un ami et chronométrer/noter : temps entre « envie de jouer » et « première boule lancée », friction d'inscription, comportement des inconnus croisés, sensations de tir. C'est notre meilleur benchmark d'onboarding — et c'est là qu'on doit l'écraser.
