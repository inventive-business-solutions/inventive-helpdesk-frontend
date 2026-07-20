import next from "eslint-config-next";
import prettier from "eslint-config-prettier";

// ESLint 9 flat config. eslint-config-next@16 ships a native flat config array, so we
// spread it directly. eslint-config-prettier goes last to switch off any stylistic rules
// that would fight Prettier.
export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...next,
  prettier,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      // eslint-plugin-react-hooks v7 adds React-Compiler-oriented rules that flag working,
      // idiomatic patterns (effect-driven state sync, the latest-ref idiom). Keep them as
      // warnings — surfaced for future cleanup, but they don't fail the build or force risky
      // rewrites of proven effects. Revisit if/when adopting the React Compiler.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Config files must export an anonymous default (Next's phase function, the ESLint array).
    files: ["**/*.config.{js,mjs,ts}"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
];
