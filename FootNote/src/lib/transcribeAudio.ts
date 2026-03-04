import { supabase } from '@/lib/supabase';
import { SUPABASE_FUNCTIONS_URL } from '@/lib/constants';

/**
 * Transcribes an audio file (local file:// URI or remote https:// URL)
 * by sending it to the whisper-batch edge function.
 */
export async function transcribeAudioUri(uri: string): Promise<string> {
  // getSession() auto-refreshes if expired; fall back to explicit refresh if needed.
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  if (!session) throw new Error('Not authenticated');

  // React Native native file upload — do NOT use fetch(uri) + blob(),
  // which is unreliable for file:// URIs in React Native/iOS.
  const form = new FormData();
  form.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);

  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/whisper-batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Transcription failed: ${errText}`);
  }
  const data = await res.json();
  return data.transcript ?? '';
}
