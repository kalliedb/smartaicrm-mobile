/**
 * Aivera Field — app entry.
 *
 * Sprint M-0 shipped the auth shell. Sprint FIELD-0.5 migrated to Expo
 * bare-workflow — `npx expo prebuild` generates android/ and ios/ from
 * app.config.js at build time. The native projects are NOT committed.
 *
 * See docs/RELEASE_PROCESS.md for the roadmap.
 */
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import RootNavigator from '@navigation/RootNavigator'

// Keep the splash on-screen while providers initialise. Wrapped in a catch
// so a first-launch race (no splash controller yet) never breaks the app.
SplashScreen.preventAutoHideAsync().catch(() => { /* first-launch tolerant */ })

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => { /* already hidden */ })
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SafeAreaProvider>
  )
}
