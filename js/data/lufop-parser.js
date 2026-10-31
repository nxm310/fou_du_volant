/**
 * Fou du Volant - Lufop File Parser (In-Memory, Zero-Server)
 * Supporte ASC, CSV, GPX, KML
 */

export async function parseLufopFile(file) {
  const text = await file.text();
  const name = file.name.toLowerCase();

  if (name.endsWith('.gpx')) {
    return parseGPX(text);
  }
  if (name.endsWith('.kml')) {
    return parseKML(text);
  }
  // Par défaut : format tabulaire texte (ASC ou CSV)
  return parseASCorCSV(text);
}

function parseASCorCSV(text) {
  const lines = text.split('\n');
  const radars = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Format attendu : lon, lat, "Description" ou lat, lon, "Description"
    const m = line.match(/^([-\d\.]+)[,\s;]+([-\d\.]+)[,\s;]+"?([^"]*)"?$/);
    if (!m) continue;

    let v1 = parseFloat(m[1]);
    let v2 = parseFloat(m[2]);
    let desc = m[3] ? m[3].trim() : '';

    let lat, lng;
    if (v1 >= 40 && v1 <= 53) {
      lat = v1;
      lng = v2;
    } else {
      lat = v2;
      lng = v1;
    }

    if (isNaN(lat) || isNaN(lng)) continue;

    const { type, cat, icon } = detectCategoryFromDesc(desc);
    const speedMatch = desc.match(/\b(30|50|70|80|90|110|130)\b/);
    const speed = speedMatch ? parseInt(speedMatch[1], 10) : null;

    radars.push({
      id: `lufop_imp_${Date.now()}_${radars.length}`,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      type: type,
      category: cat,
      icon: icon,
      route: '',
      emplacement: desc || 'Radar Lufop',
      direction: '',
      vitesse: speed,
      vitesse_pl: null
    });
  }

  return radars;
}

function parseGPX(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const wpts = xml.querySelectorAll('wpt');
  const radars = [];

  wpts.forEach((wpt, idx) => {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lng = parseFloat(wpt.getAttribute('lon'));
    const nameEl = wpt.querySelector('name');
    const descEl = wpt.querySelector('desc');
    const desc = (nameEl ? nameEl.textContent : '') + ' ' + (descEl ? descEl.textContent : '');

    const { type, cat, icon } = detectCategoryFromDesc(desc);
    const speedMatch = desc.match(/\b(30|50|70|80|90|110|130)\b/);
    const speed = speedMatch ? parseInt(speedMatch[1], 10) : null;

    radars.push({
      id: `lufop_gpx_${Date.now()}_${idx}`,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      type: type,
      category: cat,
      icon: icon,
      route: '',
      emplacement: desc.trim() || 'POI GPX',
      direction: '',
      vitesse: speed,
      vitesse_pl: null
    });
  });

  return radars;
}

function parseKML(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'application/xml');
  const placemarks = xml.querySelectorAll('Placemark');
  const radars = [];

  placemarks.forEach((pm, idx) => {
    const coordEl = pm.querySelector('coordinates');
    if (!coordEl) return;

    const parts = coordEl.textContent.trim().split(',');
    if (parts.length < 2) return;

    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    const nameEl = pm.querySelector('name');
    const desc = nameEl ? nameEl.textContent : '';

    const { type, cat, icon } = detectCategoryFromDesc(desc);
    const speedMatch = desc.match(/\b(30|50|70|80|90|110|130)\b/);
    const speed = speedMatch ? parseInt(speedMatch[1], 10) : null;

    radars.push({
      id: `lufop_kml_${Date.now()}_${idx}`,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      type: type,
      category: cat,
      icon: icon,
      route: '',
      emplacement: desc.trim() || 'POI KML',
      direction: '',
      vitesse: speed,
      vitesse_pl: null
    });
  });

  return radars;
}

function detectCategoryFromDesc(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('rm') || d.includes('mobile')) return { type: 'Radar mobile', cat: 'mobile', icon: '🚓' };
  if (d.includes('rc') || d.includes('chantier') || d.includes('temporaire')) return { type: 'Radar chantier', cat: 'chantier', icon: '🚧' };
  if (d.includes('fr') || d.includes('feu')) return { type: 'Radar feu rouge', cat: 'feu', icon: '🚦' };
  if (d.includes('rt') || d.includes('troncon')) return { type: 'Radar tronçon', cat: 'troncon', icon: '⏱️' };
  if (d.includes('rd') || d.includes('discriminant')) return { type: 'Radar discriminant', cat: 'discriminant', icon: '🚛' };
  return { type: 'Radar fixe', cat: 'fixe', icon: '📷' };
}
