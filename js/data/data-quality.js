// Also applies to older IndexedDB snapshots when an update cannot be fetched.
export function normalizeRadarRecords(records) {
  return records.map(r => {
    if (!String(r.id).startsWith('sr_I_')) return r;
    return { ...r, category: 'leurre', type: 'Itinéraire de contrôle', icon: '🎭',
      entity_kind: 'itinerary', presence_status: 'unconfirmed', direction: '',
      equipement: 'Type d’appareil non déterminé',
      emplacement: 'Itinéraire de contrôle · présence d’un radar non confirmée',
      source_url: 'https://radars.securite-routiere.gouv.fr/' };
  });
}
export function summarizeRecords(records) {
  const stats = {};
  for (const r of records) stats[r.type] = (stats[r.type] || 0) + 1;
  return { total: records.length, chantier_count: records.filter(r => r.category === 'chantier').length,
    itinerary_count: records.filter(r => r.entity_kind === 'itinerary').length, stats };
}
