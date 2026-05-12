/**
 * SmartAI BMS Field — app entry.
 *
 * Sprint M-0 (Foundation): navigation shell + login screen. Real
 * functionality (quick-create, voice, Yoco, offline sync) ships in
 * later sprints — see docs/RELEASE_PROCESS.md for the roadmap.
 */
import { StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import RootNavigator from '@navigation/RootNavigator'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
