# 🚨 Fou du Volant — Radars France (PWA v2.1)

Carte interactive et assistant d'aide à la conduite des **radars automatiques en France** avec alertes de proximité, **synthèse vocale mains-libres**, **détection de survitesse**, mode voiture tête-haute (HUD) et signalement communautaire. PWA hors-ligne installable sur iPhone/Android.

---

## ✨ Fonctionnalités majeures

### 🗼 Typologie complète du parc français (~4 800 radars)
- **Radars tourelles** (Mesta Fusion) 🗼
- **Radars discriminants** (distinction VL vs Poids Lourds avec double limitation) 🚛🚗
- **Radars autonomes & de chantier** (semi-fixes) 🚧
- **Radars urbains** 🏙️
- **Radars tronçons** (vitesse moyenne avec calcul de longueur) ⏱️
- **Radars feux rouges & passages à niveau** 🚦🚂
- **Radars fixes classiques** 📷
- **Cabines leurres / Itinéraires sécurisés** 🎭

---

### 🗣️ Alertes & Assistant Vocal
- **Synthèse Vocale (TTS)** : Annonces parlées automatiques en français (*"Attention, radar discriminant dans 500 mètres, limité à 80"*).
- **Alerte de Survitesse** : Si votre vitesse dépasse la limitation du radar, l'interface flashe en rouge d'urgence avec avertissement vocal (*"Ralentissez !"*).
- **Filtrage directionnel** : Alerte **uniquement dans le sens de circulation** ($\pm 60^\circ$).
- **Multi-alertes personnalisables** : Bip audio progressif, vibrations haptiques et notifications push.

---

### 🚗 Mode Voiture Tête-Haute (HUD)
- **Activation automatique** dès que la vitesse dépasse 30 km/h.
- Compteur de vitesse géant et lisible en un coup d'œil.
- Affichage des panneaux de limitation de vitesse (VL et PL si discriminant).
- Distance et type du prochain radar avec escalade d'alerte (vert $\rightarrow$ ambre $\rightarrow$ rouge pulsant).
- **Wake Lock** : Maintien de l'écran allumé pendant la conduite.

---

### 👥 Communauté en temps réel (Supabase)
- **Tap long sur la carte** pour signaler instantanément un événement :
  - 🚓 Radar mobile
  - 🚙 Voiture-radar privatisée
  - 🚧 Radar autonome / chantier
  - 👮 Zone de contrôle
  - ⚠️ Zone de danger
  - 📡 Nouveau radar fixe
- Votes 👍 / 👎 sur les signalements avec déduplication par utilisateur.
- Expiration automatique des signalements anciens (24h/48h).

---

## 🚀 Installation & Déploiement

### Étape 1 — Cloner le projet
```bash
git clone https://github.com/nxm310/fou_du_volant.git
cd fou_du_volant
```

### Étape 2 — Mettre à jour la base des radars
Le projet inclut la base `radars.json`. Pour la rafraîchir à tout moment depuis data.gouv.fr :
```bash
python scripts/update_radars.py
```

### Étape 3 — Configurer Supabase (Backend communautaire)
1. Créez un projet gratuit sur [supabase.com](https://supabase.com).
2. Dans le **SQL Editor**, exécutez le script [`supabase-setup.sql`](file:///e:/antigravity/pc/fou%20du%20voant/supabase-setup.sql).
3. Renseignez vos clés publiques dans [`config.js`](file:///e:/antigravity/pc/fou%20du%20voant/config.js) :
```js
window.SUPABASE_URL = 'https://TON_PROJET.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

### Étape 4 — Tester en local
```bash
# Avec Python
python -m http.server 8000
```
Ouvrez [http://localhost:8000](http://localhost:8000) dans votre navigateur.

---

## 📱 Utilisation sur Smartphone (PWA)

- **iOS (Safari)** : Bouton Partager $\rightarrow$ **Sur l'écran d'accueil**.
- **Android (Chrome)** : Menu $\rightarrow$ **Installer l'application**.

---

## 📊 Sources & Licences
- **Données officielles** : Ministère de l'Intérieur / [data.gouv.fr](https://www.data.gouv.fr/datasets/radars-automatiques) (Licence Ouverte 2.0).
- **Cartographie** : [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
- **Moteurs** : Leaflet, Supabase JS SDK.
