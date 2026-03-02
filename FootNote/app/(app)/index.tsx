import { useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotes } from '@/hooks/useNotes';
import { NoteCard } from '@/components/NoteCard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { VoiceNote } from '@/types/note';

type NoteSection = { title: string; data: VoiceNote[] };

function groupByDate(notes: VoiceNote[]): NoteSection[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 7);

  const buckets: NoteSection[] = [
    { title: 'Today', data: [] },
    { title: 'Yesterday', data: [] },
    { title: 'This Week', data: [] },
    { title: 'Older', data: [] },
  ];

  for (const note of notes) {
    const d = new Date(note.created_at);
    const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (noteDay >= startOfToday) buckets[0].data.push(note);
    else if (noteDay >= startOfYesterday) buckets[1].data.push(note);
    else if (noteDay >= startOfWeek) buckets[2].data.push(note);
    else buckets[3].data.push(note);
  }

  return buckets.filter((b) => b.data.length > 0);
}

export default function NotesListScreen() {
  const { notes, loading, fetchNotes, deleteNote } = useNotes();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark: dark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const q = searchQuery.trim().toLowerCase();
  const sorted = sortAsc ? [...notes].reverse() : notes;
  const filteredNotes = q
    ? sorted.filter(
        (n) =>
          (n.title ?? '').toLowerCase().includes(q) ||
          n.raw_transcript.toLowerCase().includes(q)
      )
    : sorted;

  const sections = groupByDate(filteredNotes);

  return (
    <View style={[styles.container, dark && styles.containerDark, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, dark && styles.textDark]}>FootNote</Text>
          <Text style={[styles.subtitle, dark && styles.subtextDark]}>
            {q
              ? `${filteredNotes.length} of ${notes.length} notes`
              : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setSortAsc((a) => !a)} style={styles.iconBtn}>
            <Ionicons
              name={sortAsc ? 'arrow-up-outline' : 'arrow-down-outline'}
              size={20}
              color={dark ? '#666' : '#aaa'}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={styles.iconBtn}>
            <Ionicons name="person-circle-outline" size={28} color={dark ? '#666' : '#aaa'} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchRow, dark && styles.searchRowDark]}>
        <Ionicons name="search-outline" size={16} color={dark ? '#555' : '#aaa'} />
        <TextInput
          style={[styles.searchInput, dark && styles.textDark]}
          placeholder="Search notes…"
          placeholderTextColor={dark ? '#555' : '#bbb'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NoteCard
            note={item}
            onPress={() => router.push(`/(app)/note/${item.id}`)}
            onDelete={() => deleteNote(item.id)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, dark && styles.sectionHeaderDark]}>
            {section.title}
          </Text>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchNotes}
            tintColor={dark ? '#fff' : '#111'}
          />
        }
        ListEmptyComponent={
          !loading ? (
            q ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, dark && styles.subtextDark]}>
                  No results for "{searchQuery}"
                </Text>
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                  <Text style={[styles.clearBtnText, dark && styles.textDark]}>Clear search</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🎙</Text>
                <Text style={[styles.emptyText, dark && styles.subtextDark]}>
                  No notes yet.{'\n'}Tap Record to capture your first thought.
                </Text>
              </View>
            )
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  containerDark: { backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#aaa', marginTop: 2 },
  textDark: { color: '#fff' },
  subtextDark: { color: '#555' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ebebeb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchRowDark: { backgroundColor: '#1a1a1a' },
  searchInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 6,
    paddingTop: 4,
    textTransform: 'uppercase',
  },
  sectionHeaderDark: { color: '#444' },
  list: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: '#aaa', textAlign: 'center', lineHeight: 22 },
  clearBtn: { marginTop: 4 },
  clearBtnText: { fontSize: 14, fontWeight: '600', color: '#111' },
});
