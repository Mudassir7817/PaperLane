import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], build:{rollupOptions:{output:{manualChunks(id){if(id.includes('pdfjs-dist'))return 'pdf-renderer';if(id.includes('pdf-lib')||id.includes('@pdf-lib'))return 'pdf-editor';if(id.includes('node_modules'))return 'vendor';}}}} });
