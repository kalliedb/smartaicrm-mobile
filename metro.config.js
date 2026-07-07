const { getDefaultConfig } = require('expo/metro-config')

// Expo-flavoured Metro config. Extend here if we ever need SVG transformer,
// custom asset extensions, etc.
const config = getDefaultConfig(__dirname)

module.exports = config
