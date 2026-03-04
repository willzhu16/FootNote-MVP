import { useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { VoiceNote } from '@/types/note';
import { MODE_LABELS } from '@/lib/constants';
import { pendingAudio } from '@/lib/pendingAudio';

interface Props {
  note: VoiceNote;
  onPress: () => void;
  onDelete?: () => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function NoteCard({ note, onPress, onDelete }: Props) {
  const { isDark: dark } = useTheme();
  const swipeRef = useRef<Swipeable>(null);
  const bullets = note.structured_content?.bullets ?? [];
  const preview = bullets.slice(0, 2);
  const title = note.title ?? note.raw_transcript.slice(0, 60) + (note.raw_transcript.length > 60 ? '…' : '');
  const hasPendingAudio = pendingAudio.has(note.id);

  const card = (
    <TouchableOpacity
      style={[styles.card, dark && styles.cardDark]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={[styles.title, dark && styles.textDark]} numberOfLines={1}>
          {title || 'Untitled note'}
        </Text>
        <View style={styles.badges}>
          {hasPendingAudio && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>⚡</Text>
            </View>
          )}
          <View style={[styles.badge, dark && styles.badgeDark]}>
            <Text style={[styles.badgeText, dark && styles.badgeTextDark]}>
              {MODE_LABELS[note.mode] ?? 'Default'}
            </Text>
          </View>
        </View>
      </View>
      {preview.length > 0 && (
        <View style={styles.bullets}>
          {preview.map((b, i) => (
            <Text key={i} style={[styles.bullet, dark && styles.subtextDark]} numberOfLines={1}>
              · {b}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.footer}>
        <Text style={[styles.meta, dark && styles.subtextDark]}>{formatDate(note.created_at)}</Text>
        {note.duration_seconds > 0 && (
          <Text style={[styles.meta, dark && styles.subtextDark]}>
            {formatDuration(note.duration_seconds)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (!onDelete) return card;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => (
        <TouchableOpacity
          style={[styles.deleteAction, dark && styles.deleteActionDark]}
          onPress={() => { swipeRef.current?.close(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      )}
      overshootRight={false}
    >
      {card}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardDark: { backgroundColor: '#1a1a1a', shadowOpacity: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111', marginRight: 8 },
  textDark: { color: '#fff' },
  subtextDark: { color: '#666' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pendingBadge: {
    backgroundColor: '#fff7e6',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  pendingText: { fontSize: 11 },
  badge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeDark: { backgroundColor: '#2a2a2a' },
  badgeText: { fontSize: 11, color: '#555', fontWeight: '500' },
  badgeTextDark: { color: '#888' },
  bullets: { marginBottom: 8 },
  bullet: { fontSize: 13, color: '#555', marginBottom: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 12, color: '#aaa' },
  deleteAction: {
    backgroundColor: '#e53e3e',
    borderRadius: 16,
    marginBottom: 12,
    marginLeft: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteActionDark: { backgroundColor: '#c53030' },
  deleteText: { fontSize: 11, fontWeight: '600', color: '#fff' },
});
