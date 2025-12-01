import path from 'node:path';
import { fileURLToPath } from 'node:url';

import globals from 'globals';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { Linter, ESLint } from 'eslint';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({
    baseDirectory: dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

const config: Linter.Config[] = [
    ...compat.extends('eslint:recommended'),
    { ignores: ['build/**/*'] },
    {
        languageOptions: {
            sourceType: 'module',
        },
        rules: {
            'comma-dangle': ['error', 'always-multiline'],
            semi: ['error', 'always'],
            'object-curly-spacing': ['error', 'always'],
        },
    },
    ...compat.extends('plugin:@typescript-eslint/recommended', 'plugin:@typescript-eslint/recommended-requiring-type-checking').map(config => ({ ...config, files: ['**/*.{ts,tsx}'] })),
    {
        files: ['**/*.{ts,tsx}'],
        plugins: { '@typescript-eslint': typescriptEslint as unknown as ESLint.Plugin },
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 5,
            sourceType: 'script',
            parserOptions: { project: './tsconfig.json' },
        },
        rules: {
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/prefer-regexp-exec': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    "args": "all",
                    "argsIgnorePattern": "^_",
                    "caughtErrors": "all",
                    "caughtErrorsIgnorePattern": "^_",
                    "destructuredArrayIgnorePattern": "^_",
                    "varsIgnorePattern": "^_",
                    "ignoreRestSiblings": true,
                },
            ],
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            globals: { ...globals.browser },
        },
    },
];
export default config;
