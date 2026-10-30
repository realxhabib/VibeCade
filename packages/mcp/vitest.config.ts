import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const web = fileURLToPath(new URL("../../apps/web/src", import.meta.url));
const sdk = fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: `${web}/` }, { find: /^vibecade-sdk$/, replacement: sdk }] },
  test: { environment: "node", include: ["test/**/*.test.ts"], testTimeout: 20_000 },
});
