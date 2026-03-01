import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNotes } from '@/hooks/useNotes';
import { VoiceNote, NoteMode } from '@/types/note';
import { StructuredNote } from '@/components/StructuredNote';
import { ModeSelector } from '@/components/ModeSelector';
import { MODE_LABELS } from '@/lib/constants';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNote, updateNote, deleteNote } = useNotes();
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';

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
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color="#e53e3e" />
        </TouchableOpacity>
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

      {/* Structured content */}
      <StructuredNote
        structured={note.structured_content}
        mode={note.mode as NoteMode}
      />

      {/* Raw transcript collapsible */}
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
  deleteBtn: { padding: 4 },
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
});
