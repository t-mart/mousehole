// @ts-check

import eslint from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import perfectionist from "eslint-plugin-perfectionist";
import unicornPlugin from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    files: ["**/*.{ts,tsx}"],

    plugins: {
      perfectionist,
    },

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: true,
      },
    },

    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      unicornPlugin.configs.recommended,
    ],
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  prettier,
  // rules last to ensure application
  {
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
);
