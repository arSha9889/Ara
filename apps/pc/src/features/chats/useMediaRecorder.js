import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_RECORDED_FILE_SIZE_BYTES = 29 * 1024 * 1024;

export const RECORDING_OPTIONS = {
  voice: {
    maxDurationSeconds: 10 * 60,
    mimeTypes: ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'],
    constraints: { audio: true },
    filePrefix: 'voice',
    fallbackExtension: 'webm',
  },
  video_note: {
    maxDurationSeconds: 60,
    mimeTypes: ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
    constraints: {
      audio: true,
      video: {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 720 },
      },
    },
    filePrefix: 'video-note',
    fallbackExtension: 'webm',
  },
};

export function mediaFileExtension(mimeType, fallback) {
  const normalized = typeof mimeType === 'string' ? mimeType.split(';', 1)[0].toLowerCase() : '';
  if (normalized === 'audio/mp4') return 'm4a';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/aac') return 'aac';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'video/mp4') return 'mp4';
  return fallback;
}

export function createSupportedMediaRecorder(stream, mimeTypes) {
  const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
    ? mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate))
    : null;
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

function recordedMimeType(recorder, chunks) {
  return recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || '';
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function recordingError(kind) {
  return new Error(kind === 'video_note'
    ? 'Не удалось создать видеозаметку. Попробуйте ещё раз.'
    : 'Не удалось создать голосовое сообщение. Попробуйте ещё раз.');
}

export function useMediaRecorder() {
  const [recording, setRecording] = useState({
    status: 'idle',
    kind: null,
    elapsedSeconds: 0,
    stream: null,
  });
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const chunksSizeRef = useRef(0);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const limitTimerRef = useRef(null);
  const cancellationRequestedRef = useRef(false);
  const sizeLimitReachedRef = useRef(false);
  const completionRef = useRef(null);
  const isMountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    window.clearInterval(timerRef.current);
    window.clearTimeout(limitTimerRef.current);
    timerRef.current = null;
    limitTimerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    stopStream(streamRef.current);
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    chunksSizeRef.current = 0;
    startedAtRef.current = 0;
    sizeLimitReachedRef.current = false;
    if (isMountedRef.current) {
      setRecording({ status: 'idle', kind: null, elapsedSeconds: 0, stream: null });
    }
  }, [clearTimers]);

  const finish = useCallback((result) => {
    const completion = completionRef.current;
    completionRef.current = null;
    reset();
    completion?.resolve(result);
  }, [reset]);

  const stop = useCallback((cancel = false) => {
    const recorder = recorderRef.current;
    if (!recorder) {
      cancellationRequestedRef.current = true;
      return completionRef.current?.promise || Promise.resolve({ media: null, error: null });
    }
    cancellationRequestedRef.current ||= cancel;
    const completion = completionRef.current?.promise || Promise.resolve({ media: null, error: null });
    if (recorder.state !== 'inactive') recorder.stop();
    return completion;
  }, []);

  const start = useCallback(async (kind) => {
    const options = RECORDING_OPTIONS[kind];
    if (!options) throw new Error('Неподдерживаемый тип записи.');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error(kind === 'video_note'
        ? 'Запись видеозаметок не поддерживается на этом устройстве.'
        : 'Запись голосовых сообщений не поддерживается на этом устройстве.');
    }
    if (recorderRef.current || recording.status !== 'idle') {
      throw new Error('Сначала завершите текущую запись.');
    }

    cancellationRequestedRef.current = false;
    sizeLimitReachedRef.current = false;
    setRecording({ status: 'requesting', kind, elapsedSeconds: 0, stream: null });
    completionRef.current = {};
    completionRef.current.promise = new Promise((resolve) => {
      completionRef.current.resolve = resolve;
    });
    const completion = completionRef.current.promise;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(options.constraints);
      if (cancellationRequestedRef.current || !isMountedRef.current) {
        stopStream(stream);
        finish({ media: null, error: null });
        return completion;
      }

      const recorder = createSupportedMediaRecorder(stream, options.mimeTypes);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      chunksSizeRef.current = 0;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size <= 0) return;
        chunksRef.current.push(event.data);
        chunksSizeRef.current += event.data.size;
        if (chunksSizeRef.current > MAX_RECORDED_FILE_SIZE_BYTES) {
          sizeLimitReachedRef.current = true;
          if (recorder.state === 'recording') recorder.stop();
        }
      };
      recorder.onerror = () => finish({ media: null, error: recordingError(kind) });
      recorder.onstop = () => {
        if (cancellationRequestedRef.current) {
          finish({ media: null, error: null });
          return;
        }
        if (sizeLimitReachedRef.current) {
          finish({ media: null, error: new Error('Размер записи не должен превышать 29 МБ.') });
          return;
        }
        const mimeType = recordedMimeType(recorder, chunksRef.current);
        if (!mimeType || !chunksRef.current.length) {
          finish({ media: null, error: recordingError(kind) });
          return;
        }
        const durationSeconds = Math.max(1, Math.ceil((Date.now() - startedAtRef.current) / 1000));
        const file = new File(
          [new Blob(chunksRef.current, { type: mimeType })],
          `${options.filePrefix}-${Date.now()}.${mediaFileExtension(mimeType, options.fallbackExtension)}`,
          { type: mimeType },
        );
        finish({ media: { file, kind, durationSeconds }, error: null });
      };

      recorder.start(1000);
      setRecording({ status: 'recording', kind, elapsedSeconds: 0, stream });
      timerRef.current = window.setInterval(() => {
        if (!isMountedRef.current) return;
        setRecording((current) => current.status === 'recording'
          ? { ...current, elapsedSeconds: Math.max(1, Math.ceil((Date.now() - startedAtRef.current) / 1000)) }
          : current);
      }, 500);
      limitTimerRef.current = window.setTimeout(() => {
        void stop(false);
      }, options.maxDurationSeconds * 1000);
      return completion;
    } catch (error) {
      stopStream(stream);
      if (cancellationRequestedRef.current) {
        finish({ media: null, error: null });
        return completion;
      }
      completionRef.current = null;
      reset();
      throw error instanceof Error ? error : recordingError(kind);
    }
  }, [finish, recording.status, reset, stop]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancellationRequestedRef.current = true;
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') recorder.stop();
      reset();
    };
  }, [reset]);

  return {
    recording,
    start,
    stop: () => stop(false),
    cancel: () => stop(true),
  };
}
