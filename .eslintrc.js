module.exports = {
  root: true,
  extends: ['@react-native'],
  rules: {
    'react-native/no-inline-styles': 'off',  // we use inline styles for one-offs
    'prettier/prettier': 'off',              // running prettier explicitly, not via eslint
  },
}
