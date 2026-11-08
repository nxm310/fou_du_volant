#!/usr/bin/env python3
"""
Fou du Volant - Script de consolidation et synchronisation des radars français.
Sources :
1. Ministère de l'Intérieur / Sécurité Routière (radars.securite-routiere.gouv.fr/radars/all)
   - Itinéraires de contrôle avec polylignes GPS (pas des appareils localisés)
   - Tous les radars en service avec détails officiels (vitesse, voies, départements)
   - Date officielle de mise à jour extraite en temps réel
2. data.gouv.fr (Radars automatiques du Ministère de l'Intérieur)
3. Fichiers communautaires Lufop (CSV, ASC, GPX, KML) placés dans data/lufop/
"""

import os
import sys
import json
import csv
import io
import re
import glob
import urllib.request
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "radars.json")
CACHE_FILE = os.path.join(BASE_DIR, "data", "cache_sr_details.json")
LUFOP_DIR = os.path.join(BASE_DIR, "data", "lufop")

DATA_GOUV_URL = "https://www.data.gouv.fr/api/1/datasets/r/8a22b5a8-4b65-41be-891a-7c0aead4ba51"
SR_ALL_URL = "https://radars.securite-routiere.gouv.fr/radars/all"
SR_HOME_URL = "https://radars.securite-routiere.gouv.fr/"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"}

def clean_speed(val):
    if not val:
        return None
    m = re.search(r"(\d+)", str(val))
    if m:
        s = int(m.group(1))
        if 30 <= s <= 130:
            return s
    return None

def fetch_official_date():
    print("📅 Récupération de la date officielle de la base Sécurité Routière...")
    try:
        req = urllib.request.Request(SR_HOME_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=8) as r:
            html = r.read().decode("utf-8", errors="ignore")
            m = re.search(r'\"lastUpdate\"\s*:\s*\"([^\"]+)\"', html)
            if m:
                raw = m.group(1)
                dm = re.search(r'([0-9]{1,2}\s+[a-zéû]+\s+[0-9]{4})', raw, re.I)
                if dm:
                    return dm.group(1)
                return raw
    except Exception as e:
        print(f"   [!] Impossible de lire la date en ligne ({e}), fallback valeur par défaut.")
    return "11 juillet 2025"

def categorize_data_gouv(row):
    raw_type = (row.get("type") or "").strip()
    raw_eq = (row.get("equipement") or "").strip().upper()
    emplacement = (row.get("emplacement") or "").strip()
    route = (row.get("route") or "").strip()
    direction = (row.get("direction") or "").strip()
    text = f"{raw_type} {raw_eq} {emplacement} {route} {direction}".lower()

    if "feu rouge" in text or "feu_rouge" in text:
        return "Radar feu rouge", "🚦", "feu"
    if "passage" in text and "niveau" in text:
        return "Radar passage a niveau", "🚂", "passage"
    if "vitesse moyenne" in text or "tronçon" in text or "troncon" in text:
        return "Radar tronçon", "⏱️", "troncon"
    if "discriminant" in text or "parifex" in text:
        return "Radar discriminant", "🚛", "discriminant"
    if "tourelle" in text or "fusion" in text:
        return "Radar tourelle", "🗼", "tourelle"
    if "autonome" in text or "chantier" in text or "semi-fixe" in text:
        return "Radar autonome / chantier", "🚧", "chantier"
    if "urbain" in text or "nomad" in text:
        return "Radar urbain", "🏙️", "urbain"
    if "itin" in text or "leurre" in text:
        return "Itinéraire sécurisé / leurre", "🎭", "leurre"
    if "mobile" in text or "contrôle" in text:
        return "Radar mobile", "🚓", "mobile"
    return "Radar fixe", "📷", "fixe"

def load_details_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_details_cache(cache):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
    except Exception as e:
        print(f"[!] Erreur sauvegarde cache: {e}")

def fetch_single_sr_detail(radar_id):
    u = f"https://radars.securite-routiere.gouv.fr/radars/{radar_id}"
    try:
        req = urllib.request.Request(u, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            rules = data.get("rulesmesured", [])
            vl_speed = None
            pl_speed = None
            for r in rules:
                name = r.get("name", "")
                if "Vitesse VL" in name:
                    vl_speed = clean_speed(name.replace("Vitesse VL", ""))
                elif "Vitesse PL" in name:
                    pl_speed = clean_speed(name.replace("Vitesse PL", ""))

            return radar_id, {
                "id": radar_id,
                "road": (data.get("radarroad") or "").strip().replace("-", "").strip(),
                "dep": (data.get("department") or "").strip(),
                "dir": (data.get("radardirection") or "").strip().replace("-", "").strip(),
                "place": (data.get("radarplace") or "").strip().replace("-", "").strip(),
                "equip": (data.get("radarequipment") or "").strip().replace("-", "").strip(),
                "vl_speed": vl_speed,
                "pl_speed": pl_speed,
                "troncon_km": data.get("radartronconkm")
            }
    except Exception:
        return radar_id, None

def parse_lufop_files(seen_coords):
    lufop_radars = []
    if not os.path.exists(LUFOP_DIR):
        os.makedirs(LUFOP_DIR, exist_ok=True)
        return lufop_radars

    patterns = ["*.csv", "*.asc", "*.gpx", "*.txt"]
    files = []
    for p in patterns:
        files.extend(glob.glob(os.path.join(LUFOP_DIR, p)))
        files.extend(glob.glob(os.path.join(LUFOP_DIR, "**", p)))

    for fpath in set(files):
        try:
            with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            for line in content.split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                m = re.match(r'^([-\d\.]+)[,\s;]+([-\d\.]+)[,\s;]+"?([^"]*)"?$', line)
                if not m:
                    continue

                val1 = float(m.group(1))
                val2 = float(m.group(2))
                desc = m.group(3).strip()

                if 40 <= val1 <= 53:
                    lat, lng = val1, val2
                else:
                    lat, lng = val2, val1

                coord_key = f"{round(lat, 3)}_{round(lng, 3)}"
                if coord_key in seen_coords:
                    continue
                seen_coords[coord_key] = True

                desc_lower = desc.lower()
                if "rm" in desc_lower or "mobile" in desc_lower:
                    r_type, r_icon, category = "Radar mobile", "🚓", "mobile"
                elif "rc" in desc_lower or "chantier" in desc_lower or "temporaire" in desc_lower:
                    r_type, r_icon, category = "Radar autonome / chantier", "🚧", "chantier"
                elif "fr" in desc_lower or "feu" in desc_lower:
                    r_type, r_icon, category = "Radar feu rouge", "🚦", "feu"
                elif "rt" in desc_lower or "troncon" in desc_lower:
                    r_type, r_icon, category = "Radar tronçon", "⏱️", "troncon"
                elif "rd" in desc_lower or "discriminant" in desc_lower:
                    r_type, r_icon, category = "Radar discriminant", "🚛", "discriminant"
                else:
                    r_type, r_icon, category = "Radar fixe", "📷", "fixe"

                sp_m = re.search(r'\b(30|50|70|80|90|110|130)\b', desc)
                speed = int(sp_m.group(1)) if sp_m else None

                lufop_radars.append({
                    "id": f"lufop_{len(lufop_radars)+1}",
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                    "type": r_type,
                    "category": category,
                    "icon": r_icon,
                    "route": "",
                    "emplacement": desc or "Lufop communautaire",
                    "direction": "",
                    "dep": "",
                    "vitesse": speed,
                    "vitesse_pl": None,
                    "equipement": "Lufop POI"
                })
        except Exception as e:
            print(f"[!] Erreur de lecture sur {fpath}: {e}")

    return lufop_radars

def build_radar_database():
    print("=" * 65)
    print("🚀 FOU DU VOLANT — CONSOLIDATION DES BASES DE RADARS OFFICIELLES")
    print("=" * 65)

    official_date = fetch_official_date()
    print(f"📅 Date de validité officielle Sécurité Routière : {official_date}")

    # 1. Télécharger data.gouv.fr
    print("\n⏳ 1/4 Téléchargement du jeu de données data.gouv.fr...")
    radars = []
    seen_coords = {}
    stats = {}

    try:
        req = urllib.request.Request(DATA_GOUV_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            try:
                lat = float(row.get("latitude", "").strip())
                lng = float(row.get("longitude", "").strip())
            except (ValueError, TypeError):
                continue

            if not ((-25 < lat < -10 and 40 < lng < 60) or (41 < lat < 52 and -6 < lng < 10) or (14 < lat < 17 and -62 < lng < -60)):
                continue

            r_type, r_icon, r_category = categorize_data_gouv(row)
            vitesse_vl = clean_speed(row.get("vitesse_vehicules_legers_kmh"))
            vitesse_pl = clean_speed(row.get("vitesse_poids_lourds_kmh"))

            coord_key = f"{round(lat, 3)}_{round(lng, 3)}"
            if coord_key in seen_coords:
                continue
            seen_coords[coord_key] = True

            item = {
                "id": str(row.get("id") or len(radars) + 1),
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "type": r_type,
                "category": r_category,
                "icon": r_icon,
                "route": (row.get("route") or "").strip(),
                "emplacement": (row.get("emplacement") or "").strip(),
                "direction": (row.get("direction") or "").strip(),
                "dep": (row.get("departement") or "").strip(),
                "vitesse": vitesse_vl,
                "vitesse_pl": vitesse_pl if vitesse_pl and vitesse_pl != vitesse_vl else None,
                "equipement": (row.get("equipement") or "").strip()
            }
            if row.get("longueur_troncon_km"):
                try:
                    item["longueur_troncon_km"] = float(row.get("longueur_troncon_km"))
                except ValueError:
                    pass

            radars.append(item)
            stats[r_type] = stats.get(r_type, 0) + 1

        print(f"   ✓ {len(radars)} radars chargés depuis data.gouv.fr")
    except Exception as e:
        print(f"   [x] Erreur data.gouv.fr : {e}")

    # 2. Télécharger le flux complet Sécurité Routière
    print("\n⏳ 2/4 Téléchargement du flux officiel direct Sécurité Routière...")
    sr_all = []
    try:
        req = urllib.request.Request(SR_ALL_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as r:
            sr_all = json.loads(r.read().decode("utf-8"))
        print(f"   ✓ {len(sr_all)} équipements actifs reçus de la Sécurité Routière.")
    except Exception as e:
        print(f"   [x] Erreur flux Sécurité Routière : {e}")

    # Identifier les chantiers/itinéraires et nouveaux radars non présents dans data.gouv
    itins = [x for x in sr_all if x.get("type") == "itineraire"]
    missing_sr = []
    for item in sr_all:
        lat = item.get("lat")
        lng = item.get("lng")
        if lat is None or lng is None:
            continue
        coord_key = f"{round(lat, 3)}_{round(lng, 3)}"
        if coord_key not in seen_coords:
            missing_sr.append(item)

    print(f"   ✓ {len(itins)} itinéraires de contrôle détectés.")
    print(f"   ✓ {len(missing_sr)} équipements récents non répertoriés dans l'ancienne base data.gouv.")

    # 3. Charger le cache et récupérer les détails manquants en parallèle
    details_cache = load_details_cache()
    ids_to_fetch = set()
    for it in itins:
        if it["id"] not in details_cache:
            ids_to_fetch.add(it["id"])
    for m in missing_sr:
        if m["id"] not in details_cache:
            ids_to_fetch.add(m["id"])

    if ids_to_fetch:
        print(f"\n⏳ 3/4 Récupération en parallèle des fiches officielles de {len(ids_to_fetch)} radars...")
        with ThreadPoolExecutor(max_workers=25) as executor:
            fetched_results = list(executor.map(fetch_single_sr_detail, ids_to_fetch))
            for rid, det in fetched_results:
                if det:
                    details_cache[rid] = det
        save_details_cache(details_cache)
        print("   ✓ Cache des fiches officielles actualisé.")
    else:
        print("\n⏳ 3/4 Fiches détaillées déjà disponibles en cache local.")

    # Intégrer les itinéraires sans inventer d’appareil ni de sens de contrôle
    itinerary_count = 0
    for it in itins:
        iid = it["id"]
        det = details_cache.get(iid, {})
        lat = it.get("lat")
        lng = it.get("lng")
        if lat is None or lng is None:
            continue

        coord_key = f"{round(lat, 3)}_{round(lng, 3)}"
        seen_coords[coord_key] = True

        dep = det.get("dep", "")
        road = det.get("road", "")
        troncon = det.get("troncon_km")
        emplacement = f"Itinéraire de contrôle ({dep})" if dep else "Itinéraire de contrôle"

        geo_points = []
        raw_geojson = it.get("geoJson", [])
        if raw_geojson and isinstance(raw_geojson, list):
            step = 1 if len(raw_geojson) <= 100 else len(raw_geojson) // 80
            for pt in raw_geojson[::step]:
                if len(pt) >= 2:
                    geo_points.append([round(float(pt[0]), 5), round(float(pt[1]), 5)])

        chantier_item = {
            "id": f"sr_{iid}",
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "type": "Itinéraire de contrôle",
            "category": "leurre",
            "icon": "🎭",
            "entity_kind": "itinerary",
            "presence_status": "unconfirmed",
            "source_url": SR_HOME_URL,
            "route": road,
            "emplacement": emplacement,
            "direction": "",
            "dep": dep,
            "vitesse": None,
            "vitesse_pl": None,
            "equipement": "Type d’appareil non déterminé",
            "geo_points": geo_points
        }
        if troncon:
            try:
                chantier_item["longueur_troncon_km"] = float(str(troncon).replace(",", "."))
            except ValueError:
                pass

        radars.append(chantier_item)
        stats["Itinéraire de contrôle"] = stats.get("Itinéraire de contrôle", 0) + 1
        itinerary_count += 1

    # Intégrer les autres radars manquants (nouveaux fixes, urbains, tourelles, discriminants)
    new_radars_count = 0
    for item in missing_sr:
        iid = item.get("id")
        if not iid or item.get("type") == "itineraire":
            continue
        lat = item.get("lat")
        lng = item.get("lng")
        if lat is None or lng is None:
            continue

        coord_key = f"{round(lat, 3)}_{round(lng, 3)}"
        if coord_key in seen_coords:
            continue
        seen_coords[coord_key] = True

        det = details_cache.get(iid, {})
        sr_type = item.get("type", "")
        type_label = item.get("typeLabel", "")

        if sr_type == "urbain" or "urbain" in type_label.lower():
            r_type, r_icon, r_cat = "Radar urbain", "🏙️", "urbain"
        elif sr_type == "feux" or "feu" in type_label.lower():
            r_type, r_icon, r_cat = "Radar feu rouge", "🚦", "feu"
        elif sr_type == "niveaux" or "passage" in type_label.lower():
            r_type, r_icon, r_cat = "Radar passage a niveau", "🚂", "passage"
        elif sr_type == "troncons" or "vitesse moyenne" in type_label.lower():
            r_type, r_icon, r_cat = "Radar tronçon", "⏱️", "troncon"
        elif sr_type == "discriminants" or "discriminant" in type_label.lower():
            r_type, r_icon, r_cat = "Radar discriminant", "🚛", "discriminant"
        else:
            equip_str = det.get("equip", "").upper()
            if "FUSION" in equip_str or "TOURELLE" in equip_str:
                r_type, r_icon, r_cat = "Radar tourelle", "🗼", "tourelle"
            else:
                r_type, r_icon, r_cat = "Radar fixe", "📷", "fixe"

        new_item = {
            "id": f"sr_{iid}",
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "type": r_type,
            "category": r_cat,
            "icon": r_icon,
            "route": det.get("road", ""),
            "emplacement": det.get("place", "") or f"Radar ({det.get('dep', '')})",
            "direction": det.get("dir", ""),
            "dep": det.get("dep", ""),
            "vitesse": det.get("vl_speed"),
            "vitesse_pl": det.get("pl_speed"),
            "equipement": det.get("equip", "Sécurité Routière")
        }
        radars.append(new_item)
        stats[r_type] = stats.get(r_type, 0) + 1
        new_radars_count += 1

    # 4. Fusion avec les fichiers Lufop locaux
    lufop_items = parse_lufop_files(seen_coords)
    if lufop_items:
        print(f"\n📂 Intégration de {len(lufop_items)} POI Lufop communautaires...")
        for item in lufop_items:
            radars.append(item)
            stats[item["type"]] = stats.get(item["type"], 0) + 1

    # Tri par priorité : chantiers, mobiles et zones critiques en tête de liste
    priority = {
        'chantier': 1,
        'mobile': 2,
        'troncon': 3,
        'feu': 4,
        'tourelle': 5,
        'discriminant': 6,
        'passage': 7,
        'urbain': 8,
        'leurre': 9,
        'fixe': 10
    }
    radars.sort(key=lambda r: priority.get(r.get('category'), 99))

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    output_data = {
        "version": "4.1.0",
        "updated_at": now_iso,
        "official_date": official_date,
        "official_source": "Ministère de l'Intérieur / Sécurité Routière (radars.securite-routiere.gouv.fr & data.gouv.fr)",
        "total": len(radars),
        "chantier_count": sum(r.get("category") == "chantier" for r in radars),
        "itinerary_count": itinerary_count,
        "new_deployments_count": new_radars_count,
        "stats": stats,
        "radars": radars
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024

    print("\n" + "=" * 65)
    print(f"✅ CONSOLIDATION TERMINÉE AVEC SUCCÈS")
    print(f"📦 Total radars consolidés : {len(radars)}")
    print(f"📅 Date officielle Sécurité Routière : {official_date}")
    print(f"🔄 Date de génération : {now_iso}")
    print(f"🚧 Points de chantier localisés : {sum(r.get('category') == 'chantier' for r in radars)}")
    print(f"🆕 Nouveaux radars récents intégrés : {new_radars_count}")
    print("\n📊 Répartition détaillée par catégorie :")
    for t, count in sorted(stats.items(), key=lambda x: x[1], reverse=True):
        print(f"   • {t:<30} : {count:>5}")
    print(f"\n💾 Fichier généré : {OUTPUT_FILE} ({size_kb:.1f} Ko)")
    print("=" * 65 + "\n")
    return True

if __name__ == "__main__":
    build_radar_database()
