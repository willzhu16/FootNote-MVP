import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ModeSelector } from '@/components/ModeSelector';
import { RecordButton } from '@/components/RecordButton';
import { LiveTranscript } from '@/components/LiveTranscript';
import { StructuredNote } from '@/components/StructuredNote';
import { useGptStructure } from '@/hooks/useGptStructure';
import { useChunkedRecording } from '@/hooks/useChunkedRecording';
import { useNotes } from '@/hooks/useNotes';
import { NoteMode, EMPTY_STRUCTURED_CONTENT } from '@/types/note';
import { pendingAudio } from '@/lib/pendingAudio';

function formatDuration(ms: number) {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const IDLE_PROMPTS = [
  "A problem you're solving",
  'An idea from today',
  "Something you don't want to forget",
  "A decision you're weighing",
  'Notes from a conversation',
  "What's been on your mind",
];

function RecordingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.15, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => { cancelAnimation(opacity); };
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.recordingDot, style]} />;
}

const DEMO_TRANSCRIPT = `Okay so I'm thinking about the landing page for FootNote. The core message needs to be really simple — something like "your thoughts, organized." I think the hero section should have a phone mockup showing the live transcript updating in real time. That's the visual hook.

For the value props I'm thinking three columns: speak freely, get structure, save everything. Each one with a small icon. Keep it minimal, no fluff.

I also want to add a pricing section eventually. Free tier with like five notes a month, then a pro tier for unlimited. Need to figure out what the right price point is — maybe eight dollars a month? Could test both eight and twelve.

One thing I keep coming back to is the onboarding flow. Right now it just drops you into the notes list which is empty and kind of sad. I should add a short walkthrough — maybe just two or three screens showing how it works before the first recording. Or even better, auto-start a demo recording so they can see it in action immediately.

Also need to think about sharing. What if you could share a structured note as a card — like a clean image you could post? That could be a nice growth mechanic. People share their thinking publicly.`;

function WaveformBars({ level, isRecording }: { level: number; isRecording: boolean }) {
  const { isDark: dark } = useTheme();
  const BAR_COUNT = 24;
  return (
    <View style={waveStyles.row}>
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const phase = Math.sin(i * 0.7) * 0.5 + 0.5;
        const h = isRecording ? Math.max(3, (level * 0.7 + phase * 0.3) * 36) : 3;
        return <View key={i} style={[waveStyles.bar, dark && waveStyles.barDark, { height: h }]} />;
      })}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40, paddingHorizontal: 20 },
  bar: { width: 3, borderRadius: 2, backgroundColor: '#e53e3e', opacity: 0.7 },
  barDark: { backgroundColor: '#ff6b6b' },
});

export default function RecordScreen() {
  const [mode, setMode] = useState<NoteMode>('default');
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const { isDark: dark } = useTheme();
  const router = useRouter();

  const chunked = useChunkedRecording();
  const gpt = useGptStructure();
  const { createNote } = useNotes();

  useEffect(() => {
    if (chunked.accumulatedTranscript) {
      gpt.scheduleStructure(chunked.accumulatedTranscript, mode);
    }
  }, [chunked.accumulatedTranscript, mode]);

  const handleToggleRecording = useCallback(async () => {
    if (chunked.isRecording) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSaving(true);
      try {
        const transcript = await chunked.stopRecording();
        const unprocessed = chunked.getUnprocessedUris();

        if (!transcript && unprocessed.length > 0) {
          const note = await createNote({
            raw_transcript: '',
            structured_content: EMPTY_STRUCTURED_CONTENT,
            duration_seconds: Math.floor(chunked.totalDurationMs / 1000),
            mode,
          });
          if (note) {
            pendingAudio.set(note.id, unprocessed);
            chunked.reset();
            gpt.resetStructured();
            router.push(`/(app)/note/${note.id}`);
          }
        } else {
          await gpt.reorganize(transcript, mode);

          const durationSecs = Math.floor(chunked.totalDurationMs / 1000);
          const firstBullet = gpt.structured.bullets[0];
          const title = firstBullet
            ? firstBullet.slice(0, 60)
            : transcript.slice(0, 60) || null;

          const note = await createNote({
            raw_transcript: transcript,
            structured_content: gpt.structured,
            duration_seconds: durationSecs,
            mode,
            title: title ?? undefined,
          });

          if (note) {
            chunked.reset();
            gpt.resetStructured();
            router.push(`/(app)/note/${note.id}`);
          }
        }
      } catch {
        Alert.alert('Error', 'Failed to save note. Please try again.');
      } finally {
        setSaving(false);
      }
    } else {
      chunked.reset();
      gpt.resetStructured();
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await chunked.startRecording();
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Failed to start recording');
      }
    }
  }, [chunked, gpt, mode, createNote, router]);

  const handleDemo = useCallback(async () => {
    chunked.reset();
    gpt.resetStructured();
    chunked.injectTranscript(DEMO_TRANSCRIPT);
    await gpt.reorganize(DEMO_TRANSCRIPT, mode);
  }, [chunked, gpt, mode]);

  const hasTranscript = chunked.accumulatedTranscript.length > 0;
  const wordCount = hasTranscript
    ? chunked.accumulatedTranscript.trim().split(/\s+/).length
    : 0;
  const isIdle = !chunked.isRecording && !hasTranscript && !gpt.isStructuring;

  const [promptIdx, setPromptIdx] = useState(
    () => Math.floor(Math.random() * IDLE_PROMPTS.length)
  );
  useEffect(() => {
    if (!isIdle) return;
    const t = setInterval(() => setPromptIdx((i) => (i + 1) % IDLE_PROMPTS.length), 4000);
    return () => clearInterval(t);
  }, [isIdle]);

  // Animate between idle and active states
  const activeProgress = useSharedValue(isIdle ? 0 : 1);
  useEffect(() => {
    activeProgress.value = withTiming(isIdle ? 0 : 1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [isIdle]);

  const idleAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - activeProgress.value,
    transform: [{ translateY: -12 * activeProgress.value }],
  }));

  const activeAnimStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
    transform: [{ translateY: 14 * (1 - activeProgress.value) }],
  }));

  return (
    <View style={[styles.container, dark && styles.containerDark]}>
      {/* Top bar — header + mode selector, always visible */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.headingWithDot}>
              {chunked.isRecording && <RecordingDot />}
              <Text style={[styles.heading, dark && styles.textDark]}>
                {chunked.isRecording ? 'Recording…' : saving ? 'Saving…' : 'Ready'}
              </Text>
            </View>
            {chunked.isRecording && chunked.pendingChunks > 0 && (
              <Text style={[styles.pendingHint, dark && styles.subtextDark]}>
                {chunked.pendingChunks} chunk{chunked.pendingChunks > 1 ? 's' : ''} buffered
              </Text>
            )}
          </View>
          {chunked.isRecording && (
            <Text style={styles.duration}>{formatDuration(chunked.totalDurationMs)}</Text>
          )}
        </View>
        <ModeSelector selected={mode} onChange={setMode} disabled={chunked.isRecording} />
      </View>

      {/* Main content area — idle and active content overlap here */}
      <View style={styles.mainArea}>

        {/* Idle overlay — centered rotating prompt */}
        <Animated.View
          style={[styles.idleOverlay, idleAnimStyle]}
          pointerEvents={isIdle ? 'auto' : 'none'}
        >
          <Text style={[styles.idlePromptText, dark && styles.idlePromptTextDark]}>
            {IDLE_PROMPTS[promptIdx]}
          </Text>
        </Animated.View>

        {/* Active content overlay — waveform, transcript preview, structured note */}
        <Animated.View
          style={[styles.activeOverlay, activeAnimStyle]}
          pointerEvents={isIdle ? 'none' : 'auto'}
        >
          <ScrollView
            contentContainerStyle={styles.activeContent}
            showsVerticalScrollIndicator={false}
          >
            {chunked.isRecording && (
              <WaveformBars level={chunked.audioLevel} isRecording={chunked.isRecording} />
            )}

            {/* Small transcript preview strip */}
            <View style={styles.transcriptPreview}>
              <LiveTranscript
                transcript={chunked.accumulatedTranscript}
                isTranscribing={false}
              />
            </View>
            {wordCount > 0 && (
              <Text style={[styles.wordCount, dark && styles.subtextDark]}>
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </Text>
            )}

            {/* Large structured note — main content area */}
            {(hasTranscript || gpt.isStructuring) && (
              <View style={styles.structuredWrapper}>
                <StructuredNote
                  structured={gpt.structured}
                  mode={mode}
                  isStructuring={gpt.isStructuring}
                />
              </View>
            )}

            {hasTranscript && !chunked.isRecording && !saving && (
              <TouchableOpacity
                style={[styles.reorganizeBtn, dark && styles.reorganizeBtnDark]}
                onPress={() => gpt.reorganize(chunked.accumulatedTranscript, mode)}
                disabled={gpt.isStructuring}
                activeOpacity={0.7}
              >
                <Text style={[styles.reorganizeBtnText, dark && styles.textDark]}>
                  ✦ Reorganize
                </Text>
              </TouchableOpacity>
            )}

            {chunked.error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{chunked.error}</Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Fixed footer — record button */}
      <View style={[styles.recordFooter, dark && styles.recordFooterDark, { paddingBottom: insets.bottom + 12 }]}>
        <RecordButton
          isRecording={chunked.isRecording}
          onPress={handleToggleRecording}
          disabled={saving}
        />
        {!chunked.isRecording && !saving && (
          <Text style={[styles.hint, dark && styles.subtextDark]}>Tap to record</Text>
        )}
        {!chunked.isRecording && !saving && !hasTranscript && (
          <TouchableOpacity
            onPress={handleDemo}
            disabled={gpt.isStructuring}
            style={styles.demoBtn}
          >
            <Text style={[styles.demoText, dark && styles.subtextDark]}>Try demo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  containerDark: { backgroundColor: '#0d0d0d' },

  topBar: { paddingBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  headingWithDot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111', letterSpacing: -0.3 },
  textDark: { color: '#fff' },
  subtextDark: { color: '#666' },
  pendingHint: { fontSize: 11, color: '#aaa', marginTop: 2 },
  duration: { fontSize: 20, fontWeight: '600', color: '#e53e3e', fontVariant: ['tabular-nums'] },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e53e3e' },

  // Main overlay container
  mainArea: { flex: 1 },

  // Idle state — large centered prompt
  idleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  idlePromptText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#c0c0c0',
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  idlePromptTextDark: { color: '#3a3a3a' },

  // Active state — scrollable content
  activeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  activeContent: { gap: 10, paddingTop: 4, paddingBottom: 16 },

  // Small transcript preview strip
  transcriptPreview: { height: 80 },
  wordCount: { fontSize: 11, color: '#aaa', textAlign: 'right', paddingRight: 20 },

  // Large structured note wrapper
  structuredWrapper: { minHeight: 220 },

  reorganizeBtn: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  reorganizeBtnDark: { borderColor: '#333' },
  reorganizeBtnText: { fontSize: 14, fontWeight: '600', color: '#111' },

  errorBanner: {
    marginHorizontal: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { fontSize: 13, color: '#b91c1c' },

  recordFooter: {
    alignItems: 'center',
    paddingTop: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  recordFooterDark: { borderTopColor: '#222' },
  hint: { fontSize: 13, color: '#aaa' },
  demoBtn: {},
  demoText: { fontSize: 12, color: '#bbb', textDecorationLine: 'underline' },
});
