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

function extractToken(req: Request): string | null {
  // Try Authorization header first, then query param (for WS upgrades)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  const url = new URL(req.url);
  return url.searchParams.get('access_token');
}

Deno.serve(async (req: Request) => {
  // Validate auth
  const token = extractToken(req);
  if (!token || !(await verifyToken(token))) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Check for WebSocket upgrade
  const upgrade = req.headers.get('upgrade')?.toLowerCase();
  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  clientSocket.onopen = async () => {
    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?intent=transcription',
      [],
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      } as any
    );

    openaiWs.onopen = () => {
      // Configure transcription session
      openaiWs.send(
        JSON.stringify({
          type: 'transcription_session.update',
          session: {
            input_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'gpt-4o-transcribe',
            },
            turn_detection: {
              type: 'server_vad',
              silence_duration_ms: 500,
            },
          },
        })
      );
    };

    // Relay OpenAI → client
    openaiWs.onmessage = (event) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(event.data);
      }
    };

    openaiWs.onerror = () => {
      clientSocket.close(1011, 'OpenAI connection error');
    };

    openaiWs.onclose = () => {
      if (clientSocket.readyState === WebSocket.OPEN) clientSocket.close();
    };

    // Relay client → OpenAI
    clientSocket.onmessage = (event) => {
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(event.data);
      }
    };

    clientSocket.onclose = () => {
      openaiWs.close();
    };

    clientSocket.onerror = () => {
      openaiWs.close();
    };
  };

  return response;
});
