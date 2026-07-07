/* Babel config — path aliases mirror tsconfig.json so runtime + TS agree. */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@api': './src/api',
            '@screens': './src/screens',
            '@components': './src/components',
            '@theme': './src/theme',
            '@store': './src/store',
            '@navigation': './src/navigation',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@config': './src/config',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      // react-native-reanimated/plugin is added when we install reanimated.
    ],
  }
}
