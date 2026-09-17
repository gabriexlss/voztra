import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/.venv',
      '**/release',
      '**/test-results',
      '**/.cache'
    ]
  },
  tseslint.configs.recommended,
  { files: ['**/*.mjs'], rules: { '@typescript-eslint/explicit-function-return-type': 'off' } },
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  // Variantes exportadas fazem parte da API oficial dos componentes shadcn.
  {
    files: ['src/renderer/src/components/ui/*.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['buttonVariants', 'badgeVariants', 'tabsListVariants'] }
      ]
    }
  },
  eslintConfigPrettier
)
