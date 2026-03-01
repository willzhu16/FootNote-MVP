import { ScrollView, TouchableOpacity, Text, StyleSheet, useColorScheme } from 'react-native';
import { NoteMode } from '@/types/note';
import { MODE_LABELS } from '@/lib/constants';

const MODES: NoteMode[] = ['default', 'brainstorm', 'script', 'planning'];

interface Props {
  selected: NoteMode;
  onChange: (mode: NoteMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ selected, onChange, disabled }: Props) {
  const dark = useColorScheme() === 'dark';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {MODES.map((mode) => {
        const active = selected === mode;
        return (
          <TouchableOpacity
            key={mode}
            onPress={() => !disabled && onChange(mode)}
            style={[
              styles.pill,
              dark ? styles.pillDark : styles.pillLight,
              active && (dark ? styles.activeDark : styles.activeLight),
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.label,
                dark ? styles.labelDark : styles.labelLight,
                active && styles.labelActive,
              ]}
            >
              {MODE_LABELS[mode]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillLight: { borderColor: '#e0e0e0', backgroundColor: 'transparent' },
  pillDark: { borderColor: '#333', backgroundColor: 'transparent' },
  activeLight: { backgroundColor: '#111', borderColor: '#111' },
  activeDark: { backgroundColor: '#fff', borderColor: '#fff' },
  label: { fontSize: 13, fontWeight: '500' },
  labelLight: { color: '#555' },
  labelDark: { color: '#888' },
  labelActive: { color: '#fff' },
});
