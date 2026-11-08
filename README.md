# Fou du Volant · expérience mobile v4

Application web installable, sans compilation ni compte utilisateur. Interface conçue pour iPhone : carte, regroupement des points au dézoom, panneau de trajet, mode conduite, sources et réglages.

## Lancer

Depuis ce dossier : `python3 -m http.server 8080 --bind 127.0.0.1`, puis ouvrir http://127.0.0.1:8080.

Pour un iPhone, héberger les fichiers sur HTTPS (GitHub Pages convient). Dans Safari : Partager → Sur l’écran d’accueil → Ouvrir comme app web. Le serveur local lié à 127.0.0.1 est un aperçu sur ce Mac uniquement. Les modifications locales ne sont pas automatiquement publiées.

## Ce qui fonctionne

- Carte Esri sombre ou OpenStreetMap, avec attribution. Anciennes préférences Google migrées ; aucune tuile Google non documentée.
- Base embarquée de 4 523 points, import ASC/CSV/GPX/KML, signalements locaux expirant après trois heures au prochain chargement.
- GPS déclenché au toucher ; pause lorsque l’application est masquée, reprise au retour. Son déverrouillé au démarrage du trajet.
- Mode conduite, estimation de la voie via OSRM, préférence de survitesse respectée, veille écran demandée uniquement en mode conduite.
- Coque de l’application, bibliothèque Leaflet et base embarquée mises en cache après une première ouverture connectée. Les cartes nécessitent une connexion ; aucune carte hors ligne téléchargée en masse.
- Rafraîchissement invalide ou échoué : conservation des données enregistrées, aucune annonce de succès trompeuse.

## Limites à connaître

Ce n’est pas une application native App Store. Aucun suivi fiable en arrière-plan, écran verrouillé ou CarPlay n’est fourni. Le GPS et l’audio doivent être vérifiés sur un iPhone réel ; l’aperçu de bureau ne valide pas ces capacités. La veille écran dépend de la version de Safari/iOS.

Le bouton Actualiser recharge le fichier `radars.json` publié avec le projet. Ce n’est pas une synchronisation en temps réel avec les autorités. Le fichier déclare une date officielle du **11 juillet 2025** ; sa date d’assemblage du 31 octobre 2026 ne garantit pas la fraîcheur des implantations. Les positions et limitations n’ont pas été revérifiées individuellement. Les 458 itinéraires officiels ont été reclassés en itinéraires de contrôle, sans alerte ponctuelle. Ce ne sont pas des appareils localisés.

Les signalements et imports ne sont pas partagés avec d’autres conducteurs ; les imports restent en mémoire pour la session. Il n’existe aucun serveur communautaire. Aucun calcul d’itinéraire ou de vitesse moyenne entre deux points n’est implémenté.

La carte et le nom de voie sollicitent des services tiers. Pendant le suivi visible, OSRM reçoit les coordonnées pour estimer la voie ; le service de démonstration n’offre pas de garantie de production. Pour un produit public : fournisseur de cartographie/routage contractualisé, pipeline de données datées et traçables, revue du cadre français des avertisseurs et conception des zones dangereuses avant mise en service routière. La présence de données publiques ne vaut pas certification de conformité de l’assistant.

## Sources vérifiées le 8 novembre 2026

- [Apple — Transformer un site web en app](https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios) : installation sur l’écran d’accueil.
- [data.gouv.fr — Radars automatiques](https://www.data.gouv.fr/datasets/radars-automatiques) : point d’entrée pour les données publiques ; contrôler la date et la licence de chaque ressource avant ingestion. Aucune nouvelle base tierce n’a été intégrée sans validation de sa provenance.
- [Sécurité routière — Carte des radars](https://www.securite-routiere.gouv.fr/radars/carte-des-radars) : informations officielles de référence.
- [Service Public — Vitesse au volant](https://www.service-public.gouv.fr/particuliers/vosdroits/F19460) : règles applicables et équipements interdits.
- [OSMF — Tile usage policy](https://operations.osmfoundation.org/policies/tiles/) : attribution, usage interactif et interdiction de téléchargement massif/hors ligne des tuiles publiques.
- [WebKit — Wake Lock en app écran d’accueil](https://bugs.webkit.org/show_bug.cgi?id=254545) : correctif annoncé pour iOS 18.4 ; validation matérielle nécessaire.

## Vérifier

`node --test tests/offline.test.cjs`

Tests de régression : inventaire des fichiers précachés, modules avec paramètres de version hors ligne, réponse valide sur ressource absente, conservation de la base après panne réseau ou contenu invalide, conservation des caches appartenant à d’autres applications.

Pour une version App Store : créer un projet iOS, définir les permissions et la politique de confidentialité, remplacer le suivi web par un service natif si le fonctionnement en arrière-plan est requis, puis signer et tester avec un compte Apple Developer. Un simple emballage du site ne garantit pas l’acceptation par Apple.

## Radars de chantier · ajout du 8 novembre 2026

Le bouton **Chantiers** ouvre trois fiches documentaires (Reims/A344, Viais/D178, Le Cours/N166), conservées dans `data/sourced_chantiers.json`. Elles affichent la date d’installation annoncée, la date de consultation et la source Radars-Auto. La présence actuelle n’est pas confirmée. Les pages consultées ne fournissent pas de coordonnées exploitables : aucun point GPS n’a été inventé et ces trois fiches ne déclenchent aucune alerte. Le bouton de carte ne s’active que si des points de chantier localisés ont été importés ou signalés.

Les 458 anciens points `sr_I_*` sont des itinéraires, désormais séparés via le filtre **Itinéraires** et exclus des alertes ponctuelles. La correction s’applique également aux anciennes bases IndexedDB en cas de panne réseau. Le script de génération conserve cette distinction. Il n’existe pas de flux temps réel branché sur Radars-Auto ; cette sélection n’est pas une base nationale exhaustive et aucun droit de redistribution d’une base complète n’est présumé.

Sources des fiches :
- https://www.radars-auto.com/emplacements/marne/reims/7895-radar-autonome-a344/
- https://www.radars-auto.com/emplacements/loire-atlantique/pont-saint-martin/8006-radar-autonome-viais-d178/
- https://www.radars-auto.com/emplacements/morbihan/radars-autonomes/

Vérifications supplémentaires : `node --test tests/data-quality.test.cjs`.

## Sources et nouveautés · version 4.2.0

Dans **Sources**, le bouton **Réactualiser les sources** télécharge à nouveau `radars.json` et les fiches documentaires publiées avec l’application. Il affiche le résultat de chaque téléchargement, y compris si un seul réussit. En cas d’échec, les données précédentes et leur date de téléchargement sont conservées. Ce bouton ne consulte pas directement les sites tiers et ne déclenche pas le script de collecte Python.

La date officielle de la base, la préparation du fichier, les dates de consultation des fiches et le dernier téléchargement sur l’appareil sont présentés séparément. Un nouveau téléchargement ne change jamais la date de consultation de la source. Les horaires utilisent le fuseau du téléphone.

Les nouveautés s’ouvrent au premier lancement de chaque version. Après fermeture, elles restent accessibles depuis **Sources → Voir les nouveautés**. Si le stockage du navigateur est désactivé, la fenêtre peut réapparaître. L’historique est enregistré dans `releases.json`.

Pour chaque livraison suivante : `node scripts/release.mjs "Description de la correction"`. Le script incrémente le numéro, le cache et les liens de ressources, puis conserve une entrée datée dans l’historique. Une ancienne instance doit être fermée puis rouverte pour activer une version en attente, afin de conserver un ensemble cohérent de fichiers.
