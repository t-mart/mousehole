// @ts-check

import eslint from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import perfectionist from "eslint-plugin-perfectionist";
import unicornPlugin from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";
import eslintPluginReact from "eslint-plugin-react";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  {
    files: ["**/*.{ts,tsx}"],

    plugins: {
      perfectionist,
      eslintPluginReact,
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

    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      unicornPlugin.configs.recommended,
      eslintReact.configs["recommended-typescript"],
    ],

    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
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
          ignore: [/param/i, /ref/i, /props/i, /args/i, /prev/i, /dev/i, /db/i],
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
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  prettier,
  reactHooks.configs["recommended-latest"],
  jsxA11y.flatConfigs.recommended
);
