#!/usr/bin/env python3
"""
Fou du Volant - Script de synchronisation et d'optimisation des radars français.
Télécharge les données officielles du Ministère de l'Intérieur depuis data.gouv.fr,
les nettoie, les déduplique et fusionne les éventuels fichiers Lufop (CSV, ASC, GPX, KML).
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

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

DATA_GOUV_URL = "https://www.data.gouv.fr/api/1/datasets/r/8a22b5a8-4b65-41be-891a-7c0aead4ba51"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "radars.json")
LUFOP_DIR = os.path.join(BASE_DIR, "data", "lufop")

def categorize_radar(row):
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

def clean_speed(val):
    if not val:
        return None
    m = re.search(r"(\d+)", str(val))
    if m:
        s = int(m.group(1))
        if 30 <= s <= 130:
            return s
    return None

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

                coord_key = f"{round(lat, 4)}_{round(lng, 4)}"
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

def fetch_and_build():
    print("⏳ Téléchargement du jeu de données officiel data.gouv.fr...")
    req = urllib.request.Request(
        DATA_GOUV_URL,
        headers={"User-Agent": "FouDuVolant-Builder/3.0"}
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[x] Erreur lors du téléchargement : {e}")
        return False

    reader = csv.DictReader(io.StringIO(content))
    radars = []
    seen_coords = {}
    stats = {}

    for row in reader:
        try:
            lat = float(row.get("latitude", "").strip())
            lng = float(row.get("longitude", "").strip())
        except (ValueError, TypeError):
            continue

        # Filtre géographique France métropolitaine et DROM
        if not ((-25 < lat < -10 and 40 < lng < 60) or (41 < lat < 52 and -6 < lng < 10) or (14 < lat < 17 and -62 < lng < -60)):
            continue

        r_type, r_icon, r_category = categorize_radar(row)
        vitesse_vl = clean_speed(row.get("vitesse_vehicules_legers_kmh"))
        vitesse_pl = clean_speed(row.get("vitesse_poids_lourds_kmh"))

        coord_key = f"{round(lat, 4)}_{round(lng, 4)}"
        if coord_key in seen_coords:
            continue
        seen_coords[coord_key] = True

        radar_item = {
            "id": row.get("id") or str(len(radars) + 1),
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
                radar_item["longueur_troncon_km"] = float(row.get("longueur_troncon_km"))
            except ValueError:
                pass

        radars.append(radar_item)
        stats[r_type] = stats.get(r_type, 0) + 1

    # Fusion avec les fichiers Lufop locaux
    lufop_items = parse_lufop_files(seen_coords)
    for item in lufop_items:
        radars.append(item)
        stats[item["type"]] = stats.get(item["type"], 0) + 1

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    output_data = {
        "version": "3.0.0",
        "updated_at": now_iso,
        "total": len(radars),
        "radars": radars
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f"\n✅ Total radars consolidés : {len(radars)}")
    print("📊 Répartition par typologie :")
    for t, count in sorted(stats.items(), key=lambda x: x[1], reverse=True):
        print(f"   • {t} : {count}")
    print(f"📦 Fichier généré avec succès : {OUTPUT_FILE} ({size_kb:.1f} Ko)\n")
    return True

if __name__ == "__main__":
    fetch_and_build()
