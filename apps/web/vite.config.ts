import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The workspace runs from apps/web; keep the documented root .env.example/.env usable.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? "/Barkoul.ma/" : "/",
  build: { outDir: "dist", sourcemap: true }
});
