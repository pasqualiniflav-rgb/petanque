# Ordre de mission — Parcours figure & vue 3ᵉ personne

Version du 20 septembre 2026

## Contexte et périmètre

Cette mission ajoute un parcours complet d'incarnation au jeu : le joueur choisit une figure de village, la personnalise, et se voit jouer à la 3ᵉ personne depuis une caméra basse placée derrière le cercle de lancer.

Ce qui est ajouté :

- Un écran de sélection de figure : neuf personnages, un couvre-chef, une couleur de polo, un numéro.
- Un second moteur de rendu du terrain, à la 3ᵉ personne, activable par interrupteur.
- Une caméra qui suit la figure du lanceur pendant son tour, quel que soit le joueur.
- Une seconde charte graphique, dite ivoire, testable en parallèle de la charte actuelle.

Ce qui n'est pas touché :

- La physique : positions, trajectoires, collisions, glisse après chute. Aucune modification, aucune réécriture, aucun nettoyage au passage.
- Les règles : calcul des points, fin de mène, fin de partie.
- Le rendu actuel du terrain et la charte actuelle, qui restent le comportement par défaut.
- Le protocole de synchronisation Firebase existant.

Maquettes de référence, canvas *Pétanque — Perso & vue 3ᵉ personne* : `Portrait.dc.html` est la seule maquette au bon format et fait foi pour l'écran de jeu ; `Figures.dc.html` fait foi pour la galerie. `Camera-Basse.dc.html`, `Main.dc.html`, `Travelling.dc.html` et `BordTerrain.dc.html` sont en paysage 1280×720 : ce sont des recherches de cadrage, à lire comme intention et jamais comme gabarit.

## Règles de cadrage

Ces six règles priment sur toute interprétation des maquettes. En cas de doute, appliquer la règle et signaler l'écart plutôt que trancher seul.

1. **Portrait mobile 390 × 844.** Le jeu est en portrait. Toute maquette en 1280 × 720 fournie dans ce dossier est une recherche d'intention, jamais un gabarit à transposer.
2. **Une seule source de vérité.** Un seul état de partie, deux façons de le dessiner. Interdiction de dupliquer la logique de jeu dans le nouveau rendu : si le second rendu a besoin d'une donnée que l'état ne porte pas, l'ajouter à l'état, pas la recalculer à part.
3. **La physique reste en mètres.** Le nouveau rendu n'est qu'une projection à l'affichage. Aucune coordonnée écran ne remonte dans le moteur physique.
4. **Aucune régression sur l'existant.** Le rendu actuel et la charte actuelle restent le comportement par défaut. Un lot qui casse le rendu actuel est un lot refusé, même si le nouveau fonctionne.
5. **Les deux chartes cohabitent sans se mélanger.** La charte ivoire est une seconde peau, sélectionnée par un réglage. Pas de valeur ivoire qui fuit dans la charte actuelle, pas de composant partagé qui code en dur une couleur.
6. **Plancher tactile 44 px.** Toute cible cliquable fait au moins 44 px de haut. Refus motivé attendu si une contrainte de place semble l'imposer, jamais un passage en dessous décidé en silence.

Les lots se livrent dans l'ordre. Chaque lot est utilisable seul et se termine par les preuves listées en fin de document.

## Lot 1 — Les neuf figures et le numéro unique

Ce lot livre l'identité du joueur. Il est indépendant du rendu : à sa fin, les figures existent, se choisissent et se stockent, mais le terrain se dessine encore comme aujourd'hui.

### Les neuf figures

| Figure | Signe distinctif | Silhouette |
| --- | --- | --- |
| Le Marius | Béret, foulard au cou | Moyenne |
| La Mémé | Lunettes rondes, chignon gris | Moyenne, voûtée |
| Le Facteur | Casquette d'uniforme, sacoche | Moyenne |
| Le Minot | Petite taille | Courte |
| La Parisienne | Chapeau de paille à ruban | Moyenne |
| Le Papé | Lunettes, chapeau de paille, embonpoint | Large et basse |
| Le Boucher | Tablier blanc, calot rouge | Massive |
| La Patronne | Chignon haut, torchon sur l'épaule | Point haut marqué |
| Le Coureur | Maillot à bande, casquette de cycliste | Filiforme |

Le critère de dessin est la **reconnaissance à la silhouette** : en jeu, un villageois au fond du terrain fait une trentaine de pixels de haut, sans visage ni couleur lisibles. Chaque figure doit rester identifiable à sa seule forme. Les gabarits sont dans `Figures.dc.html`.

### Personnalisation

Trois axes, dans cet ordre de priorité à l'écran : la figure, le couvre-chef (béret, casquette, chapeau de paille), la couleur de polo (crème, moutarde, olive, bleu nuit), le numéro.

Attention, point non négociable : **le polo choisi ne s'affiche pas sur le terrain**. En jeu, l'appartenance d'équipe prime sur la coquetterie. Le polo personnel se voit au salon, sur la carte de profil et à l'écran de fin. Sur le terrain, l'équipe se lit sur le foulard et sur la pastille du numéro.

### Le numéro est un identifiant, pas une décoration

Neuf figures pour neuf joueurs ne garantit pas l'unicité : le choix reste libre et les doublons sont autorisés. C'est le numéro qui distingue deux joueurs qui ont pris la même figure.

- Numéro unique dans la partie, attribué automatiquement de 1 à 9 à l'entrée dans le salon.
- Le joueur peut le changer tant que le numéro visé est libre ; sinon le changement est refusé avec un message clair.
- Si deux joueurs de la **même équipe** ont la même figure, forcer des couvre-chefs différents à l'entrée, en prévenant le second arrivé.
- Le numéro se dessine dans le dos, dimensionné pour être lisible depuis le fond du terrain. Cette taille est une contrainte de lisibilité, pas un choix esthétique.

### Rattachement

| Cas | Où vit la figure | Durée de vie |
| --- | --- | --- |
| Joueur connecté via l'app | Profil du compte | Conservée d'une partie à l'autre |
| Invité web sans compte | État de la partie | Rechoisie à chaque partie |

Le choix de rechoisir à chaque partie pour les invités est **délibéré** : c'est un levier vers l'app. Ne pas ajouter de mémorisation navigateur, même si elle paraît être une amélioration évidente.

Contrepartie à implémenter dans le même lot : l'écran de fin de partie propose à l'invité de garder son personnage, avec le lien vers l'app. Le message se place là, au moment où le joueur vient de passer une bonne partie, et nulle part ailleurs dans le parcours.

### Bots

Les adversaires gérés par l'ordinateur piochent dans les neuf mêmes figures et reçoivent un numéro par la même règle. Aucune allure distincte, aucune marque visuelle qui trahisse un bot.

## Lot 2 — Le second rendu derrière un interrupteur

Ce lot livre la vue à la 3ᵉ personne en portrait, à côté du rendu actuel et jamais à sa place. Maquette de référence : `Portrait.dc.html`.

### L'interrupteur

Un réglage visible dans le menu options permet de basculer entre *Vue de dessus* (défaut) et *Vue joueur*. Le réglage est personnel et se conserve entre les parties. Il doit pouvoir changer **en cours de partie**, pour comparer les deux rendus sur la même position — c'est tout l'intérêt de la période de test.

Même exigence côté charte : un second réglage bascule entre la charte actuelle et la charte ivoire. Les deux réglages sont indépendants.

### La caméra

La caméra est basse, placée derrière le cercle de lancer, orientée vers le fond du terrain.

Point structurant : à la pétanque **tout le monde lance depuis le même cercle**. La caméra ne bouge donc pas de toute la mène, quel que soit le joueur. Seule la figure présente dans le cercle change. Le seul moment où la caméra se replace est le changement de mène, quand le cercle se retrace là où était le cochonnet.

### Structure de l'écran, de haut en bas

| Bande | Hauteur | Contenu |
| --- | --- | --- |
| Barre d'icônes | 56 px | Revoir (grisé quand indisponible), cigales, musique, aide, accueil |
| Compteur | 106 px | Plaque bois, deux rails, ligne d'état |
| Décor + terrain | reste | Horizon fixe en haut, terrain en perspective en dessous |
| Boutons | 52 px | POINTER, TIRER, options — 44 px de haut |

La jauge de force flotte au-dessus des boutons, par-dessus le terrain. La bande de décor — ciel, soleil, guirlande, maisons, platanes, muret — est fixe : elle ne défile pas avec le terrain.

### Le compteur à rails

Le compteur reprend le comptage 1 à 13 par équipe déjà en place. Une seule évolution demandée, et elle est le cœur de la proposition : **le jeton se pose sur le cran atteint** au lieu de rester calé à gauche. L'écart entre les deux équipes se lit alors d'un coup d'œil, comme sur un compteur de boulodrome réel. Le chiffre reste écrit dans le jeton.

La ligne du bas conserve les informations actuelles : boules restantes par équipe, numéro de mène, chrono, joueur en cours.

### La projection

Un seul point d'entrée : une fonction qui prend une position du terrain en mètres et rend une position écran plus une échelle. Tout le rendu passe par elle — boules, cochonnet, figures, cercle, panneau.

- Les boules sont volontairement grossies. Le facteur de triche actuel est conservé tel quel ; il s'ajustera sur mobile réel, pas sur maquette.
- Le repère de visée part du cercle de lancer en pointillés. Pas de trajectoire projetée au sol : la difficulté de visée reste celle d'aujourd'hui.
- Pas de mini-carte. En portrait, l'axe de profondeur est l'axe long de l'écran et la vue se lit presque comme un plan. La mini-carte était une compensation du format paysage ; elle n'a plus lieu d'être.

### Le panneau dans la scène

À ne pas confondre avec le compteur : il s'agit d'un éventuel panneau posé au sol dans le décor. S'il est implémenté, il est **planté à distance fixe du cercle de lancer**, ce qui lui garde une taille constante à l'écran quand la caméra se replace entre deux mènes. C'est aussi ce qu'on fait en vrai : on déplace le panneau avec le cercle.

## Lot 3 — La caméra suit le lanceur

Ce lot anime la séquence de lancer. Il ne s'attaque qu'au rendu : aucune règle, aucun calcul de trajectoire n'est modifié.

### La séquence

1. **Visée.** La figure du joueur dont c'est le tour se tient dans le cercle, de dos. Le joueur règle la direction, la figure pivote. La jauge de force est active.
2. **Geste.** Au relâcher, animation courte : balancier ample pour le pointé, élan sec pour le tir.
3. **Vol.** La caméra décroche de la figure et suit la boule jusqu'à l'impact, puis marque un temps sur le résultat.
4. **Retour.** La caméra revient à sa position de visée, la figure suivante entre dans le cercle.

### Qui regarde quoi

La séquence est la même pour tout le monde : **tous les joueurs voient la figure du lanceur de dos**, y compris quand ce n'est pas leur tour. Personne ne joue en accéléré pendant que les autres attendent.

Cela ne coûte aucune seconde supplémentaire : l'attente entre les tours existe déjà, on remplace un point qui se déplace par un villageois qui fait son geste. Durée identique, temps mort mieux rempli.

### Synchronisation

Rien de nouveau à diffuser. La caméra se déduit entièrement de l'état déjà partagé : qui joue, ce qu'il lance, où la boule atterrit. Aucun nouveau message Firebase, aucune horloge de rendu partagée entre clients.

Si un client prend du retard, il rattrape sur l'état final de la boule et saute l'animation. L'état de la partie ne dépend jamais de l'avancement d'une animation.

## Tests et preuves attendues

Chaque lot se termine par un tableau de tests renseigné. Une case cochée sans mesure n'est pas une preuve.

| Lot | Ce qui doit être prouvé | Preuve attendue |
| --- | --- | --- |
| 1 | Neuf figures sélectionnables, chacune identifiable à sa silhouette | Capture de la galerie + capture des neuf silhouettes à 30 px de haut |
| 1 | Numéro unique dans la partie | Test : 9 joueurs entrent, aucun doublon ; un 10ᵉ changement vers un numéro pris est refusé |
| 1 | Doublons de figure dans une même équipe forcent des couvre-chefs différents | Test avec deux joueurs même équipe même figure |
| 1 | Le polo personnel ne s'affiche pas sur le terrain | Capture salon + capture terrain du même joueur |
| 1 | Aucune mémorisation navigateur pour l'invité | Preuve par grep : aucun stockage local de la figure |
| 2 | Bascule de rendu en cours de partie, sans perte d'état | Enregistrement : bascule au milieu d'une mène, scores et positions inchangés |
| 2 | Le rendu actuel est intact | Captures avant/après du rendu par défaut, à positions identiques |
| 2 | Cibles tactiles ≥ 44 px | Mesures relevées, pas une estimation |
| 2 | Aucune fuite de charte | Preuve par grep : aucune couleur ivoire dans les composants de la charte actuelle |
| 3 | Animation de lancer identique pour tous les clients | Deux clients côte à côte sur le même lancer |
| 3 | Aucun nouveau message de synchronisation | Journal des écritures Firebase avant/après |
| 3 | Un client en retard rattrape sans désynchroniser | Test avec latence simulée |

### Récidives connues à ne pas réveiller

Le tir à vide qui se plante en est à sa troisième récidive. Règle en vigueur, rappelée ici : **diagnostic instrumenté obligatoire avant toute correction**, jamais un correctif tenté à l'aveugle. Le tableau de tests doit porter une colonne *glisse après chute* renseignée par mesure.

Le composant toast noir hérité, celui du message d'entrée en équipe, doit être absent du nouveau parcours. Preuve par grep.

## Décider, puis supprimer le perdant

Les deux rendus et les deux chartes cohabitent pour être comparés, pas pour durer. Un interrupteur temporaire qui reste six mois devient une dette permanente.

### Ce qu'on observe

| Question | Comment trancher |
| --- | --- |
| Sait-on qui tient le point sans hésiter ? | Sur de vraies parties, en vue joueur, sans aide visuelle |
| Les scores du compteur se lisent-ils sans effort sur mobile ? | Sur téléphone réel, pas sur maquette |
| La séquence de lancer lasse-t-elle après une dizaine de mènes ? | Une partie complète à 9 joueurs |
| La charte ivoire tient-elle sur 390 px de large ? | Comparaison côte à côte des deux chartes |

Réserve connue sur la charte ivoire : ses bordures de 3 px et ses ombres décalées en diagonale prennent plus de place que les 2 px et les ombres vers le bas de la charte actuelle. Sur un écran étroit, cela se sent. Si le rendu paraît lourd, le premier réglage à tenter est de passer les bordures à 2 px en gardant le reste.

### Date de péremption

Deux sprints après la livraison du lot 2. À cette échéance, un rendu et une charte sont retenus, les autres sont supprimés du code — pas désactivés, supprimés.
