import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { VoiceNote, NoteMode, StructuredContent, EMPTY_STRUCTURED_CONTENT } from '@/types/note';
import { useAuth } from '@/context/AuthContext';

export function useNotes() {
  const { user, isDevMode } = useAuth();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!user || isDevMode) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('voice_notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setNotes(data as VoiceNote[]);
    }
  }, [user]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = useCallback(
    async (partial: {
      raw_transcript: string;
      structured_content: StructuredContent;
      duration_seconds: number;
      mode: NoteMode;
      title?: string;
      audio_url?: string;
    }): Promise<VoiceNote | null> => {
      if (!user) return null;
      // In dev mode, create a local-only note without hitting Supabase
      if (isDevMode) {
        const note: VoiceNote = {
          id: `dev-${Date.now()}`,
          user_id: 'dev-user',
          title: partial.title ?? null,
          raw_transcript: partial.raw_transcript,
          structured_content: partial.structured_content,
          audio_url: null,
          duration_seconds: partial.duration_seconds,
          mode: partial.mode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_archived: false,
        };
        setNotes(prev => [note, ...prev]);
        return note;
      }
      const { data, error } = await supabase
        .from('voice_notes')
        .insert({
          user_id: user.id,
          raw_transcript: partial.raw_transcript,
          structured_content: partial.structured_content,
          duration_seconds: partial.duration_seconds,
          mode: partial.mode,
          title: partial.title ?? null,
          audio_url: partial.audio_url ?? null,
        })
        .select()
        .single();
      if (error) {
        setError(error.message);
        return null;
      }
      const note = data as VoiceNote;
      setNotes((prev) => [note, ...prev]);
      return note;
    },
    [user]
  );

  const updateNote = useCallback(async (id: string, patch: Partial<VoiceNote>) => {
    const { data, error } = await supabase
      .from('voice_notes')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return null;
    }
    const updated = data as VoiceNote;
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    return updated;
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    await supabase.from('voice_notes').update({ is_archived: true }).eq('id', id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const getNote = useCallback(async (id: string): Promise<VoiceNote | null> => {
    const { data, error } = await supabase
      .from('voice_notes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data as VoiceNote;
  }, []);

  return { notes, loading, error, fetchNotes, createNote, updateNote, deleteNote, getNote };
}
