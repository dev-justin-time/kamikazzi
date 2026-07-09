// ESLint 9 flat config for kamakazii_3d_aero_comand/
//
// Mirrors the pattern from kamakazii_studio3D/eslint.config.mjs:
//   - Forbids raw `console.*` usage in favour of the `dbg.*` convention
//     (gated by window.DEBUG via shared/dbg.js).
//   - Keeps the codebase consistent across the 3 apps: aero command,
//     studio 3D, vector strike.
//
// Files that intentionally log to stdout (dbg.js, error-logger.js) are
// allowed via the per-line `// eslint-disable-next-line` directives on
// each raw console call — not via ignore patterns, so future raw
// console.* additions stay visible in `eslint .` output.

export default [
  {
    files: ['**/*.js'],
    ignores: [
      '**/node_modules/**',
      'assets/**',
      '_codemod_*.js',         // one-shot AST migration scripts
      '**/_codemod_*.js',
      '_patch_*.js',
      '**/_patch_*.js',
      'dist/**',
      'build/**',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        TextDecoder: 'readonly',
        WebSocket: 'readonly',
        requestAnimationFrame: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        CustomEvent: 'readonly',
        localStorage: 'readonly',
        prompt: 'readonly',
        screen: 'readonly',
        // Puter globals
        puter: 'readonly',
        // Three.js often pulls in extras
        THREE: 'readonly',
        CONFIG: 'readonly',
        // Three.js / game-loop hooks
        Stats: 'readonly',
        // Tailwind compile-time inject
      },
    },
    rules: {
      // ── Bug-class guards ──────────────────────────────────────────
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-undef': 'warn',
      // ── Project conventions ──────────────────────────────────────
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'console',
              message:
                "Use the `dbg.*` API (see game/dbg.js, which re-exports shared/dbg.js) instead of raw console.* — it's gated by window.DEBUG and respects the project convention.",
            },
          ],
        },
      ],
    },
  },
];
