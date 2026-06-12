// @ts-check

import eslint from "@eslint/js";
import perfectionist from "eslint-plugin-perfectionist";
import unicornPlugin from "eslint-plugin-unicorn";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],

  extends: [
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    unicornPlugin.configs.recommended,
    reactHooks.configs.flat.recommended,
    jsxA11y.flatConfigs.recommended,
    eslintReact.configs["recommended-typescript"],
  ],

  plugins: {
    perfectionist,
  },

  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
      ecmaFeatures: {
        jsx: true,
      },
    },
    globals: {
      ...globals.browser,
    },
  },

  rules: {
    "no-unused-vars": "off",
    "unicorn/no-array-callback-reference": "off",
    "unicorn/no-useless-undefined": [
      "error",
      {
        checkArrowFunctionBody: false,
      },
    ],
    "unicorn/prefer-query-selector": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/prevent-abbreviations": [
      "error",
      {
        ignore: [
          /args/i,
          /ctx/i,
          /db/i,
          /deps/i,
          /dev/i,
          /env/i,
          /docs/i,
          /param/i,
          /prev/i,
          /props/i,
          /ref/i,
        ],
      },
    ],
    "unicorn/filename-case": [
      "error",
      {
        cases: {
          kebabCase: true,
        },
      },
    ],
    "perfectionist/sort-imports": [
      "error",
      {
        internalPattern: [
          // default
          "^~/.+",
          // internal path alias (see package.json `imports`)
          "^#.+",
        ],
      },
    ],
  },
  ignores: ["dist/**", "node_modules/**"],
},
{
  // The frontend talks to the backend over HTTP only. Wire contracts it may
  // share live in #shared/* (public-state.ts, error-response.ts).
  files: ["src/frontend/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // Not `group`: its gitignore-style matching reads a leading "#"
            // as a comment and silently drops the pattern.
            regex: "^#backend/",
            message:
              "The frontend must not import backend modules; shared wire contracts belong in #shared/*.",
          },
        ],
      },
    ],
  },
});
