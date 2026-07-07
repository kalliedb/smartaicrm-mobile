/**
 * RootNavigator — gates between the Auth stack and the App stack based on
 * whether we have stored credentials.
 *
 * On launch:
 *   1. useAuth.boot() reads the keystore (bootLoading=true).
 *   2. Spinner renders while we wait.
 *   3. Token present → App stack (CasesList → CaseDetail); else Login.
 *
 * FIELD-2 replaced the placeholder Home screen with CasesList/CaseDetail.
 * Future sprints add ChatScreen, offline-queue banner, and deep-link
 * handling.
 */
import { useEffect, useRef } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '@store/auth'
import LoginScreen from '@screens/Auth/LoginScreen'
import CasesListScreen from '@screens/Cases/CasesListScreen'
import CaseDetailScreen from '@screens/Cases/CaseDetailScreen'
import ChatScreen from '@screens/Cases/ChatScreen'
import { useRegisterForPush } from '@hooks/useRegisterForPush'
import { useNotificationTapDeepLink } from '@hooks/useNotificationTapDeepLink'
import { colors } from '@theme/index'

export type RootStackParamList = {
  Login: undefined
  Cases: undefined
  CaseDetail: { caseId: string }
  Chat: { caseId: string; caseNumber?: string }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  const { user, bootLoading, boot } = useAuth()
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList> | null>(null)

  useEffect(() => {
    void boot()
  }, [boot])

  // Push notifications — only after login (device has a user to associate
  // the Expo token with). The hook itself is a no-op when disabled.
  useRegisterForPush(Boolean(user))

  // Handle notification taps → deep-link into the right case screen.
  useNotificationTapDeepLink(navigationRef)

  if (bootLoading) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
        }}
      >
        {user ? (
          <>
            <Stack.Screen
              name="Cases"
              component={CasesListScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="CaseDetail"
              component={CaseDetailScreen}
              options={{ title: 'Case', headerBackTitle: 'Cases' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: 'Chat', headerBackTitle: 'Case' }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
})
