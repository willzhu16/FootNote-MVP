import { TouchableOpacity, View, Text, StyleSheet, useColorScheme } from 'react-native';
import { VoiceNote } from '@/types/note';
import { MODE_LABELS } from '@/lib/constants';

interface Props {
  note: VoiceNote;
  onPress: () => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function NoteCard({ note, onPress }: Props) {
  const dark = useColorScheme() === 'dark';
  const bullets = note.structured_content?.bullets ?? [];
  const preview = bullets.slice(0, 2);
  const title = note.title ?? note.raw_transcript.slice(0, 60) + (note.raw_transcript.length > 60 ? '…' : '');

  return (
    <TouchableOpacity
      style={[styles.card, dark && styles.cardDark]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={[styles.title, dark && styles.textDark]} numberOfLines={1}>
          {title || 'Untitled note'}
        </Text>
        <View style={[styles.badge, dark && styles.badgeDark]}>
          <Text style={[styles.badgeText, dark && styles.badgeTextDark]}>
            {MODE_LABELS[note.mode] ?? 'Default'}
          </Text>
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
});
