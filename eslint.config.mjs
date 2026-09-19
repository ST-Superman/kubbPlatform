import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-handoff reference bundles (prototype HTML/TSX + support JS) — not app code.
    "design_handoff_*/**",
  ]),
  {
    // Regression guard for the iOS auto-zoom bug (Pass 1, F1): a raw <input>/<textarea>
    // whose only font-size utility is `text-sm` (14px) makes iOS WebKit zoom the page on
    // focus. Use the shared <Input>/<Textarea> (16px on touch, `md:text-sm` from md up),
    // or add `text-base` yourself. `md:text-sm` / `file:text-sm` are fine — the word
    // boundary below only flags a standalone `text-sm`.
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement:matches([name.name='input'], [name.name='textarea']) > JSXAttribute[name.name='className'] > Literal[value=/(^|\\s)text-sm(\\s|$)/]",
          message:
            "Raw <input>/<textarea> must not use `text-sm` alone — 14px triggers iOS focus-zoom. Use the shared <Input>/<Textarea>, or pair it with `text-base` (see src/components/ui/input.tsx).",
        },
      ],
    },
  },
]);

export default eslintConfig;
