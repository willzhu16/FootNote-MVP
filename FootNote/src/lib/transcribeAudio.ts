import { supabase } from '@/lib/supabase';
import { SUPABASE_FUNCTIONS_URL } from '@/lib/constants';

/**
 * Transcribes an audio file (local file:// URI or remote https:// URL)
 * by sending it to the whisper-batch edge function.
 */
export async function transcribeAudioUri(uri: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

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
  return data.transcript ?? '';
}
