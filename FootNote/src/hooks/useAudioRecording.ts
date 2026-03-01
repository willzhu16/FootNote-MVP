import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';

export interface AudioRecordingState {
  isRecording: boolean;
  durationMs: number;
  uri: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
}

export function useAudioRecording(): AudioRecordingState {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [durationMs, setDurationMs] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      throw new Error('Microphone permission not granted');
    }
    setDurationMs(0);
    setUri(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current);
    }, 200);
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    await recorder.stop();
    const recordingUri = recorder.uri ?? null;
    setUri(recordingUri);
    return recordingUri;
  }, [recorder]);

  return {
    isRecording: recorder.isRecording,
    durationMs,
    uri,
    startRecording,
    stopRecording,
  };
}
