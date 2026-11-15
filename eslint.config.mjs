import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Nested git worktrees. These are whole checkouts of this repo living
      // inside it, so without this every `npm run lint` lints the project
      // several times over and reports another checkout's files as ours.
      ".claude/**",
      // Vendored MediaPipe runtime for the gesture mode, put there by
      // `npm run vision:assets`. It is minified third-party glue — linting it
      // buries every real finding under ~45,000 warnings about its internals.
      "public/vision/**",
      // Retired local preview artifacts; the maintained route is app/table/.
      "tools/p4/**",
    ],
  },
];

export default eslintConfig;
