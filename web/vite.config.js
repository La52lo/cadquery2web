import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
	cors: true,
	hmr: false,
	proxy: {
      "/api": {
        target: "http://node:3000",
        changeOrigin: true,
        secure: false,
		rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});