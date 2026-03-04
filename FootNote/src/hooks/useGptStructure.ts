import { useCallback, useRef, useState } from 'react';
import { SUPABASE_FUNCTIONS_URL, STRUCTURE_DEBOUNCE_MS, STRUCTURE_MIN_NEW_WORDS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { StructuredContent, NoteMode, EMPTY_STRUCTURED_CONTENT } from '@/types/note';

const FILLER_PATTERNS = [
  /\b(um+|uh+|erm+|hmm+)\b/gi,
  /\b(you know|i mean|kind of|sort of)\b/gi,
  /\b(like)\b/gi,
  /\b(i think|i guess|maybe)\b/gi,
];

function stripFillers(text: string): string {
  let cleaned = text;
  for (const pattern of FILLER_PATTERNS) cleaned = cleaned.replace(pattern, ' ');
  return cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function normalizeItem(text: string): string {
  return stripFillers(
    text
      .replace(/^\[(x| )\]\s*/i, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^[-*�]\s*/, '')
      .trim()
  );
}

function mockStructure(transcript: string): StructuredContent {
  const cleanedTranscript = stripFillers(transcript);
  const sentences = cleanedTranscript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const actionKeywords = /\b(should|need to|want to|could|must|have to|going to|plan to|add|build|create|update|fix)\b/i;
  const questionPattern = /\?$/;

  const bullets: string[] = [];
  const action_items: string[] = [];
  const questions: string[] = [];

  for (const s of sentences) {
    if (questionPattern.test(s)) {
      questions.push(normalizeItem(s));
    } else if (actionKeywords.test(s)) {
      action_items.push(normalizeItem(s.replace(/^(I\s+)?(also\s+)?/i, '')));
    } else {
      bullets.push(normalizeItem(s));
    }
  }

  const topicWords = cleanedTranscript
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !['this', 'that', 'with', 'have', 'about', 'just', 'really', 'should', 'would'].includes(w)
    )
    .reduce<Record<string, number>>((acc, w) => {
      acc[w] = (acc[w] ?? 0) + 1;
      return acc;
    }, {});

  const themes = Object.entries(topicWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

  return {
    bullets: Array.from(new Set(bullets)).slice(0, 6),
    action_items: Array.from(new Set(action_items)).slice(0, 6),
    questions: Array.from(new Set(questions)).slice(0, 5),
    themes,
  };
}

function parseMarkdownToStructured(markdown: string): StructuredContent {
  const result: StructuredContent = {
    bullets: [],
    action_items: [],
    questions: [],
    themes: [],
  };

  const lines = markdown.split('\n');
  let currentSection: keyof StructuredContent | null = null;

  const sectionMap: Record<string, keyof StructuredContent> = {
    bullets: 'bullets',
    'key points': 'bullets',
    ideas: 'bullets',
    'hook ideas': 'bullets',
    goals: 'bullets',
    'action items': 'action_items',
    steps: 'action_items',
    constraints: 'action_items',
    'core thesis': 'action_items',
    questions: 'questions',
    'open questions': 'questions',
    'follow-up angles': 'questions',
    'outline beats': 'questions',
    risks: 'questions',
    themes: 'themes',
    'cta / close': 'themes',
    timeline: 'themes',
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      const heading = headingMatch[1].toLowerCase().replace(/[^a-z /-]/g, '').trim();
      currentSection = sectionMap[heading] ?? null;
      continue;
    }

    if (!currentSection) continue;

    const bulletMatch = trimmed.match(/^([-*�]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      const item = normalizeItem(bulletMatch[2]);
      if (item) result[currentSection].push(item);
    }
  }

  return {
    bullets: Array.from(new Set(result.bullets)).slice(0, 8),
    action_items: Array.from(new Set(result.action_items)).slice(0, 8),
    questions: Array.from(new Set(result.questions)).slice(0, 8),
    themes: Array.from(new Set(result.themes)).slice(0, 6),
  };
}

export interface GptStructureState {
  structured: StructuredContent;
  isStructuring: boolean;
  structureError: string | null;
  reorganize: (transcript: string, mode: NoteMode) => Promise<void>;
  scheduleStructure: (transcript: string, mode: NoteMode) => void;
  resetStructured: () => void;
}

export function useGptStructure(): GptStructureState {
  const [structured, setStructured] = useState<StructuredContent>(EMPTY_STRUCTURED_CONTENT);
  const [isStructuring, setIsStructuring] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWordCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const MAX_GPT_WORDS = 3000;

  const runStructure = useCallback(async (transcript: string, mode: NoteMode) => {
    if (!transcript.trim()) return;

    // Truncate very long transcripts to keep API costs reasonable.
    // We keep the tail (most recent content) since that's what the user is
    // still thinking about; a short prefix note signals the trim.
    const words = transcript.split(/\s+/).filter(Boolean);
    const trimmedTranscript = words.length > MAX_GPT_WORDS
      ? '[Earlier content omitted] ' + words.slice(-MAX_GPT_WORDS).join(' ')
      : transcript;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    }

    // Dev mode / no session: use local mock parser instead of Edge Function
    if (!session) {
      setIsStructuring(true);
      setStructureError(null);
      await new Promise((r) => setTimeout(r, 350));
      setStructured(mockStructure(trimmedTranscript));
      setIsStructuring(false);
      lastWordCountRef.current = transcript.split(/\s+/).filter(Boolean).length;
      return;
    }

    setIsStructuring(true);
    setStructureError(null);

    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/gpt-structure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ transcript: trimmedTranscript, mode }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const markdown: string = data.markdown ?? '';
      setStructured(parseMarkdownToStructured(markdown));
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setStructureError('Structuring failed — check your Supabase function and OpenAI key.');
    } finally {
      setIsStructuring(false);
      lastWordCountRef.current = transcript.split(/\s+/).filter(Boolean).length;
    }
  }, []);

  const reorganize = useCallback(
    async (transcript: string, mode: NoteMode) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      await runStructure(transcript, mode);
    },
    [runStructure]
  );

  const scheduleStructure = useCallback(
    (transcript: string, mode: NoteMode) => {
      const wordCount = transcript.split(/\s+/).filter(Boolean).length;
      const newWords = wordCount - lastWordCountRef.current;
      if (newWords < STRUCTURE_MIN_NEW_WORDS) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runStructure(transcript, mode);
      }, STRUCTURE_DEBOUNCE_MS);
    },
    [runStructure]
  );

  const resetStructured = useCallback(() => {
    setStructured(EMPTY_STRUCTURED_CONTENT);
    setStructureError(null);
    lastWordCountRef.current = 0;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { structured, isStructuring, structureError, reorganize, scheduleStructure, resetStructured };
}
