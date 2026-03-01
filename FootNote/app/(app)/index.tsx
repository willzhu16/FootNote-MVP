import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotes } from '@/hooks/useNotes';
import { NoteCard } from '@/components/NoteCard';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function NotesListScreen() {
  const { notes, loading, fetchNotes } = useNotes();
  const { signOut, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';

  return (
    <View style={[styles.container, dark && styles.containerDark, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, dark && styles.textDark]}>FootNote</Text>
          <Text style={[styles.subtitle, dark && styles.subtextDark]}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Ionicons name="log-out-outline" size={22} color={dark ? '#666' : '#aaa'} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NoteCard note={item} onPress={() => router.push(`/(app)/note/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchNotes}
            tintColor={dark ? '#fff' : '#111'}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyIcon]}>🎙</Text>
              <Text style={[styles.emptyText, dark && styles.subtextDark]}>
                No notes yet.{'\n'}Tap Record to capture your first thought.
              </Text>
            </View>
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
  signOutBtn: { padding: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: '#aaa', textAlign: 'center', lineHeight: 22 },
});
