const MEDIA_MID_KEYS = ['camera_video', 'screen_video', 'screen_audio'];

function transceiverForMid(transceivers, mid) {
  if (typeof mid !== 'string' || !mid) return null;
  return transceivers.find((transceiver) => transceiver?.mid === mid) ?? null;
}

function transceiversForKind(transceivers, kind) {
  return transceivers.filter((transceiver) => transceiver?.receiver?.track?.kind === kind);
}

export function mediaMidsForTransceivers(transceivers) {
  return Object.fromEntries(MEDIA_MID_KEYS.flatMap((key) => {
    const mid = transceivers[key]?.mid;
    return typeof mid === 'string' && mid ? [[key, mid]] : [];
  }));
}

export function mediaTransceiversForOffer(transceivers, mediaMids = {}) {
  const videoTransceivers = transceiversForKind(transceivers, 'video');
  const audioTransceivers = transceiversForKind(transceivers, 'audio');
  const screenVideo = transceiverForMid(transceivers, mediaMids.screen_video)
    ?? videoTransceivers.at(-1)
    ?? null;
  const screenAudio = transceiverForMid(transceivers, mediaMids.screen_audio)
    ?? (audioTransceivers.length > 1 ? audioTransceivers.at(-1) : null);
  const cameraVideo = transceiverForMid(transceivers, mediaMids.camera_video)
    ?? videoTransceivers.find((transceiver) => transceiver !== screenVideo)
    ?? null;

  return { cameraVideo, screenVideo, screenAudio };
}

export function needsRenegotiationForTrack(transceiver) {
  const direction = transceiver?.currentDirection ?? transceiver?.direction;
  return !['sendrecv', 'sendonly'].includes(direction);
}
