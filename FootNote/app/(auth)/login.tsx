import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, devBypass } = useAuth();
  const { isDark: dark } = useTheme();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, dark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={[styles.logo, dark && styles.textDark]}>FootNote</Text>
        <Text style={[styles.tagline, dark && styles.subtextDark]}>Think while you walk.</Text>

        <TextInput
          style={[styles.input, dark && styles.inputDark]}
          placeholder="Email"
          placeholderTextColor={dark ? '#666' : '#999'}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={[styles.input, dark && styles.inputDark]}
          placeholder="Password"
          placeholderTextColor={dark ? '#666' : '#999'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={[styles.linkText, dark && styles.subtextDark]}>
              No account? <Text style={styles.linkHighlight}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </Link>

        {process.env.EXPO_PUBLIC_DEV_BYPASS_ENABLED === 'true' && (
          <TouchableOpacity style={styles.devButton} onPress={devBypass}>
            <Text style={styles.devText}>⚙ Dev bypass (testing only)</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerDark: { backgroundColor: '#111' },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
    letterSpacing: -1,
  },
  tagline: { fontSize: 15, color: '#888', marginBottom: 40 },
  textDark: { color: '#fff' },
  subtextDark: { color: '#888' },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  inputDark: {
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  errorText: { color: '#e53e3e', fontSize: 14, marginBottom: 12 },
  button: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { marginTop: 20, alignItems: 'center' },
  linkText: { fontSize: 14, color: '#555' },
  linkHighlight: { color: '#111', fontWeight: '600' },
  devButton: { marginTop: 40, alignItems: 'center' },
  devText: { fontSize: 11, color: '#ccc' },
});
