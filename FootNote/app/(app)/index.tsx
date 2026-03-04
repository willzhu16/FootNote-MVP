import { useEffect, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotes } from '@/hooks/useNotes';
import { NoteCard } from '@/components/NoteCard';
import { OnboardingModal } from '@/components/OnboardingModal';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { VoiceNote, NoteMode } from '@/types/note';
import { MODE_LABELS } from '@/lib/constants';

type NoteSection = { title: string; data: VoiceNote[] };

function SkeletonCard({ dark }: { dark: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[skeletonStyles.card, dark && skeletonStyles.cardDark, style]}>
      <View style={[skeletonStyles.line, skeletonStyles.lineTitle, dark && skeletonStyles.lineDark]} />
      <View style={[skeletonStyles.line, skeletonStyles.lineMid, dark && skeletonStyles.lineDark]} />
      <View style={[skeletonStyles.line, skeletonStyles.lineShort, dark && skeletonStyles.lineDark]} />
    </Animated.View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardDark: { backgroundColor: '#1a1a1a', shadowOpacity: 0 },
  line: { height: 12, borderRadius: 6, backgroundColor: '#e8e8e8' },
  lineDark: { backgroundColor: '#2a2a2a' },
  lineTitle: { width: '60%' },
  lineMid: { width: '85%' },
  lineShort: { width: '40%' },
});

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
  const [modeFilter, setModeFilter] = useState<NoteMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const handleDelete = (id: string) => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      deleteNote(pendingDelete.id);
    }
    const timer = setTimeout(() => {
      deleteNote(id);
      setPendingDelete(null);
    }, 3500);
    setPendingDelete({ id, timer });
  };

  const handleUndoDelete = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    setPendingDelete(null);
  };

  const q = searchQuery.trim().toLowerCase();
  const sorted = sortAsc ? [...notes].reverse() : notes;
  const filteredNotes = sorted.filter((n) => {
    if (pendingDelete?.id === n.id) return false;
    const matchesSearch = !q ||
      (n.title ?? '').toLowerCase().includes(q) ||
      n.raw_transcript.toLowerCase().includes(q);
    const matchesMode = !modeFilter || n.mode === modeFilter;
    return matchesSearch && matchesMode;
  });

  const sections = groupByDate(filteredNotes);

  return (
    <View style={[styles.container, dark && styles.containerDark, { paddingTop: insets.top }]}>
      <OnboardingModal />
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.modeChips}
        style={styles.modeChipsRow}
      >
        {([null, 'default', 'brainstorm', 'script', 'planning'] as (NoteMode | null)[]).map((m) => {
          const active = modeFilter === m;
          const label = m === null ? 'All' : MODE_LABELS[m];
          return (
            <TouchableOpacity
              key={m ?? 'all'}
              style={[styles.modeChip, active && styles.modeChipActive, dark && !active && styles.modeChipDark]}
              onPress={() => setModeFilter(active ? null : m)}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive, dark && !active && styles.modeChipTextDark]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {pendingDelete && (
        <View style={[styles.toast, dark && styles.toastDark]}>
          <Text style={[styles.toastText, dark && styles.toastTextDark]}>Note deleted</Text>
          <TouchableOpacity onPress={handleUndoDelete} style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NoteCard
            note={item}
            onPress={() => router.push(`/(app)/note/${item.id}`)}
            onDelete={() => handleDelete(item.id)}
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
          loading ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2].map((i) => <SkeletonCard key={i} dark={dark} />)}
            </View>
          ) : q ? (
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
  modeChipsRow: { maxHeight: 40, marginBottom: 8 },
  modeChips: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  modeChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0',
  },
  modeChipDark: { borderColor: '#333' },
  modeChipActive: { backgroundColor: '#111', borderColor: '#111' },
  modeChipText: { fontSize: 12, fontWeight: '600', color: '#888' },
  modeChipTextDark: { color: '#555' },
  modeChipTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },
  toast: {
    position: 'absolute', bottom: 90, left: 20, right: 20,
    backgroundColor: '#222', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 100,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastDark: { backgroundColor: '#333' },
  toastText: { fontSize: 14, color: '#fff', fontWeight: '500' },
  toastTextDark: { color: '#ddd' },
  undoBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  undoBtnText: { fontSize: 14, fontWeight: '700', color: '#e53e3e' },
  skeletonList: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: '#aaa', textAlign: 'center', lineHeight: 22 },
  clearBtn: { marginTop: 4 },
  clearBtnText: { fontSize: 14, fontWeight: '600', color: '#111' },
});
