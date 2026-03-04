import { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';

const ONBOARDED_KEY = 'footnote_onboarded_v1';

const SLIDES = [
  {
    emoji: '🎙',
    title: 'Speak freely',
    body: 'Record anything — ideas, decisions, meeting notes. No formatting required.',
  },
  {
    emoji: '✦',
    title: 'AI organizes it',
    body: 'FootNote structures your rambling into bullets, action items, and themes automatically.',
  },
  {
    emoji: '📚',
    title: 'Everything in one place',
    body: 'All your notes, synced and searchable. Switch modes to match your use case.',
  },
];

export function OnboardingModal() {
  const { isDark: dark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  const handleNext = () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      AsyncStorage.setItem(ONBOARDED_KEY, 'true');
      setVisible(false);
    }
  };

  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.sheet, dark && styles.sheetDark]}>
          <Text style={styles.emoji}>{current.emoji}</Text>
          <Text style={[styles.title, dark && styles.titleDark]}>{current.title}</Text>
          <Text style={[styles.body, dark && styles.bodyDark]}>{current.body}</Text>

          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === slide && styles.dotActive, dark && styles.dotDark]}
              />
            ))}
          </View>

          <TouchableOpacity style={[styles.btn, dark && styles.btnDark]} onPress={handleNext} activeOpacity={0.8}>
            <Text style={[styles.btnText, dark && styles.btnTextDark]}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>

          {!isLast && (
            <TouchableOpacity
              onPress={() => { AsyncStorage.setItem(ONBOARDED_KEY, 'true'); setVisible(false); }}
              style={styles.skipBtn}
            >
              <Text style={[styles.skipText, dark && styles.skipTextDark]}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 32, paddingTop: 36, paddingBottom: 48,
    alignItems: 'center', gap: 12,
  },
  sheetDark: { backgroundColor: '#1a1a1a' },
  emoji: { fontSize: 52, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', color: '#111', letterSpacing: -0.4, textAlign: 'center' },
  titleDark: { color: '#fff' },
  body: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, maxWidth: width - 80 },
  bodyDark: { color: '#888' },
  dots: { flexDirection: 'row', gap: 6, marginVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e0e0e0' },
  dotDark: { backgroundColor: '#333' },
  dotActive: { backgroundColor: '#111', width: 18 },
  btn: {
    backgroundColor: '#111', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 40,
    alignSelf: 'stretch', alignItems: 'center', marginTop: 4,
  },
  btnDark: { backgroundColor: '#fff' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnTextDark: { color: '#111' },
  skipBtn: { paddingVertical: 8 },
  skipText: { fontSize: 13, color: '#bbb' },
  skipTextDark: { color: '#555' },
});
