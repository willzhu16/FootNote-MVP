import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { StructuredContent, NoteMode } from '@/types/note';

const SECTION_CONFIG: Record<
  string,
  { key: keyof StructuredContent; label: string; icon: string }[]
> = {
  default: [
    { key: 'bullets', label: 'Key Points', icon: '•' },
    { key: 'action_items', label: 'Action Items', icon: '✓' },
    { key: 'questions', label: 'Questions', icon: '?' },
    { key: 'themes', label: 'Themes', icon: '#' },
  ],
  brainstorm: [
    { key: 'bullets', label: 'Ideas', icon: '💡' },
    { key: 'action_items', label: 'Constraints', icon: '⚡' },
    { key: 'questions', label: 'Follow-up Angles', icon: '→' },
    { key: 'themes', label: 'Open Questions', icon: '?' },
  ],
  script: [
    { key: 'bullets', label: 'Hook Ideas', icon: '🎣' },
    { key: 'action_items', label: 'Core Thesis', icon: '💬' },
    { key: 'questions', label: 'Outline Beats', icon: '≡' },
    { key: 'themes', label: 'CTA / Close', icon: '→' },
  ],
  planning: [
    { key: 'bullets', label: 'Goals', icon: '🎯' },
    { key: 'action_items', label: 'Steps', icon: '✓' },
    { key: 'questions', label: 'Risks', icon: '⚠' },
    { key: 'themes', label: 'Timeline', icon: '📅' },
  ],
};

interface Props {
  structured: StructuredContent;
  mode: NoteMode;
  isStructuring?: boolean;
  editable?: boolean;
  onItemChange?: (key: keyof StructuredContent, index: number, value: string) => void;
}

export function StructuredNote({ structured, mode, isStructuring, editable, onItemChange }: Props) {
  const { isDark: dark } = useTheme();
  const sections = SECTION_CONFIG[mode] ?? SECTION_CONFIG.default;
  const hasContent = sections.some((s) => (structured[s.key] ?? []).length > 0);

  if (!hasContent && !isStructuring) return null;

  return (
    <View style={[styles.container, dark && styles.containerDark]}>
      {isStructuring && !hasContent && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={dark ? '#fff' : '#111'} />
          <Text style={[styles.loadingText, dark && styles.subtextDark]}>Organizing…</Text>
        </View>
      )}
      {sections.map(({ key, label, icon }) => {
        const items = structured[key] ?? [];
        if (items.length === 0) return null;
        return (
          <View key={key} style={styles.section}>
            <Text style={[styles.sectionLabel, dark && styles.subtextDark]}>
              {icon}  {label}
            </Text>
            {items.map((item, i) => (
              editable && onItemChange ? (
                <TextInput
                  key={i}
                  style={[styles.item, styles.itemInput, dark && styles.itemDark]}
                  value={item}
                  onChangeText={(v) => onItemChange(key, i, v)}
                  multiline
                  scrollEnabled={false}
                />
              ) : (
                <Text key={i} style={[styles.item, dark && styles.itemDark]}>
                  {item}
                </Text>
              )
            ))}
          </View>
        );
      })}
      {isStructuring && hasContent && (
        <ActivityIndicator size="small" color={dark ? '#555' : '#ccc'} style={{ marginTop: 8 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f7ff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
  },
  containerDark: { backgroundColor: '#0d1a2a' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: '#888' },
  subtextDark: { color: '#666' },
  section: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  item: { fontSize: 14, color: '#222', marginBottom: 3, lineHeight: 20 },
  itemDark: { color: '#ccc' },
  itemInput: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc', paddingVertical: 2 },
});
