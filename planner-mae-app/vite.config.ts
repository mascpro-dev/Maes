import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/planner-mae/",
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    outDir: "dist",
  },
  // O Planner Mãe NÃO tem mais PWA próprio. O app instalável é o Conta Mãe completo
  // (manifest e service worker estão na raiz). Em /planner-mae/sw.js mantemos um SW
  // de auto-destruição para limpar instalações antigas que registraram o SW do planner.
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
