let audioContext = null;
let lastPlayedAt = 0;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext) audioContext = new AudioContextConstructor();
  return audioContext;
}

export async function primeNotificationSound() {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended') await context.resume();
  } catch {
    // Browsers may reject audio unlock without a direct user gesture.
  }
}

export function playNotificationSound() {
  const nowMs = Date.now();
  if (nowMs - lastPlayedAt < 900) return;
  lastPlayedAt = nowMs;

  try {
    const context = getAudioContext();
    if (!context || context.state !== 'running') return;

    const now = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.045, now + 0.018);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    masterGain.connect(context.destination);

    [880, 1174.66].forEach((frequency, index) => {
      const startAt = now + index * 0.11;
      const oscillator = context.createOscillator();
      const toneGain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, startAt + 0.22);

      toneGain.gain.setValueAtTime(0.0001, startAt);
      toneGain.gain.exponentialRampToValueAtTime(1, startAt + 0.018);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28);

      oscillator.connect(toneGain);
      toneGain.connect(masterGain);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.3);
    });
  } catch {
    // Notification sound is optional; never break notification delivery.
  }
}
