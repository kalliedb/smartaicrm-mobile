import { registerRootComponent } from 'expo'
import App from './App'

// Expo bare-workflow entry. registerRootComponent reads the app name from
// expo.name in app.json and calls AppRegistry.registerComponent internally.
registerRootComponent(App)
