import { useCallback, useRef, useState } from 'react';
import { SUPABASE_FUNCTIONS_URL } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

export interface WhisperStreamState {
  transcript: string;
  isTranscribing: boolean;
  error: string | null;
  connect: () => Promise<void>;
  sendAudioChunk: (base64Pcm16: string) => void;
  commit: () => void;
  disconnect: () => void;
  resetTranscript: () => void;
  injectTranscript: (text: string) => void;
  transcribeBatch: (uri: string) => Promise<string>;
}

export function useWhisperStream(): WhisperStreamState {
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const wsUrl = SUPABASE_FUNCTIONS_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    // Pass JWT as query param since RN WebSocket doesn't support custom headers
    const url = `${wsUrl}/whisper-stream?access_token=${encodeURIComponent(session.access_token)}`;

    const ws = new WebSocket(url);

    wsRef.current = ws;

    ws.onopen = () => {
      setIsTranscribing(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (
          msg.type === 'conversation.item.input_audio_transcription.delta' ||
          msg.type === 'response.audio_transcript.delta'
        ) {
          const delta: string = msg.delta ?? '';
          if (delta) setTranscript((prev) => prev + delta);
        } else if (msg.type === 'error') {
          setError(msg.error?.message ?? 'Transcription error');
        }
      } catch {
        // non-JSON message, ignore
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed');
      setIsTranscribing(false);
    };

    ws.onclose = () => {
      setIsTranscribing(false);
    };
  }, []);

  const sendAudioChunk = useCallback((base64Pcm16: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Pcm16,
      })
    );
  }, []);

  const commit = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsTranscribing(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  const injectTranscript = useCallback((text: string) => {
    setTranscript(text);
  }, []);

  const transcribeBatch = useCallback(async (uri: string): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    setIsTranscribing(true);
    setError(null);
    try {
      const audioResponse = await fetch(uri);
      const blob = await audioResponse.blob();

      const form = new FormData();
      form.append('audio', blob, 'recording.m4a');

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/whisper-batch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });

      if (!res.ok) throw new Error('Transcription failed');
      const data = await res.json();
      const text: string = data.transcript ?? '';
      setTranscript(text);
      return text;
    } catch (err: any) {
      setError(err?.message ?? 'Transcription failed');
      throw err;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  return { transcript, isTranscribing, error, connect, sendAudioChunk, commit, disconnect, resetTranscript, injectTranscript, transcribeBatch };
}
