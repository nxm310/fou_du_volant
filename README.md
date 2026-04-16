# 🚨 Radars France — PWA v2

Carte interactive des radars automatiques en France avec alertes de proximité, mode voiture tête-haute, et signalement communautaire. PWA hors-ligne, installable iPhone/Android.

## ✨ Fonctionnalités

**Alertes intelligentes**
- Distance de déclenchement configurable (200 m – 2 km)
- Filtrage **devant toi uniquement** (±60°) — ignore les radars derrière
- Bip audio, vibration, notification système — tout configurable
- Escalade visuelle : bleu → orange (<600 m) → rouge pulsant (<300 m)

**Mode voiture 🚗**
- Activation **automatique à > 30 km/h** (confirmée en 3 s, désactivée à < 10 km/h après 10 s)
- Plein écran avec vitesse actuelle en très gros + distance au prochain radar
- Badge "vitesse autorisée" type panneau routier pour les radars avec VMA connue
- **Wake Lock** : écran qui reste allumé (iOS 16.4+, Android)

**Communauté 🛰️**
- Stockage Supabase (backend gratuit, open-source)
- **Tap long sur la carte** pour signaler : radar mobile, nouveau radar, zone de contrôle, zone de danger
- Votes 👍/👎 sur les signalements des autres
- Auto-expiration : mobiles 48h, zones de contrôle 24h
- Désactivation auto si vote cumulé < -2

**Données officielles**
- Dataset [data.gouv.fr](https://www.data.gouv.fr/datasets/radars-automatiques)
- Cache 7 jours, fallback proxy CORS si besoin
- Fonctionne hors-ligne (service worker)

## 🚀 Setup complet

### Étape 1 — Cloner / copier les fichiers

```
radars-pwa/
├── index.html
├── config.js                ← à éditer (clés Supabase)
├── manifest.json
├── service-worker.js
├── supabase-setup.sql       ← script à exécuter dans Supabase
└── icons/
```

### Étape 2 — Créer le projet Supabase (5 min)

1. Crée un compte gratuit sur https://supabase.com
2. **New project** → nom au choix (ex: `radars-fr`), région la plus proche (Europe West)
3. Attends que le projet soit prêt (~2 min)
4. Va dans **SQL Editor** → **New query**
5. Copie-colle tout le contenu de `supabase-setup.sql` et clique **Run**
   → ça crée la table, les policies de sécurité, et la fonction de vote
6. Va dans **Project Settings → API** et récupère :
   - **Project URL** (ex: `https://abcdefgh.supabase.co`)
   - **anon / public key** (longue chaîne commençant par `eyJ...`)

### Étape 3 — Configurer l'app

Édite `config.js` :

```js
window.SUPABASE_URL = 'https://TON_PROJET.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOi...ta_cle_anon';
```

⚠️ Les clés `anon` sont **publiques par design** chez Supabase. La sécurité est assurée par les Row Level Security policies (déjà dans le SQL). Tu peux committer ce fichier sans souci.

### Étape 4 — Déployer sur GitHub Pages

```bash
cd radars-pwa
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON_USER/radars-pwa.git
git push -u origin main
```

Sur GitHub : **Settings → Pages → Source: main / root → Save**

App dispo sur `https://TON_USER.github.io/radars-pwa/` en ~1 min.

### Étape 5 — Installer sur iPhone

- Ouvre dans **Safari** (obligatoire)
- Partager → **Sur l'écran d'accueil**
- Lance l'app, autorise la géoloc, les notifications si tu veux

## 🎮 Usage

| Action | Geste |
|--------|-------|
| Me recentrer | Bouton 📍 |
| Mode voiture manuel | Bouton 🚗 |
| Réglages | Bouton ⚙︎ |
| Signaler un radar | **Tap long** sur la carte (700 ms) |
| Confirmer/infirmer un radar communautaire | Clic sur le marker vert/rouge |

## 🧠 Notes techniques

**Calcul du cap** : l'API `Geolocation` fournit `heading` mais Safari le donne rarement. L'app calcule donc le cap à partir des deux dernières positions dès qu'on roule > 3.6 km/h. Plus fiable, mais légèrement en retard.

**Filtre devant/derrière** : ne s'active que si on roule > 7 km/h (sinon le cap est aléatoire). Angle ±60° = tolérance pour les virages.

**Anti-spam d'alertes** : même radar = une seule alerte, ré-armée après 60 s. Bip plus aigu et vibration longue pour les radars à moins de 300 m.

**Radars communautaires** : chargés dans un rayon de 50 km autour de toi, rechargés automatiquement quand tu t'éloignes. Pas de realtime pour économiser le quota — à ajouter si besoin.

**Quotas Supabase gratuit** : 500 MB de DB + 2 GB de transfert / mois. Large pour un usage perso même partagé.

## ⚠️ Limitations iOS

- GPS actif **uniquement app ouverte** (pas de background vraiment)
- Son d'alerte nécessite un premier tap pour initialiser WebAudio
- Wake Lock nécessite iOS 16.4+
- Notifications push : iOS 16.4+ et **seulement si l'app est installée à l'écran d'accueil**

## 📊 Sources

- Radars officiels : [data.gouv.fr — Radars automatiques](https://www.data.gouv.fr/datasets/radars-automatiques) (Licence Ouverte 2.0)
- Carte : [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)
- Leaflet (BSD-2), Supabase-js (MIT)

## 🛠️ Dev local

Service worker exige HTTPS ou localhost :

```bash
python3 -m http.server 8000
# ou
npx serve .
```

## 📝 Licence

MIT — à toi de voir.
