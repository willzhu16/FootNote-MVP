import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { transcribeAudioUri } from '@/lib/transcribeAudio';
import { useAuth } from '@/context/AuthContext';

const DEV_MOCK_TRANSCRIPT =
  "This is a dev mode recording. The transcription API is not available without a real session. " +
  "Use the Try Demo button to test GPT structuring, or sign in with a real account to test the full pipeline.";

export interface ChunkedRecordingState {
  isRecording: boolean;
  totalDurationMs: number;
  accumulatedTranscript: string;
  pendingChunks: number; // buffered chunks waiting for connectivity
  audioLevel: number; // 0-1 normalized audio level (from metering)
  error: string | null;
  startRecording: () => Promise<void>;
  /** Stops recording, drains retry queue, returns accumulated transcript. */
  stopRecording: () => Promise<string>;
  /**
   * Returns chunk URIs that still couldn't be transcribed after stopRecording.
   * Valid for the current app session only (temp files).
   */
  getUnprocessedUris: () => string[];
  /** Inject text directly (used by the demo). */
  injectTranscript: (text: string) => void;
  reset: () => void;
}

const CHUNK_INTERVAL_MS = 60_000;

export function useChunkedRecording(): ChunkedRecordingState {
  const { isDevMode } = useAuth();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [isRecording, setIsRecording] = useState(false);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [pendingChunks, setPendingChunks] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accumulatedRef = useRef('');
  const activeRef = useRef(false);
  const failedChunkUrisRef = useRef<string[]>([]); // retry queue
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalStartRef = useRef(0);

  const transcribe = useCallback((uri: string): Promise<string> => {
    if (isDevMode) return Promise.resolve(DEV_MOCK_TRANSCRIPT);
    return transcribeAudioUri(uri);
  }, [isDevMode]);

  // Drain the retry queue then transcribe the new URI.
  // On first failure, the remaining URIs go back into the queue.
  const transcribeWithRetry = useCallback(async (newUri: string): Promise<void> => {
    const toProcess = [...failedChunkUrisRef.current, newUri];
    failedChunkUrisRef.current = [];
    setPendingChunks(0);

    let accumulated = accumulatedRef.current;
    let anyUpdate = false;

    for (let i = 0; i < toProcess.length; i++) {
      try {
        const text = await transcribe(toProcess[i]);
        if (text) {
          accumulated = accumulated ? `${accumulated} ${text}` : text;
          anyUpdate = true;
        }
      } catch {
        // Network still down — put this and all remaining back in the queue
        const stillFailed = toProcess.slice(i);
        failedChunkUrisRef.current = stillFailed;
        setPendingChunks(stillFailed.length);
        break;
      }
    }

    if (anyUpdate && activeRef.current) {
      accumulatedRef.current = accumulated;
      setAccumulatedTranscript(accumulated);
    }
  }, [transcribe]);

  const processChunk = useCallback(async () => {
    if (!activeRef.current) return;

    // Stop current segment
    await recorder.stop();
    const uri = recorder.uri ?? null;

    // Immediately restart recording before transcribing (brief ~300ms gap)
    if (activeRef.current) {
      await recorder.prepareToRecordAsync();
      recorder.record();
      chunkTimerRef.current = setTimeout(processChunk, CHUNK_INTERVAL_MS);
    }

    // Retry failed chunks + transcribe this one in background
    if (uri) {
      await transcribeWithRetry(uri);
    }
  }, [recorder, transcribeWithRetry]);

  const startRecording = useCallback(async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) throw new Error('Microphone permission not granted');

    activeRef.current = true;
    accumulatedRef.current = '';
    failedChunkUrisRef.current = [];
    setAccumulatedTranscript('');
    setPendingChunks(0);
    setError(null);
    setTotalDurationMs(0);

    await AudioModule.setAudioModeAsync({
      allowsRecording: true,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();

    totalStartRef.current = Date.now();
    totalTimerRef.current = setInterval(() => {
      setTotalDurationMs(Date.now() - totalStartRef.current);
    }, 200);
    meteringTimerRef.current = setInterval(async () => {
      if (!activeRef.current) return;
      const status = await recorder.getStatus();
      const power: number = (status as any).metering ?? -60;
      setAudioLevel(Math.max(0, Math.min(1, (power + 60) / 60)));
    }, 100);
    chunkTimerRef.current = setTimeout(processChunk, CHUNK_INTERVAL_MS);
    setIsRecording(true);
  }, [recorder, processChunk]);

  const stopRecording = useCallback(async (): Promise<string> => {
    activeRef.current = false;
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    if (meteringTimerRef.current) clearInterval(meteringTimerRef.current);

    await recorder.stop();
    const uri = recorder.uri ?? null;
    setIsRecording(false);
    setPendingChunks(0);
    setAudioLevel(0);

    // Drain retry queue + final chunk, best-effort
    const toProcess = uri
      ? [...failedChunkUrisRef.current, uri]
      : [...failedChunkUrisRef.current];
    failedChunkUrisRef.current = [];

    let accumulated = accumulatedRef.current;
    const stillFailed: string[] = [];
    let allFailed = toProcess.length > 0;

    for (const chunkUri of toProcess) {
      try {
        const text = await transcribe(chunkUri);
        if (text) {
          accumulated = accumulated ? `${accumulated} ${text}` : text;
          allFailed = false;
        }
      } catch {
        // Keep for caller to retrieve via getUnprocessedUris()
        stillFailed.push(chunkUri);
      }
    }

    // Surface a visible error if every chunk failed (not an offline/retry scenario)
    if (allFailed && stillFailed.length > 0) {
      setError('Transcription failed — check your connection or Supabase function.');
    }

    // Store remaining failures so caller can persist them
    failedChunkUrisRef.current = stillFailed;

    accumulatedRef.current = accumulated;
    setAccumulatedTranscript(accumulated);
    return accumulated;
  }, [recorder, transcribe]);

  const getUnprocessedUris = useCallback((): string[] => {
    return [...failedChunkUrisRef.current];
  }, []);

  const injectTranscript = useCallback((text: string) => {
    accumulatedRef.current = text;
    setAccumulatedTranscript(text);
  }, []);

  const reset = useCallback(() => {
    accumulatedRef.current = '';
    failedChunkUrisRef.current = [];
    setAccumulatedTranscript('');
    setPendingChunks(0);
    setAudioLevel(0);
    setError(null);
    setTotalDurationMs(0);
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
      if (meteringTimerRef.current) clearInterval(meteringTimerRef.current);
    };
  }, []);

  return {
    isRecording,
    totalDurationMs,
    accumulatedTranscript,
    pendingChunks,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    getUnprocessedUris,
    injectTranscript,
    reset,
  };
}
