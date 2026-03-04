import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const SUMMARIZE_PROMPT = `You are a concise note summarizer. The user has been dictating notes and their transcript is getting long. Condense it into a focused summary that:
- Preserves every specific decision, name, number, and action item exactly
- Captures the main ideas and themes
- Removes filler words, repetition, and hedging
- Stays under 400 words
- Writes in first-person present tense to match the speaker's voice

Respond with ONLY the summary text — no headers, no markdown.`;

const MODE_PROMPTS: Record<string, string> = {
  default: `You are a sharp, concise note-taker for voice-recorded thoughts. Extract signal from spoken stream-of-consciousness and organize it into clean, scannable notes.

Rules:
- Strip ALL filler: "um", "uh", "like", "you know", "I mean", "sort of", "kind of", "I think", "maybe", "basically"
- Preserve every specific detail: names, numbers, dates, dollar amounts, deadlines
- Bullets are tight 5–12 word statements (observations, ideas, decisions) — not action tasks
- Action Items are only tasks the speaker explicitly commits to doing — start each with a verb
- Omit any section that has no content

Respond ONLY with the markdown sections below.

## Key Points
- [distinct observation, idea, or decision]

## Action Items
- [ ] [specific task starting with a verb]

## Questions
- [open question or unresolved topic]

## Themes
- [1–3 word recurring concept]`,

  brainstorm: `You are a brainstorm facilitator capturing raw ideas from spoken notes. Preserve every distinct concept, however half-formed.

Rules:
- Keep speculative language ("what if", "could we", "what about") — it signals creative thinking
- Strip only pure filler sounds: um, uh, erm, hmm
- Each idea bullet is a standalone concept in 5–10 words
- Constraints and blockers are as valuable as ideas — always capture them
- Omit any section that has no content

Respond ONLY with the markdown sections below.

## Ideas
- [distinct idea or concept in 5–10 words]

## Constraints
- [blocker, dependency, or limitation mentioned]

## Follow-up Angles
- [direction worth exploring further]

## Open Questions
- [unresolved "what if" or uncertainty]`,

  script: `You are a content strategist helping a creator structure a video or post. Extract raw material for a compelling piece.

Rules:
- Hook Ideas spark curiosity, create tension, or make a bold claim — not summaries
- Core Thesis is the single central argument or transformation (1–2 sentences max)
- Outline Beats are structural waypoints in order — what happens when
- CTA / Close is what the audience should do, feel, or remember
- Omit any section that has no content

Respond ONLY with the markdown sections below.

## Hook Ideas
- [opening statement that creates curiosity or tension]

## Core Thesis
- [central argument or transformation in one sentence]

## Outline Beats
- [content section or story beat, in order]

## CTA / Close
- [call to action or closing thought]`,

  planning: `You are a strategic planning assistant. Extract concrete goals and actions from spoken notes. Precision matters — capture exact names, numbers, and deadlines.

Rules:
- Goals describe measurable outcomes, not activities
- Steps must be concrete and start with an imperative verb: Build, Send, Review, Schedule, Define, etc.
- Risks are specific blockers or failure modes — not generic concerns
- Timeline entries are only included when a specific date, deadline, or duration is mentioned
- Omit any section that has no content

Respond ONLY with the markdown sections below.

## Goals
- [measurable outcome or definition of success]

## Steps
- [ ] [imperative action, specific enough to be unambiguous]

## Risks
- [specific blocker or failure mode]

## Timeline
- [time-based milestone — only if a date or deadline was mentioned]`,
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

  const { transcript, mode = 'default', action } = await req.json();

  if (!transcript?.trim()) {
    return new Response('Missing transcript', { status: 400 });
  }

  // Summarization action — condenses a long transcript into a dense summary
  if (action === 'summarize') {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        stream: false,
        messages: [
          { role: 'system', content: SUMMARIZE_PROMPT },
          { role: 'user', content: transcript },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });
    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      return new Response(`OpenAI error: ${err}`, { status: 502 });
    }
    const result = await openaiResponse.json();
    const summary = result.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ summary }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
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
      stream: false,
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

  const result = await openaiResponse.json();
  const markdown = result.choices?.[0]?.message?.content ?? '';

  return new Response(JSON.stringify({ markdown }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
