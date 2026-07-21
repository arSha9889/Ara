let audioContext = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext) audioContext = new AudioContextConstructor();
  return audioContext;
}

function scheduleDialTone(context, destination, startAt) {
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, startAt);
  masterGain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.04);
  masterGain.gain.setValueAtTime(0.055, startAt + 0.8);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.05);
  masterGain.connect(destination);

  [440, 480].forEach((frequency) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.connect(masterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + 1.08);
  });
}

export function startCallTone() {
  try {
    const context = getAudioContext();
    if (!context) return () => undefined;

    let isStopped = false;
    let timerId = null;
    const destination = context.destination;

    const play = async () => {
      if (isStopped) return;
      if (context.state === 'suspended') await context.resume();
      if (isStopped || context.state !== 'running') return;

      scheduleDialTone(context, destination, context.currentTime + 0.02);
      timerId = window.setTimeout(play, 3000);
    };

    void play();

    return () => {
      isStopped = true;
      if (timerId) window.clearTimeout(timerId);
    };
  } catch {
    return () => undefined;
  }
}
