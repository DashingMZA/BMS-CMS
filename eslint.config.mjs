// ESLint flat config.
//
// eslint-config-next 16 ships native flat configs, so they are spread in
// directly — the old FlatCompat wrapper around them throws a circular-JSON
// error and no longer works.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // server.js must stay CommonJS: hosts like Passenger require() it as the
    // application entry point, and the migration scripts are .cjs for the same
    // reason. require() in these files is intentional, not a mistake.
    files: ["server.js", "scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // `const { id: _id, ...rest }` is how you drop a key while keeping the
      // rest, and the leading underscore is the convention for "deliberately
      // unused". Without this the pattern reports as dead code, which buries
      // the genuinely unused variables among false positives.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
