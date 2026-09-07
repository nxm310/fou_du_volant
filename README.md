# 🚨 Fou du Volant — Radars France (PWA v2.2)

Carte interactive et assistant d'aide à la conduite des **radars automatiques et communautaires en France** avec alertes de proximité, **synthèse vocale mains-libres**, **détection de survitesse**, mode voiture tête-haute (HUD OLED), détection d'axe en direct et import des bases **Lufop.net**.

---

## ✨ Fonctionnalités majeures

### 🗼 Typologie complète du parc français (~4 800 radars + Lufop)
- **Radars tourelles** (*Mesta Fusion*) 🗼
- **Radars discriminants** (*distinction VL vs Poids Lourds avec double limitation*) 🚛🚗
- **Radars autonomes & de chantier** (*semi-fixes*) 🚧
- **Radars urbains** 🏙️
- **Radars tronçons** (*vitesse moyenne avec calcul de longueur*) ⏱️
- **Radars feux rouges & passages à niveau** 🚦🚂
- **Radars fixes classiques** 📷
- **Cabines leurres / Itinéraires sécurisés** 🎭
- **Radars mobiles & contrôles routiers** 🚓👮

---

### 📁 Support & Import des bases Lufop.net
- **Liens directs intégrés** dans l'application pour télécharger les packs officiels Lufop :
  - 📥 *Radars mobiles fréquents* (CSV / GPX)
  - 📥 *Radars fixes & tourelles* (CSV / GPX)
  - 📥 *Pack complet France*
- **Import 1-clic dans l'application** : Glissez-déposez n'importe quel fichier CSV, ASC ou GPX issu de Lufop directement dans le panneau *Réglages* pour l'intégrer à votre carte !
- **Script de fusion local** : Placez vos fichiers dans le dossier `data/lufop/` et lancez `python scripts/update_radars.py` pour régénérer la base `radars.json`.

---

### 🗣️ Alertes & Assistant Vocal
- **Synthèse Vocale (TTS)** : Annonces parlées automatiques en français (*"Attention, radar discriminant dans 500 mètres, limité à 80"*).
- **Alerte de Survitesse** : Si votre vitesse dépasse la limitation du radar, le cockpit flashe en rouge d'urgence avec avertissement vocal (*"Ralentissez !"*).
- **Filtrage d'Axe Intelligent** : Détection de la route actuelle et filtrage géométrique par couloir de trajectoire ($\pm 35\text{m}$) pour ne recevoir aucune fausse alerte.

---

### 🚗 Mode Voiture Cockpit OLED (HUD)
- **Activation automatique** dès que la vitesse dépasse 30 km/h.
- Nom de la route en direct (ex: 🛣️ *A6*, *RN104*, *D950*, *Boulevard Périphérique*).
- Compteur de vitesse géant haute définition.
- Panneaux officiels de limitation de vitesse (VL et PL).
- Carte d'approche radar avec compte à rebours et barre de progression animée.
- **Bouton 🚨 Signaler** directement accessible sur le tableau de bord.
- Mode paysage / portrait automatique.

---

### 👥 Communauté en temps réel (Supabase)
- **Mode Hybride** : Fonctionne en mode local immédiat (stockage navigateur) ou synchronisé en temps réel avec Supabase.
- **Bouton 🚨 Signaler en 1 tap** (carte et mode voiture) pour déclarer :
  - 🚓 Radar mobile
  - 👮 Contrôle routier / FDO
  - 🚙 Voiture-radar privatisée
  - 🚧 Radar chantier / travaux
  - ⚠️ Zone de danger / accident
- Votes 👍 / 👎 sur les signalements communautaires.

---

## 🚀 Installation & Déploiement

### Étape 1 — Cloner le projet
```bash
git clone https://github.com/nxm310/fou_du_volant.git
cd fou_du_volant
```

### Étape 2 — Mettre à jour la base des radars
```bash
python scripts/update_radars.py
```

### Étape 3 — Configurer Supabase (Optionnel)
1. Créez un projet gratuit sur [supabase.com](https://supabase.com).
2. Dans le **SQL Editor**, exécutez le script [`supabase-setup.sql`](file:///e:/antigravity/pc/fou%20du%20voant/supabase-setup.sql).
3. Renseignez votre URL de projet et clé `anon` dans l'application via le panneau **Réglages** $\rightarrow$ section *Communauté*.

---

## 📱 Utilisation sur Smartphone (PWA)

- **iOS (Safari)** : Bouton Partager $\rightarrow$ **Sur l'écran d'accueil**.
- **Android (Chrome)** : Menu $\rightarrow$ **Installer l'application**.

---

## 📊 Sources & Licences
- **Données officielles** : Ministère de l'Intérieur / [data.gouv.fr](https://www.data.gouv.fr/datasets/radars-automatiques) (Licence Ouverte 2.0).
- **Données communautaires** : [Lufop.net](https://lufop.net/).
- **Cartographie** : [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
