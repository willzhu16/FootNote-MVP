-- FootNote initial schema

CREATE TABLE voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  raw_transcript TEXT DEFAULT '',
  structured_content JSONB DEFAULT '{"bullets":[],"action_items":[],"questions":[],"themes":[]}'::jsonb,
  audio_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_archived BOOLEAN DEFAULT false
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voice_notes_updated_at
  BEFORE UPDATE ON voice_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notes"
  ON voice_notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-notes', 'audio-notes', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "Users can manage their own audio"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'audio-notes' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'audio-notes' AND auth.uid()::text = (storage.foldername(name))[1]);
