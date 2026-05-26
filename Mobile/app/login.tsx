import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import Constants from 'expo-constants';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/lib/auth/AuthContext';
import { JWFTheme } from '@/constants/theme';

const APP_VERSION = Constants.expoConfig?.version ?? '';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loginOrEmail, setLoginOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!loginOrEmail.trim() || !password) {
      Alert.alert('Faltan datos', 'Ingresa tu usuario y contrasena');
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ loginOrEmail: loginOrEmail.trim(), password });
    } catch (err) {
      let msg = 'No se pudo iniciar sesion. Revisa la conexion.';
      if (axios.isAxiosError(err) && err.response?.data) {
        msg = (err.response.data as { message?: string }).message ?? 'No se pudo iniciar sesion';
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // KAV con behavior='height' en Android achica el view total cuando aparece
    // el teclado, dejando que el ScrollView interno se vuelva scrolleable y
    // muestre el input enfocado. En iOS 'padding' agrega padding bottom igual
    // a la altura del teclado. SafeAreaView garantiza que el form respete
    // gesture bar Android y notch iOS.
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.title}>JWF Mobile</Text>
            <Text style={styles.subtitle}>Inicia sesion con tu cuenta del ERP</Text>

            <Text style={styles.label}>Usuario o email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={loginOrEmail}
              onChangeText={setLoginOrEmail}
              editable={!submitting}
              returnKeyType="next"
            />

            <Text style={styles.label}>Contrasena</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!submitting}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                hitSlop={8}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={JWFTheme.color.textMuted}
                />
              </Pressable>
            </View>

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={submitting}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{submitting ? 'Ingresando…' : 'Entrar'}</Text>
            </TouchableOpacity>
          </View>
          {APP_VERSION ? <Text style={styles.version}>v{APP_VERSION}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.xl,
    padding: 24,
    ...JWFTheme.shadow.md,
  },
  title: {
    fontSize: 28,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
    marginBottom: 4,
  },
  subtitle: { fontSize: 14, color: JWFTheme.color.textMuted, marginBottom: 16 },
  label: { fontSize: 13, color: JWFTheme.color.textSecondary, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    borderRadius: JWFTheme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: JWFTheme.color.bgInput,
    color: JWFTheme.color.textPrimary,
  },
  passwordWrapper: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeButton: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: JWFTheme.color.textInverse, fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
  version: {
    marginTop: 24,
    alignSelf: 'center',
    fontSize: 12,
    color: JWFTheme.color.textMuted,
  },
});
