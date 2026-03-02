import { useEffect, useRef } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface Props {
  transcript: string;
  isTranscribing: boolean;
}

export function LiveTranscript({ transcript, isTranscribing }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const { isDark: dark } = useTheme();

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, dark && styles.containerDark]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {transcript ? (
        <Text style={[styles.transcript, dark && styles.transcriptDark]}>
          {transcript}
          {isTranscribing && <Text style={styles.cursor}>▌</Text>}
        </Text>
      ) : (
        <Text style={[styles.placeholder, dark && styles.placeholderDark]}>
          {isTranscribing ? 'Listening…' : 'Tap record to start speaking'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    backgroundColor: '#f7f7f7',
    marginHorizontal: 16,
  },
  containerDark: { backgroundColor: '#1a1a1a' },
  content: { padding: 16, minHeight: 80 },
  transcript: { fontSize: 16, color: '#222', lineHeight: 24 },
  transcriptDark: { color: '#ddd' },
  cursor: { color: '#888' },
  placeholder: { fontSize: 15, color: '#bbb', fontStyle: 'italic' },
  placeholderDark: { color: '#555' },
});
