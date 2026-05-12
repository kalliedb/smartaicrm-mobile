/**
 * SmartAI BMS Field — app entry.
 *
 * Sprint M-0 (Foundation): navigation shell + login screen. Real
 * functionality (quick-create, voice, Yoco, offline sync) ships in
 * later sprints — see docs/RELEASE_PROCESS.md for the roadmap.
 *
 * react-native-gesture-handler intentionally not included — the latest
 * version requires RN 0.76+, and we don't need swipe gestures yet.
 * Re-introduce pinned to 2.18.1 when we add drawer / swipe affordances.
 */
import { StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RootNavigator from '@navigation/RootNavigator'

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <RootNavigator />
    </SafeAreaProvider>
  )
}
