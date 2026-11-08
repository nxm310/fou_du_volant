/**
 * Fou du Volant - Screen WakeLock Engine
 * Empêche l'extinction de l'écran du smartphone en conduite
 */

let wakeLock = null;
let wanted = false;
let pending = false;

export async function requestWakeLock() {
  wanted = true;
  if (wakeLock || pending || document.visibilityState !== 'visible') return false;
  if ('wakeLock' in navigator) {
    pending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!wanted) { await lock.release(); return false; }
      wakeLock = lock;
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      return true;
    } catch (err) {
      console.warn('Wake Lock request error:', err.message);
    } finally { pending = false; }
  }
  return false;
}

export function releaseWakeLock() {
  wanted = false;
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// Réacquisition automatique lors du retour en premier plan
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});
