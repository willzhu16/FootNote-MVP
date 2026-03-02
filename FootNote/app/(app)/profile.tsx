import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useNotes } from '@/hooks/useNotes';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'light' },
  { label: 'System', value: 'system' },
  { label: 'Dark', value: 'dark' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark: dark, theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { notes } = useNotes();

  const initials = (user?.email?.[0] ?? '?').toUpperCase();

  const FREE_LIMIT = 5;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthCount = notes.filter((n) => new Date(n.created_at) >= monthStart).length;
  const usagePct = Math.min(thisMonthCount / FREE_LIMIT, 1);

  return (
    <ScrollView
      style={[styles.container, dark && styles.containerDark]}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Nav */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={dark ? '#fff' : '#111'} />
          <Text style={[styles.backText, dark && styles.textDark]}>Notes</Text>
        </TouchableOpacity>
      </View>

      {/* Avatar + email */}
      <View style={styles.profileSection}>
        <View style={[styles.avatar, dark && styles.avatarDark]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={[styles.email, dark && styles.textDark]}>{user?.email}</Text>
      </View>

      {/* Appearance */}
      <View style={[styles.card, dark && styles.cardDark]}>
        <Text style={[styles.sectionLabel, dark && styles.subtextDark]}>APPEARANCE</Text>
        <View style={styles.chipRow}>
          {THEME_OPTIONS.map(({ label, value }) => {
            const active = theme === value;
            return (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chip,
                  active ? styles.chipActive : (dark ? styles.chipDark : null),
                ]}
                onPress={() => setTheme(value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.chipText,
                  active ? styles.chipTextActive : (dark ? styles.chipTextDark : null),
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Subscription */}
      <View style={[styles.card, dark && styles.cardDark]}>
        <Text style={[styles.sectionLabel, dark && styles.subtextDark]}>SUBSCRIPTION</Text>
        <View style={styles.subRow}>
          <View style={styles.subLeft}>
            <Text style={[styles.planLabel, dark && styles.textDark]}>Free Plan</Text>
            <Text style={[styles.planSub, dark && styles.subtextDark]}>
              {thisMonthCount} of {FREE_LIMIT} notes this month
            </Text>
            <View style={[styles.usageBar, dark && styles.usageBarDark]}>
              <View
                style={[
                  styles.usageFill,
                  { width: `${usagePct * 100}%` },
                  usagePct >= 1 && styles.usageFillFull,
                ]}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.upgradeBtn} disabled activeOpacity={1}>
            <Text style={styles.upgradeBtnText}>Upgrade</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.signOutBtn, dark && styles.signOutBtnDark]}
        onPress={() =>
          Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ])
        }
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={18} color="#e53e3e" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  containerDark: { backgroundColor: '#0d0d0d' },
  navRow: { paddingHorizontal: 20, marginBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 16, color: '#111', fontWeight: '500' },
  textDark: { color: '#fff' },
  subtextDark: { color: '#666' },

  profileSection: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#111',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarDark: { backgroundColor: '#333' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  email: { fontSize: 15, color: '#444', fontWeight: '500' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardDark: { backgroundColor: '#1a1a1a', shadowOpacity: 0 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  chipDark: { borderColor: '#333' },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  chipTextDark: { color: '#888' },
  chipTextActive: { color: '#fff' },

  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  subLeft: { flex: 1 },
  planLabel: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 2 },
  planSub: { fontSize: 12, color: '#aaa' },
  usageBar: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  usageBarDark: { backgroundColor: '#333' },
  usageFill: { height: '100%', backgroundColor: '#111', borderRadius: 2 },
  usageFillFull: { backgroundColor: '#e53e3e' },
  upgradeBtn: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    opacity: 0.7,
  },
  upgradeBtnText: { fontSize: 12, fontWeight: '600', color: '#555' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 4,
    borderWidth: 1, borderColor: '#fce8e8',
    borderRadius: 14, paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  signOutBtnDark: { borderColor: '#3d1a1a' },
  signOutText: { fontSize: 14, fontWeight: '600', color: '#e53e3e' },
});
