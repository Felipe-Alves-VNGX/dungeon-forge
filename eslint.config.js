export default [
  {
    ignores: ['node_modules/', 'dist/', '.git/'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random is banned. Use rng.js (makeRng/deriveRng) instead — see SPEC.md §5.1.',
        },
      ],
    },
  },
];
