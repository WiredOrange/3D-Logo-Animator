import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: "@wiredorange/3d-logo-animator/react", replacement: local("./src/react/index.tsx") },
    { find: "@wiredorange/3d-logo-animator/engine", replacement: local("./src/engine.ts") },
    { find: "@wiredorange/3d-logo-animator", replacement: local("./src/index.ts") },
    { find: "@", replacement: local("./examples/studio") }
  ] },
  build: {
    outDir: "demo-dist",
    rollupOptions: { input: {
      studio: local("./index.html"),
      vanilla: local("./examples/vanilla/index.html"),
      react: local("./examples/react/index.html")
    } }
  }
});
