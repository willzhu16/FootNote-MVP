import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function verifyToken(token: string): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    return !!user && !error;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !(await verifyToken(token))) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('audio') as File;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No audio file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openaiForm = new FormData();
    openaiForm.append('file', file, 'recording.m4a');
    openaiForm.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: openaiForm,
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: await res.text() }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ transcript: data.text ?? '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
