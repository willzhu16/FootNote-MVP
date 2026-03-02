import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ModeSelector } from '@/components/ModeSelector';
import { RecordButton } from '@/components/RecordButton';
import { LiveTranscript } from '@/components/LiveTranscript';
import { StructuredNote } from '@/components/StructuredNote';
import { useAudioRecording } from '@/hooks/useAudioRecording';
import { useWhisperStream } from '@/hooks/useWhisperStream';
import { useGptStructure } from '@/hooks/useGptStructure';
import { useNotes } from '@/hooks/useNotes';
import { NoteMode } from '@/types/note';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

function formatDuration(ms: number) {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const DEMO_TRANSCRIPT = `Okay so I'm thinking about the landing page for FootNote. The core message needs to be really simple — something like "your thoughts, organized." I think the hero section should have a phone mockup showing the live transcript updating in real time. That's the visual hook.

For the value props I'm thinking three columns: speak freely, get structure, save everything. Each one with a small icon. Keep it minimal, no fluff.

I also want to add a pricing section eventually. Free tier with like five notes a month, then a pro tier for unlimited. Need to figure out what the right price point is — maybe eight dollars a month? Could test both eight and twelve.

One thing I keep coming back to is the onboarding flow. Right now it just drops you into the notes list which is empty and kind of sad. I should add a short walkthrough — maybe just two or three screens showing how it works before the first recording. Or even better, auto-start a demo recording so they can see it in action immediately.

Also need to think about sharing. What if you could share a structured note as a card — like a clean image you could post? That could be a nice growth mechanic. People share their thinking publicly.`;

export default function RecordScreen() {
  const [mode, setMode] = useState<NoteMode>('default');
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const router = useRouter();
  const { user } = useAuth();

  const audio = useAudioRecording();
  const whisper = useWhisperStream();
  const gpt = useGptStructure();
  const { createNote } = useNotes();

  // Trigger scheduled structure check whenever transcript grows
  useEffect(() => {
    if (whisper.transcript) {
      gpt.scheduleStructure(whisper.transcript, mode);
    }
  }, [whisper.transcript, mode]);

  const handleToggleRecording = useCallback(async () => {
    if (audio.isRecording) {
      // Stop recording
      const uri = await audio.stopRecording();

      // Transcribe then structure + save
      setSaving(true);
      try {
        const transcript = uri ? await whisper.transcribeBatch(uri) : '';

        await gpt.reorganize(transcript, mode);

        const durationSecs = Math.floor(audio.durationMs / 1000);
        const firstBullet = gpt.structured.bullets[0];
        const title = firstBullet
          ? firstBullet.slice(0, 60)
          : transcript.slice(0, 60) || null;

        const note = await createNote({
          raw_transcript: transcript,
          structured_content: gpt.structured,
          duration_seconds: durationSecs,
          mode,
          title: title ?? undefined,
        });

        // Upload audio to Supabase Storage
        if (uri && note && user) {
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const path = `${user.id}/${note.id}.m4a`;
            await supabase.storage.from('audio-notes').upload(path, blob, {
              contentType: 'audio/m4a',
              upsert: true,
            });
            supabase.storage.from('audio-notes').getPublicUrl(path);
            // Note: bucket is private so we'll use signed URLs in detail view
          } catch {
            // Audio upload failure is non-critical
          }
        }

        if (note) {
          whisper.resetTranscript();
          gpt.resetStructured();
          router.push(`/(app)/note/${note.id}`);
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to save note. Please try again.');
      } finally {
        setSaving(false);
      }
    } else {
      // Start recording
      whisper.resetTranscript();
      gpt.resetStructured();
      try {
        await audio.startRecording();
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Failed to start recording');
      }
    }
  }, [audio, whisper, gpt, mode, createNote, user, router]);

  const handleDemo = useCallback(async () => {
    whisper.resetTranscript();
    gpt.resetStructured();
    whisper.injectTranscript(DEMO_TRANSCRIPT);
    await gpt.reorganize(DEMO_TRANSCRIPT, mode);
  }, [whisper, gpt, mode]);

  const hasTranscript = whisper.transcript.length > 0;

  return (
    <ScrollView
      style={[styles.container, dark && styles.containerDark]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.heading, dark && styles.textDark]}>
          {audio.isRecording ? 'Recording…' : whisper.isTranscribing ? 'Transcribing…' : saving ? 'Saving…' : 'Ready'}
        </Text>
        {audio.isRecording && (
          <Text style={styles.duration}>{formatDuration(audio.durationMs)}</Text>
        )}
      </View>

      {/* Mode selector (disabled while recording) */}
      <ModeSelector selected={mode} onChange={setMode} disabled={audio.isRecording} />

      {/* Live transcript */}
      <View style={styles.transcriptWrapper}>
        <LiveTranscript
          transcript={whisper.transcript}
          isTranscribing={whisper.isTranscribing}
        />
      </View>

      {/* Structured note (live) */}
      {(hasTranscript || gpt.isStructuring) && (
        <StructuredNote
          structured={gpt.structured}
          mode={mode}
          isStructuring={gpt.isStructuring}
        />
      )}

      {/* Reorganize button */}
      {hasTranscript && !audio.isRecording && !saving && (
        <TouchableOpacity
          style={[styles.reorganizeBtn, dark && styles.reorganizeBtnDark]}
          onPress={() => gpt.reorganize(whisper.transcript, mode)}
          disabled={gpt.isStructuring}
          activeOpacity={0.7}
        >
          <Text style={[styles.reorganizeBtnText, dark && styles.textDark]}>
            ✦ Reorganize
          </Text>
        </TouchableOpacity>
      )}

      {/* Error banner */}
      {whisper.error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{whisper.error}</Text>
        </View>
      )}

      {/* Record button */}
      <View style={styles.recordRow}>
        <RecordButton
          isRecording={audio.isRecording}
          onPress={handleToggleRecording}
          disabled={saving || whisper.isTranscribing}
        />
        {!audio.isRecording && !saving && !whisper.isTranscribing && (
          <Text style={[styles.hint, dark && styles.subtextDark]}>Tap to record</Text>
        )}
        {!audio.isRecording && !saving && !whisper.isTranscribing && !hasTranscript && (
          <TouchableOpacity
            onPress={handleDemo}
            disabled={gpt.isStructuring}
            style={styles.demoBtn}
          >
            <Text style={[styles.demoText, dark && styles.subtextDark]}>
              Try demo
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  containerDark: { backgroundColor: '#0d0d0d' },
  content: { gap: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  heading: { fontSize: 22, fontWeight: '700', color: '#111', letterSpacing: -0.3 },
  textDark: { color: '#fff' },
  subtextDark: { color: '#666' },
  duration: { fontSize: 20, fontWeight: '600', color: '#e53e3e', fontVariant: ['tabular-nums'] },
  transcriptWrapper: { height: 120 },
  reorganizeBtn: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  reorganizeBtnDark: { borderColor: '#333' },
  reorganizeBtnText: { fontSize: 14, fontWeight: '600', color: '#111' },
  errorBanner: {
    marginHorizontal: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: 13, color: '#b91c1c' },
  recordRow: { alignItems: 'center', paddingTop: 16, gap: 12 },
  hint: { fontSize: 13, color: '#aaa' },
  demoBtn: { marginTop: 4 },
  demoText: { fontSize: 12, color: '#bbb', textDecorationLine: 'underline' },
});
