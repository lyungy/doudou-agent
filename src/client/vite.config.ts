import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const clientPort = Number(process.env.VITE_CLIENT_PORT) || 5173;
const serverPort = Number(process.env.VITE_SERVER_PORT) || 3000;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
  server: {
    port: clientPort,
    proxy: {
      "/api": {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/client"),
    emptyOutDir: true,
  },
});
