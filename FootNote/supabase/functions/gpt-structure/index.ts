import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MODE_PROMPTS: Record<string, string> = {
  default: `You are a precise thought organizer for free-form spoken rants on any topic.
Rewrite notes in clean language by removing filler words and hedging (um, uh, like, i think, maybe, you know) while preserving meaning.
Respond ONLY with the sections below in markdown.

## Bullets
- key ideas as concise bullet points (clear, direct, no filler)

## Action Items
- [ ] specific tasks to do when explicit actions exist (skip if none)

## Questions
- open questions raised (skip if none)

## Themes
- high-level recurring themes or concepts as noun phrases`,

  brainstorm: `You are a brainstorm facilitator. Organize the spoken notes below into exactly these 4 markdown sections.
Respond ONLY with the sections.

## Ideas
- cluster distinct ideas as bullet points

## Constraints
- limitations, blockers, or dependencies mentioned (omit if none)

## Follow-up Angles
- new directions worth exploring

## Open Questions
- unresolved uncertainties (omit if none)`,

  script: `You are a content strategist. Organize the spoken notes below into exactly these 4 markdown sections.
Respond ONLY with the sections.

## Hook Ideas
- opening concepts or attention-grabbers

## Core Thesis
- the main argument or message (1-2 bullets)

## Outline Beats
- key points in order

## CTA / Close
- how it ends or what action is called for`,

  planning: `You are a strategic planner. Organize the spoken notes below into exactly these 4 markdown sections.
Respond ONLY with the sections.

## Goals
- what success looks like

## Steps
- [ ] concrete next actions in order

## Risks
- potential blockers or failure modes (omit if none)

## Timeline
- time-based milestones if mentioned (omit if none)`,
};

async function verifyJwt(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    return !!user && !error;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  const valid = await verifyJwt(authHeader);
  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { transcript, mode = 'default' } = await req.json();

  if (!transcript?.trim()) {
    return new Response('Missing transcript', { status: 400 });
  }

  const systemPrompt = MODE_PROMPTS[mode] ?? MODE_PROMPTS.default;

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });

  if (!openaiResponse.ok) {
    const err = await openaiResponse.text();
    return new Response(`OpenAI error: ${err}`, { status: 502 });
  }

  // Stream SSE back to client
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader = openaiResponse.body!.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            break;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content ?? '';
            if (token) {
              await writer.write(encoder.encode(`data: ${token}\n\n`));
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
