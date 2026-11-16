import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const projectId = env.VITE_FIREBASE_PROJECT_ID || "capgeminidemo2";
  const emulatorHost = env.VITE_FUNCTIONS_EMULATOR_HOST || "http://127.0.0.1:5001";

  return {
    plugins: [react()],
    server: {
      proxy: {
        // VITE_API_MODE=live → /api/* → Functions emulator (Express keeps the /api prefix).
        "/api": {
          target: emulatorHost,
          changeOrigin: true,
          rewrite: (path) => `/${projectId}/us-central1/api${path}`,
        },
      },
    },
  };
});
