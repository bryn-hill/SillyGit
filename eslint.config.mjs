// Lints the React renderer against the Rules of React. eslint-plugin-react-hooks'
// recommended preset includes the React Compiler rules (purity, refs,
// set-state-in-effect, immutability, ...), so code that passes is safe to
// memoise automatically. TypeScript 7 has no JS API for typescript-eslint, so
// files are parsed by Babel with its TypeScript and JSX syntax plugins (no
// type information, which none of these rules need).
import babelParser from '@babel/eslint-parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript', 'jsx'] }
        }
      }
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules }
  }
]
