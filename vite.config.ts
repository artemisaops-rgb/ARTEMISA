/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
      "@contexts": fileURLToPath(new URL("./src/contexts", import.meta.url)),
      "@helpers": fileURLToPath(new URL("./src/helpers", import.meta.url)),
      "@hooks": fileURLToPath(new URL("./src/hooks", import.meta.url)),
      "@lib": fileURLToPath(new URL("./src/lib", import.meta.url)),
      "@pages": fileURLToPath(new URL("./src/pages", import.meta.url)),
      "@services": fileURLToPath(new URL("./src/services", import.meta.url))
    }
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    target: "es2018"
  }
});
