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

function scheduleNote(context, destination, { frequency, startAt, duration, volume = 0.06 }) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const endAt = startAt + duration;
  const releaseStartAt = endAt - 0.06;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.setValueAtTime(volume, releaseStartAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(endAt);
}

function scheduleIncomingCallTone(context, destination, startAt) {
  scheduleNote(context, destination, {
    frequency: 880,
    startAt,
    duration: 0.18,
    volume: 0.05,
  });
  scheduleNote(context, destination, {
    frequency: 1174.66,
    startAt: startAt + 0.28,
    duration: 0.22,
    volume: 0.05,
  });
}

function playOneShot(schedule) {
  try {
    const context = getAudioContext();
    if (!context) return;

    const play = async () => {
      if (context.state === 'suspended') await context.resume();
      if (context.state !== 'running') return;
      schedule(context, context.destination, context.currentTime + 0.02);
    };

    void play().catch(() => undefined);
  } catch {
    // Sound feedback is optional and must never interrupt call controls.
  }
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

export function startIncomingCallTone() {
  try {
    const context = getAudioContext();
    if (!context) return () => undefined;

    let isStopped = false;
    let timerId = null;

    const play = async () => {
      if (isStopped) return;
      if (context.state === 'suspended') await context.resume();
      if (isStopped || context.state !== 'running') return;

      scheduleIncomingCallTone(context, context.destination, context.currentTime + 0.02);
      timerId = window.setTimeout(play, 3000);
    };

    void play().catch(() => undefined);

    return () => {
      isStopped = true;
      if (timerId) window.clearTimeout(timerId);
    };
  } catch {
    return () => undefined;
  }
}

export function playCallAcceptedTone() {
  playOneShot((context, destination, startAt) => {
    scheduleNote(context, destination, {
      frequency: 659.25,
      startAt,
      duration: 0.11,
      volume: 0.06,
    });
    scheduleNote(context, destination, {
      frequency: 880,
      startAt: startAt + 0.12,
      duration: 0.14,
      volume: 0.065,
    });
  });
}

export function playCallEndedTone() {
  playOneShot((context, destination, startAt) => {
    scheduleNote(context, destination, {
      frequency: 523.25,
      startAt,
      duration: 0.13,
      volume: 0.055,
    });
    scheduleNote(context, destination, {
      frequency: 392,
      startAt: startAt + 0.14,
      duration: 0.17,
      volume: 0.055,
    });
  });
}
