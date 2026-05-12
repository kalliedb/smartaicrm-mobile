/**
 * Home / Today dashboard — placeholder for sprint M-0.
 *
 * Sprint M-3 fills this in with: today's revenue, KPI tiles (Jobs Done,
 * Outstanding, Today's Schedule), and the four primary action buttons
 * (New Lead, New Quote, New Invoice, Voice).
 *
 * For now: just a logged-in confirmation + sign out so we can verify the
 * full auth round-trip end-to-end.
 */
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@store/auth'
import { colors, spacing, radii, typography } from '@theme/index'

export default function HomeScreen() {
  const { user, logout } = useAuth()

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ])
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.eyebrow}>Today</Text>
        <Text style={styles.h1}>R0,00 captured</Text>
        <Text style={styles.sub}>
          Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. The Today screen lights up in sprint M-3 with your jobs, schedule and quick actions.
        </Text>

        <View style={styles.placeholderTiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Jobs done</Text>
            <Text style={styles.tileValue}>—</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Outstanding</Text>
            <Text style={styles.tileValue}>—</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Schedule</Text>
            <Text style={styles.tileValue}>—</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  eyebrow: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  h1: { ...typography.h1, color: colors.text, marginTop: 4 },
  sub: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xl },
  placeholderTiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xxxl },
  tile: {
    flex: 1, backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: radii.lg,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.md,
  },
  tileLabel: { ...typography.micro, color: colors.textMuted, marginBottom: spacing.sm },
  tileValue: { ...typography.h3, color: colors.text },
  signOutBtn: {
    marginTop: 'auto', alignSelf: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
  },
  signOutText: { ...typography.bodyB, color: colors.danger },
})
