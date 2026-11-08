# Versions et publications

Pour chaque nouvelle correction ou amélioration livrée après la version 4.2.0 :
- Exécuter `node scripts/release.mjs "Description lisible de la correction"` une fois pour la livraison (plusieurs descriptions possibles).
- Ce script incrémente la version de l’application, ajoute une entrée datée à `releases.json` et synchronise la version du cache et les liens de ressources. Ne pas confondre version de l’application et schéma des données radars.
- Conserver les anciennes entrées : elles sont consultables dans Sources. Le pop-up s’affiche une fois par nouvelle version sur chaque appareil.
- Les dates de consultation des sources ne doivent changer qu’après une consultation réelle. Une actualisation locale ne prouve pas la fraîcheur d’une source tierce.
- Vérifier `node --test tests/*.test.cjs` et `git diff --check` avant publication.
