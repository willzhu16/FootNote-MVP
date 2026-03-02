import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { useNotes } from '@/hooks/useNotes';
import { useGptStructure } from '@/hooks/useGptStructure';
import { VoiceNote, NoteMode, StructuredContent } from '@/types/note';
import { StructuredNote } from '@/components/StructuredNote';
import { MODE_LABELS } from '@/lib/constants';
import { transcribeAudioUri } from '@/lib/transcribeAudio';
import { pendingAudio } from '@/lib/pendingAudio';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNote, updateNote, deleteNote } = useNotes();
  const gpt = useGptStructure();
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark: dark } = useTheme();

  const player = useAudioPlayer(playbackUri ? { uri: playbackUri } : null);

  useEffect(() => {
    if (!id) return;
    getNote(id).then((n) => {
      setNote(n);
      setTitleValue(n?.title ?? '');
      setLoading(false);
    });
  }, [id]);

  const handleSaveTitle = useCallback(async () => {
    if (!note) return;
    setEditingTitle(false);
    const updated = await updateNote(note.id, { title: titleValue || null });
    if (updated) setNote(updated);
  }, [note, titleValue, updateNote]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Note', 'This note will be removed. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (note) {
            await deleteNote(note.id);
            router.back();
          }
        },
      },
    ]);
  }, [note, deleteNote, router]);

  const handleShare = useCallback(async () => {
    if (!note) return;
    const displayTitle = note.title || note.raw_transcript.slice(0, 60) || 'Untitled note';
    const sections = (Object.entries(note.structured_content) as [string, string[]][])
      .filter(([, items]) => items.length > 0)
      .map(([key, items]) =>
        `${key.replace(/_/g, ' ').toUpperCase()}\n${items.map((i) => `• ${i}`).join('\n')}`
      )
      .join('\n\n');
    const body = sections || note.raw_transcript || '(no content)';
    await Share.share({
      title: displayTitle,
      message: `${displayTitle}\n\n${body}`,
    });
  }, [note]);

  const handlePlayPause = useCallback(() => {
    const uris = pendingAudio.get(note?.id ?? '');
    if (uris.length === 0) return;
    if (!isPlaying) {
      setPlaybackUri(uris[0]);
      setIsPlaying(true);
      player.play();
    } else {
      player.pause();
      setIsPlaying(false);
    }
  }, [note, player, isPlaying]);

  const handleItemChange = useCallback(async (
    key: keyof StructuredContent,
    index: number,
    value: string,
  ) => {
    if (!note) return;
    const updated = {
      ...note.structured_content,
      [key]: (note.structured_content[key] as string[]).map((item, i) =>
        i === index ? value : item
      ),
    };
    const saved = await updateNote(note.id, { structured_content: updated });
    if (saved) setNote(saved);
  }, [note, updateNote]);

  // When gpt finishes structuring after a transcription or reorganize, save the result
  const pendingStructureNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingStructureNoteIdRef.current || gpt.isStructuring) return;
    const noteId = pendingStructureNoteIdRef.current;
    pendingStructureNoteIdRef.current = null;
    updateNote(noteId, { structured_content: gpt.structured }).then((updated) => {
      if (updated) setNote(updated);
      setTranscribing(false);
    });
  }, [gpt.isStructuring]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTranscribe = useCallback(async () => {
    if (!note) return;
    setTranscribing(true);
    try {
      const localUris = pendingAudio.get(note.id);
      let transcript = '';

      if (localUris.length > 0) {
        for (const uri of localUris) {
          try {
            const text = await transcribeAudioUri(uri);
            transcript = transcript ? `${transcript} ${text}` : text;
          } catch {
            // Skip chunks that fail (file may have expired)
          }
        }
        pendingAudio.clear(note.id);
      } else {
        throw new Error('No audio available to transcribe');
      }

      if (!transcript) throw new Error('Transcription returned empty result');

      const title = transcript.slice(0, 60) || note.title || null;

      const withTranscript = await updateNote(note.id, { raw_transcript: transcript, title });
      if (withTranscript) setNote(withTranscript);

      pendingStructureNoteIdRef.current = note.id;
      gpt.reorganize(transcript, note.mode as NoteMode);
    } catch {
      pendingStructureNoteIdRef.current = null;
      setTranscribing(false);
      Alert.alert('Error', 'Transcription failed. The audio may have expired — please re-record.');
    }
  }, [note, gpt, updateNote]);

  if (loading) {
    return (
      <View style={[styles.container, dark && styles.containerDark, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.meta, dark && styles.subtextDark]}>Loading…</Text>
      </View>
    );
  }

  if (!note) {
    return (
      <View style={[styles.container, dark && styles.containerDark, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.meta, dark && styles.subtextDark]}>Note not found.</Text>
      </View>
    );
  }

  const displayTitle = note.title || note.raw_transcript.slice(0, 60) || 'Untitled note';

  return (
    <ScrollView
      style={[styles.container, dark && styles.containerDark]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Nav row */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={dark ? '#fff' : '#111'} />
          <Text style={[styles.backText, dark && styles.textDark]}>Notes</Text>
        </TouchableOpacity>
        <View style={styles.navActions}>
          <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
            <Ionicons name="share-outline" size={18} color={dark ? '#aaa' : '#555'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={18} color="#e53e3e" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Title */}
      {editingTitle ? (
        <TextInput
          style={[styles.titleInput, dark && styles.titleInputDark]}
          value={titleValue}
          onChangeText={setTitleValue}
          onBlur={handleSaveTitle}
          onSubmitEditing={handleSaveTitle}
          autoFocus
          returnKeyType="done"
          multiline
        />
      ) : (
        <TouchableOpacity onPress={() => setEditingTitle(true)} style={styles.titleRow}>
          <Text style={[styles.title, dark && styles.textDark]}>{displayTitle}</Text>
          <Ionicons name="pencil-outline" size={14} color={dark ? '#555' : '#ccc'} style={styles.editIcon} />
        </TouchableOpacity>
      )}

      <Text style={[styles.meta, dark && styles.subtextDark]}>
        {formatDate(note.created_at)}  ·  {MODE_LABELS[note.mode]}
        {note.duration_seconds > 0 ? `  ·  ${Math.floor(note.duration_seconds / 60)}m ${note.duration_seconds % 60}s` : ''}
      </Text>

      {/* Structured content (editable) */}
      <StructuredNote
        structured={note.structured_content}
        mode={note.mode as NoteMode}
        editable={true}
        onItemChange={handleItemChange}
      />

      {/* Reorganize button (when transcript exists) */}
      {note.raw_transcript !== '' && !transcribing && (
        <TouchableOpacity
          style={[styles.actionRowBtn, dark && styles.actionRowBtnDark]}
          onPress={() => {
            pendingStructureNoteIdRef.current = note.id;
            gpt.reorganize(note.raw_transcript, note.mode as NoteMode);
          }}
          disabled={gpt.isStructuring}
          activeOpacity={0.7}
        >
          {gpt.isStructuring ? (
            <ActivityIndicator size="small" color={dark ? '#fff' : '#111'} />
          ) : (
            <Text style={[styles.actionRowBtnText, dark && styles.textDark]}>✦ Reorganize</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Audio playback (when local chunks are available) */}
      {pendingAudio.has(note.id) && (
        <TouchableOpacity
          style={[styles.actionRowBtn, dark && styles.actionRowBtnDark, styles.playRow]}
          onPress={handlePlayPause}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isPlaying ? 'pause-outline' : 'play-outline'}
            size={16}
            color={dark ? '#fff' : '#111'}
          />
          <Text style={[styles.actionRowBtnText, dark && styles.textDark]}>
            {isPlaying ? 'Pause' : 'Play Recording'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Transcribe button for notes recorded while offline */}
      {note.raw_transcript === '' && pendingAudio.has(note.id) && (
        <TouchableOpacity
          style={[styles.actionRowBtn, dark && styles.actionRowBtnDark]}
          onPress={handleTranscribe}
          disabled={transcribing}
          activeOpacity={0.7}
        >
          {transcribing ? (
            <ActivityIndicator size="small" color={dark ? '#fff' : '#111'} />
          ) : (
            <Text style={[styles.actionRowBtnText, dark && styles.textDark]}>
              ✦ Transcribe Recording
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Raw transcript */}
      <View style={[styles.transcriptBox, dark && styles.transcriptBoxDark]}>
        <Text style={[styles.transcriptLabel, dark && styles.subtextDark]}>RAW TRANSCRIPT</Text>
        <Text style={[styles.transcriptText, dark && styles.transcriptTextDark]}>
          {note.raw_transcript || 'No transcript recorded.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  containerDark: { backgroundColor: '#0d0d0d' },
  content: { gap: 16, paddingHorizontal: 20 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 16, color: '#111', fontWeight: '500' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { padding: 4 },
  textDark: { color: '#fff' },
  subtextDark: { color: '#666' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 24, fontWeight: '700', color: '#111', lineHeight: 30, letterSpacing: -0.3 },
  editIcon: { marginTop: 6 },
  titleInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    lineHeight: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 4,
  },
  titleInputDark: { color: '#fff', borderBottomColor: '#fff' },
  meta: { fontSize: 12, color: '#aaa' },
  transcriptBox: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  transcriptBoxDark: { backgroundColor: '#1a1a1a' },
  transcriptLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  transcriptText: { fontSize: 14, color: '#444', lineHeight: 22 },
  transcriptTextDark: { color: '#888' },
  actionRowBtn: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionRowBtnDark: { borderColor: '#333' },
  actionRowBtnText: { fontSize: 14, fontWeight: '600', color: '#111' },
  playRow: { flexDirection: 'row', gap: 8 },
});
