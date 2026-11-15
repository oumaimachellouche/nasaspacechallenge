import { defineConfig } from "vite";
import { traceAPIPlugin } from "./server/api.mjs";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    traceAPIPlugin(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/cesium/Build/Cesium/Cesium.js", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Workers", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Assets", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Widgets", dest: "cesium" },
      ],
    }),
  ],
  server: { host: "0.0.0.0", port: 5173, strictPort: true, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: { manualChunks: { charts: ["echarts"], motion: ["gsap"] } },
    },
  },
});
