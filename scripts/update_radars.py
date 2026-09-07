#!/usr/bin/env python3
"""
Script de synchronisation et génération de la base de données des radars français.
Télécharge les données officielles data.gouv.fr, normalise les typologies
(Tourelles, Discriminants, Autonomes/Chantiers, Feux Rouges, Passages à Niveau, Tronçons, Fixes, Leurres),
nettoie les coordonnées et vitesses, et produit un fichier compact radars.json.
"""

import json
import csv
import io
import os
import re
import sys
import urllib.request

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

DATA_GOUV_URL = "https://www.data.gouv.fr/api/1/datasets/r/8a22b5a8-4b65-41be-891a-7c0aead4ba51"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "radars.json")

def categorize_radar(row):
    raw_type = (row.get("type") or "").strip()
    raw_eq = (row.get("equipement") or "").strip().upper()
    emplacement = (row.get("emplacement") or "").strip()
    route = (row.get("route") or "").strip()
    text = f"{raw_type} {raw_eq} {emplacement} {route}".lower()

    # Détection des typologies précises
    # 1. Feux rouges et franchissement
    if "feu rouge" in text or "feu_rouge" in text:
        return "Radar feu rouge", "🚦", "feu"
    if "passage" in text and "niveau" in text:
        return "Radar passage a niveau", "🚂", "passage"

    # 2. Radar tronçon / vitesse moyenne
    if "vitesse moyenne" in text or "tronçon" in text or "troncon" in text:
        return "Radar tronçon", "⏱️", "troncon"

    # 3. Radar discriminant (VL / PL)
    if "discriminant" in text or "parifex" in text.lower():
        return "Radar discriminant", "🚛", "discriminant"

    # 4. Radar tourelle (Mesta Fusion / Morpho / Idemia tourelles)
    if "tourelle" in text or "fusion" in text:
        return "Radar tourelle", "🗼", "tourelle"

    # 5. Radar autonome / chantier
    if "autonome" in text or "chantier" in text or "semi-fixe" in text:
        return "Radar autonome / chantier", "🚧", "chantier"

    # 6. Radar urbain (mini tourelles)
    if "urbain" in text or "nomad" in text:
        return "Radar urbain", "🏙️", "urbain"

    # 7. Itinéraire sécurisé / cabine leurre
    if "itin" in text or "leurre" in text:
        return "Itinéraire sécurisé / leurre", "🎭", "leurre"

    # 8. Radar fixe standard
    if "fixe" in text or raw_type.lower() == "radar fixe":
        return "Radar fixe", "📷", "fixe"

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

def fetch_and_build():
    print("Telechargement du jeu de donnees officiel data.gouv.fr...")
    req = urllib.request.Request(
        DATA_GOUV_URL,
        headers={"User-Agent": "FouDuVolant-DataSync/2.0"}
    )
    
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("utf-8", errors="replace")

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

        # Filtrage zone France métropolitaine + DOM-TOM
        if not ((-25 < lat < -10 and 40 < lng < 60) or (41 < lat < 52 and -6 < lng < 10) or (14 < lat < 17 and -62 < lng < -60)):
            continue

        r_type, r_icon, r_category = categorize_radar(row)
        vitesse_vl = clean_speed(row.get("vitesse_vehicules_legers_kmh"))
        vitesse_pl = clean_speed(row.get("vitesse_poids_lourds_kmh"))
        
        coord_key = f"{round(lat, 5)}_{round(lng, 5)}"
        if coord_key in seen_coords:
            continue
        seen_coords[coord_key] = True

        radar_item = {
            "id": row.get("id") or str(len(radars) + 1),
            "lat": round(lat, 6),
            "lng": round(lng, 6),
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

    print(f"[OK] Total radars extraits et normalises : {len(radars)}")
    print("Repartition par typologie :")
    for t, count in sorted(stats.items(), key=lambda x: x[1], reverse=True):
        print(f"  - {t} : {count}")

    output_data = {
        "version": "2.1.0",
        "updated_at": "2026-09-07T09:50:00Z",
        "total": len(radars),
        "radars": radars
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f"[OK] Fichier genere avec succes : {OUTPUT_FILE} ({size_kb:.1f} Ko)")

if __name__ == "__main__":
    fetch_and_build()
