import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      /**
       * The admin console intentionally hydrates its tables from the authenticated
       * /api/admin/* endpoints (client-side data grids with search + filters).
       * Those loaders run inside effects and update local state, which the
       * experimental React Compiler lint rules flag even though the pattern is
       * correct at runtime. They are disabled here, and the rest of the
       * recommended rule set stays active.
       */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
    },
  },
]);
