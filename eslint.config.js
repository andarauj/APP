// Flat config — required by ESLint 9, which no longer reads .eslintrc.
//
// The repo had eslint and eslint-config-expo installed but no config file at
// all, so `npm run lint` had never actually run against this code.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'android/**',
      'ios/**',
      'assets/data/**',
    ],
  },
];
