/**
 * RootNavigator — gates between the Auth stack and the App stack based on
 * whether we have stored credentials.
 *
 * On launch:
 *   1. useAuth.boot() reads the keystore (bootLoading=true).
 *   2. Spinner renders while we wait.
 *   3. Token present → AppStack; otherwise AuthStack.
 *
 * Future sprints add deep-link handling, biometric re-auth, and a
 * push-notification permission prompt.
 */
import { useEffect } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '@store/auth'
import LoginScreen from '@screens/Auth/LoginScreen'
import HomeScreen from '@screens/Home/HomeScreen'
import { colors } from '@theme/index'

export type RootStackParamList = {
  Login: undefined
  Home: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  const { user, bootLoading, boot } = useAuth()

  useEffect(() => {
    void boot()
  }, [boot])

  if (bootLoading) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
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
