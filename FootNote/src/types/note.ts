export type NoteMode = 'default' | 'brainstorm' | 'script' | 'planning';

export interface StructuredContent {
  bullets: string[];
  action_items: string[];
  questions: string[];
  themes: string[];
}

export const EMPTY_STRUCTURED_CONTENT: StructuredContent = {
  bullets: [],
  action_items: [],
  questions: [],
  themes: [],
};

export interface VoiceNote {
  id: string;
  user_id: string;
  title: string | null;
  raw_transcript: string;
  structured_content: StructuredContent;
  audio_url: string | null;
  duration_seconds: number;
  mode: NoteMode;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}
