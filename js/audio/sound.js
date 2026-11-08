/**
 * Fou du Volant - Audio & Voice (TTS) Engine
 * Synthèse sonore procédurale Web Audio API (zéro dépendance MP3)
 * Synthèse vocale naturelle française (Web Speech API)
 */

import { state } from '../core/state.js';

let audioCtx = null;
let lastAnnouncedRadarId = null;
let lastAnnounceTime = 0;
let lastOverspeedAnnounceTime = 0;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function formatApproachAnnouncement(radar, distance) {
  const label = radar.category === 'chantier' ? 'Travaux' : ['mobile', 'fixe', 'tourelle', 'discriminant', 'troncon', 'feu', 'urbain', 'passage'].includes(radar.category) ? 'Radar' : 'Attention';
  const distanceText = Number.isFinite(distance) && distance > 100 ? ` à ${Math.round(distance / 50) * 50} mètres` : ' à proximité';
  const limit = Number(radar.vitesse);
  const speedText = Number.isFinite(limit) && limit > 0 ? `, limite ${limit}` : '';
  return `${label}${distanceText}${speedText}.`;
}

export class SoundEngine {
  constructor() {
    this.frenchVoice = null;
    this.initVoice();

    // Réagir aux changements d'alertes
    state.on('alertsUpdated', ({ alerts, nearest }) => this.handleAlertUpdate(nearest));
    state.on('overspeedChanged', (isOver) => this.handleOverspeed(isOver));
  }

  unlock() {
    getAudioContext();
    this.initVoice();
  }

  initVoice() {
    if (!('speechSynthesis' in window)) return;

    const findVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Recherche prioritaire d'une voix française naturelle
      this.frenchVoice = voices.find((v) => v.lang.startsWith('fr') && (v.name.includes('Thomas') || v.name.includes('Amélie') || v.name.includes('Google') || v.name.includes('Premium'))) ||
                         voices.find((v) => v.lang.startsWith('fr')) ||
                         null;
    };

    findVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  /**
   * Bip doux d'approche radar (Web Audio)
   */
  playApproachChime() {
    if (!state.settings.sound || state.runtime.isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.00, now + 0.12); // A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  /**
   * Bip urgent de survitesse (Web Audio)
   */
  playOverspeedChime() {
    if (!state.settings.sound || state.runtime.isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.1);
    osc.frequency.setValueAtTime(880, now + 0.2);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  /**
   * Synthèse vocale française (TTS)
   */
  speak(text, priority = false) {
    if (!state.settings.voice || state.runtime.isMuted) return;
    if (!('speechSynthesis' in window)) return;

    if (priority) {
      window.speechSynthesis.cancel();
    } else if (window.speechSynthesis.speaking) {
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'fr-FR';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    if (this.frenchVoice) utter.voice = this.frenchVoice;

    window.speechSynthesis.speak(utter);
  }

  handleAlertUpdate(nearest) {
    if (!nearest) {
      lastAnnouncedRadarId = null;
      return;
    }

    const radar = nearest.radar;
    const dist = nearest.distance;
    const now = Date.now();

    // Émettre le bip et l'annonce vocale à la détection initiale
    if (lastAnnouncedRadarId !== radar.id && (now - lastAnnounceTime > 15000)) {
      lastAnnouncedRadarId = radar.id;
      lastAnnounceTime = now;

      this.playApproachChime();

      const text = formatApproachAnnouncement(radar, dist);

      this.speak(text);
    }
  }

  handleOverspeed(isOver) {
    if (!isOver) return;

    const now = Date.now();
    // Limite de répétition de l'avertissement survitesse : toutes les 7 secondes
    if (now - lastOverspeedAnnounceTime > 7000) {
      lastOverspeedAnnounceTime = now;
      this.playOverspeedChime();
      this.speak("Ralentissez.", true);
    }
  }
}

export const soundEngine = new SoundEngine();
