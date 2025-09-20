import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // Allow access from any IP (mobile devices)
    port: 8080,
    // Allow ngrok and other tunnel hosts
    allowedHosts: [
      'localhost',
      '.ngrok.io',
      '.ngrok-free.app',
      '.ngrok.app'
    ],
    // Enable HTTPS for mobile camera access in development
    https: process.env.HTTPS === 'true' || mode === 'production' ? {
      key: undefined,
      cert: undefined,
    } : false,
    // Fix WebSocket connection issues
    hmr: {
      port: 8080,
    },
  },
  build: {
    // PWA optimizations
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
            if (id.includes('@radix-ui')) {
              return 'ui';
            }
            if (id.includes('react-router')) {
              return 'router';
            }
            return 'vendor';
          }
        }
      }
    },
    // Service worker compatibility
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
