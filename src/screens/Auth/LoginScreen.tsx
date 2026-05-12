/**
 * Login screen — Sprint M-0.
 *
 * Single email/password form pointing at the existing /auth/login backend.
 * MFA / OAuth / biometric all come in later sprints (M-1 adds biometric
 * re-auth; M-3 adds device registration). For now: tap email, tap
 * password, tap "Sign in" — straight into Home.
 */
import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@store/auth'
import { colors, spacing, radii, typography, HIT_SLOP_MIN } from '@theme/index'

export default function LoginScreen() {
  const { login, busy, error } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  const submit = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert('Sign in', 'Please enter your email and password.')
      return
    }
    const ok = await login(identifier.trim(), password)
    if (!ok && error) {
      // The store has already set the error message; show it inline + here.
      Alert.alert('Sign in failed', error)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <View style={styles.header}>
            <View style={styles.brandPill}>
              <Text style={styles.brandPillText}>SmartAI BMS Field</Text>
            </View>
            <Text style={styles.h1}>Sign in to get to work.</Text>
            <Text style={styles.sub}>
              Quote, invoice and collect payment — from your phone, on-site.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@company.co.za"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              returnKeyType="next"
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {error && (
              <Text style={styles.errorText} accessibilityRole="alert">
                {error}
              </Text>
            )}

            <TouchableOpacity
              onPress={submit}
              disabled={busy}
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              hitSlop={HIT_SLOP_MIN / 4}
            >
              {busy
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={styles.primaryBtnText}>Sign in</Text>}
            </TouchableOpacity>

            <Text style={styles.footnote}>
              Forgot password? Use the web portal to reset, then come back.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    justifyContent: 'space-between',
  },
  header: { marginTop: spacing.xxl },
  brandPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.lg,
  },
  brandPillText: { ...typography.micro, color: colors.primary, letterSpacing: 0.5 },
  h1: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textMuted },

  form: { marginBottom: spacing.xxxl },
  label: { ...typography.small, color: colors.textMuted, marginBottom: 6 },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    minHeight: 48,
  },
  errorText: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.md,
  },
  primaryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryBtnText: { ...typography.bodyB, color: colors.textInverse },
  footnote: {
    ...typography.small,
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
})
