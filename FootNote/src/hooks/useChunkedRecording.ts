import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { transcribeAudioUri } from '@/lib/transcribeAudio';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { SUPABASE_FUNCTIONS_URL } from '@/lib/constants';

const DEV_MOCK_TRANSCRIPT =
  "This is a dev mode recording. The transcription API is not available without a real session. " +
  "Use the Try Demo button to test GPT structuring, or sign in with a real account to test the full pipeline.";

export interface ChunkedRecordingState {
  isRecording: boolean;
  totalDurationMs: number;
  /**
   * Live transcript built up as chunks are transcribed in the background
   * during recording. Callers react to updates to show live preview and
   * trigger progressive GPT structuring.
   */
  accumulatedTranscript: string;
  /** Chunks queued for retry (failed due to network). */
  pendingChunks: number;
  /** True while a chunk is actively being sent to Whisper for transcription. */
  isTranscribingChunk: boolean;
  audioLevel: number;
  error: string | null;
  startRecording: () => Promise<void>;
  /**
   * Stops recording, waits for any in-progress background transcriptions to
   * finish, transcribes the final segment, and returns the full transcript
   * along with any URIs that failed to transcribe (for offline retry).
   */
  stopRecording: () => Promise<{ transcript: string; failedUris: string[] }>;
  /** Inject text directly (used by the demo). */
  injectTranscript: (text: string) => void;
  reset: () => void;
}

const CHUNK_INTERVAL_MS = 60_000;
/** When accumulated transcript exceeds this, condense it via LLM summarization. */
const SUMMARIZE_THRESHOLD_WORDS = 1500;

/**
 * These options are passed to EVERY prepareToRecordAsync() call.
 * This is required — if called without options, expo-audio reuses the existing
 * AVAudioRecorder instance (same file URL) and prepareToRecord() truncates the
 * previously-recorded chunk file before it can be uploaded to Whisper.
 * Passing options forces a new AVAudioRecorder with a fresh UUID filename each time.
 */
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export function useChunkedRecording(): ChunkedRecordingState {
  const { isDevMode } = useAuth();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [pendingChunks, setPendingChunks] = useState(0);
  const [isTranscribingChunk, setIsTranscribingChunk] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accumulatedRef = useRef('');
  const activeRef = useRef(false);
  const failedChunkUrisRef = useRef<string[]>([]); // retry queue for offline chunks
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalStartRef = useRef(0);
  // All in-progress background transcriptions. stopRecording awaits all of them
  // before reading accumulatedRef, so no chunk is ever lost.
  const inFlightRef = useRef<Set<Promise<void>>>(new Set());

  const transcribe = useCallback((uri: string): Promise<string> => {
    if (isDevMode) return Promise.resolve(DEV_MOCK_TRANSCRIPT);
    return transcribeAudioUri(uri);
  }, [isDevMode]);

  /**
   * When the accumulated transcript grows past SUMMARIZE_THRESHOLD_WORDS, call
   * the gpt-structure edge function with action='summarize' to condense it.
   * This keeps the context sent to GPT manageable for long recordings.
   * Falls back silently to the original text on any error.
   */
  const summarizeIfNeeded = useCallback(async (text: string): Promise<string> => {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount <= SUMMARIZE_THRESHOLD_WORDS) return text;
    if (isDevMode) return text; // Skip in dev mode

    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
      if (!session) return text;

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/gpt-structure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ transcript: text, action: 'summarize' }),
      });

      if (!res.ok) return text; // Fallback on API error
      const data = await res.json();
      return data.summary?.trim() || text;
    } catch {
      return text; // Fallback on network error
    }
  }, [isDevMode]);

  /**
   * Drain the retry queue then transcribe newUri.
   * Chunks are processed strictly in order — if one fails, it and all
   * subsequent URIs go back into the queue for sequential retry next time.
   * After a successful append, summarizes if the context has grown too large.
   * Always writes to accumulatedRef so stopRecording() sees the result
   * even when called mid-transcription.
   */
  const transcribeChunk = useCallback(async (newUri: string): Promise<void> => {
    const toProcess = [...failedChunkUrisRef.current, newUri];
    failedChunkUrisRef.current = [];
    setPendingChunks(0);
    setIsTranscribingChunk(true);

    let accumulated = accumulatedRef.current;
    let anyUpdate = false;

    for (let i = 0; i < toProcess.length; i++) {
      try {
        const text = await transcribe(toProcess[i]);
        if (text) {
          accumulated = accumulated ? `${accumulated} ${text}` : text;
          anyUpdate = true;
        }
      } catch (err: any) {
        // Network down (or server error) — queue this URI and everything after
        // it in order. Sequential retry means chunk i must succeed before i+1.
        console.error('[useChunkedRecording] chunk transcription failed:', err?.message ?? err);
        const stillFailed = toProcess.slice(i);
        failedChunkUrisRef.current = stillFailed;
        setPendingChunks(stillFailed.length);
        // Show the actual reason so it's easier to diagnose during development.
        // For auth/server errors this reveals the real cause; for network errors
        // it shows "Network request failed" or similar.
        setError(`Segment failed: ${err?.message ?? 'unknown error'} — ${stillFailed.length} chunk(s) saved for retry.`);
        break;
      }
    }

    if (anyUpdate) {
      // Condense if the transcript is getting long (fire-and-forget with fallback)
      accumulated = await summarizeIfNeeded(accumulated);

      // Always persist to ref — stopRecording reads this even after activeRef = false
      accumulatedRef.current = accumulated;
      // Only push to React state during active recording (live transcript preview)
      if (activeRef.current) setAccumulatedTranscript(accumulated);
    }

    setIsTranscribingChunk(false);
  }, [transcribe, summarizeIfNeeded]);

  /**
   * Stops the current 60-second segment, restarts recording for the next
   * segment, and fires off transcription in the background. The transcription
   * promise is tracked in inFlightRef so stopRecording() can await it.
   */
  const processChunk = useCallback(async () => {
    if (!activeRef.current) return;

    await recorder.stop();
    const uri = recorder.uri ?? null;

    // Restart recording immediately before transcribing (brief ~300ms gap only)
    if (activeRef.current) {
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record();
      chunkTimerRef.current = setTimeout(processChunk, CHUNK_INTERVAL_MS);
    }

    // Give the audio session a moment to settle before opening a network
    // connection. On iOS the audio session state transition (stop → record)
    // can briefly interfere with outbound requests in the simulator.
    await new Promise((r) => setTimeout(r, 250));

    if (uri) {
      const p = transcribeChunk(uri);
      inFlightRef.current.add(p);
      p.finally(() => inFlightRef.current.delete(p));
      await p;
    }
  }, [recorder, transcribeChunk]);

  const startRecording = useCallback(async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) throw new Error('Microphone permission not granted');

    activeRef.current = true;
    accumulatedRef.current = '';
    failedChunkUrisRef.current = [];
    inFlightRef.current.clear();
    setAccumulatedTranscript('');
    setPendingChunks(0);
    setError(null);
    setTotalDurationMs(0);

    await AudioModule.setAudioModeAsync({
      allowsRecording: true,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
    recorder.record();

    totalStartRef.current = Date.now();
    totalTimerRef.current = setInterval(() => {
      setTotalDurationMs(Date.now() - totalStartRef.current);
    }, 200);
    meteringTimerRef.current = setInterval(() => {
      if (!activeRef.current) return;
      const status = recorder.getStatus();
      const power: number = (status as any).metering ?? -60;
      setAudioLevel(Math.max(0, Math.min(1, (power + 60) / 60)));
    }, 100);
    chunkTimerRef.current = setTimeout(processChunk, CHUNK_INTERVAL_MS);
    setIsRecording(true);
  }, [recorder, processChunk]);

  const stopRecording = useCallback(async (): Promise<{ transcript: string; failedUris: string[] }> => {
    activeRef.current = false;
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    if (meteringTimerRef.current) clearInterval(meteringTimerRef.current);

    // Wait for ALL in-progress background chunk transcriptions to finish.
    // They write to accumulatedRef even after activeRef = false, so we get
    // the full transcript when we read it below.
    if (inFlightRef.current.size > 0) {
      await Promise.allSettled([...inFlightRef.current]);
      inFlightRef.current.clear();
    }

    await recorder.stop();
    const uri = recorder.uri ?? null;
    setIsRecording(false);
    setPendingChunks(0);
    setAudioLevel(0);

    // Build the list to process: any retry-queued failed chunks + final segment
    const toProcess = uri
      ? [...failedChunkUrisRef.current, uri]
      : [...failedChunkUrisRef.current];
    failedChunkUrisRef.current = [];

    if (toProcess.length === 0 && accumulatedRef.current === '') {
      const msg = 'Recording URI unavailable — no audio file was produced.';
      setError(msg);
      throw new Error(msg);
    }

    let accumulated = accumulatedRef.current; // includes all successfully transcribed chunks
    const failedUris: string[] = [];

    // Process sequentially: if chunk i fails, queue it and all subsequent URIs
    // for retry later — chunk i must succeed before chunk i+1 is attempted.
    for (let i = 0; i < toProcess.length; i++) {
      try {
        const text = await transcribe(toProcess[i]);
        if (text) {
          accumulated = accumulated ? `${accumulated} ${text}` : text;
        }
      } catch (err: any) {
        console.error('[useChunkedRecording] stopRecording retry failed:', err?.message ?? err);
        failedUris.push(...toProcess.slice(i));
        break;
      }
    }

    if (failedUris.length > 0) {
      setError(
        `${failedUris.length} segment(s) couldn't be uploaded — your note has been saved. ` +
        'Open the note to finish transcribing when you\'re back online.'
      );
    }

    accumulatedRef.current = accumulated;
    setAccumulatedTranscript(accumulated);
    return { transcript: accumulated, failedUris };
  }, [recorder, transcribe]);

  const injectTranscript = useCallback((text: string) => {
    accumulatedRef.current = text;
    setAccumulatedTranscript(text);
  }, []);

  const reset = useCallback(() => {
    accumulatedRef.current = '';
    failedChunkUrisRef.current = [];
    inFlightRef.current.clear();
    setAccumulatedTranscript('');
    setPendingChunks(0);
    setIsTranscribingChunk(false);
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
    isTranscribingChunk,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    injectTranscript,
    reset,
  };
}
