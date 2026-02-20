import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    // Enable source maps for production debugging (can disable for smaller bundles)
    sourcemap: false,
    // CSS code splitting for smaller initial load
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Dynamic chunk splitting function for better optimization
        manualChunks(id) {
          // React core — cached separately (check first to avoid circular deps)
          if (id.includes('node_modules/react/') || 
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          // Zustand state management
          if (id.includes('node_modules/zustand/')) {
            return 'vendor-zustand';
          }
          // Virtual list for performance
          if (id.includes('node_modules/@tanstack/react-virtual/')) {
            return 'vendor-virtual';
          }
        // Markdown rendering (separate from main vendor to avoid circular deps)
          if (id.includes('node_modules/react-markdown/') ||
              id.includes('node_modules/rehype-') ||
              id.includes('node_modules/remark-')) {
            return 'vendor-markdown';
          }
          // Unified/unist are shared dependencies - keep in main vendor to avoid circular
          // Emoji picker (heavy component - lazy load this)
          if (id.includes('node_modules/emoji-picker-react/')) {
            return 'vendor-emoji';
          }
          // Syntax highlighter (heavy)
          if (id.includes('node_modules/react-syntax-highlighter/')) {
            return 'vendor-syntax';
          }
          // All other node_modules go to vendor
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
          // Voice-related components
          if (id.includes('/stage/Voice') || 
              id.includes('/stage/ScreenShare') || 
              id.includes('/services/voice-client') ||
              id.includes('/components/ui/Spectrogram') ||
              id.includes('/components/ui/AudioVisualizer')) {
            return 'chunk-voice';
          }
          // Settings and admin panels
          if (id.includes('/AppSettings') || 
              id.includes('/MFASetup') || 
              id.includes('/PasswordReset') || 
              id.includes('/ModerationPanel') || 
              id.includes('/WebhookSettings') || 
              id.includes('/WordFilters') ||
              id.includes('/UserReport')) {
            return 'chunk-settings';
          }
          // Modal components
          if (id.includes('/SearchModal') || 
              id.includes('/ServerDiscovery') || 
              id.includes('/UserProfile') ||
              id.includes('/ui/ContextMenu') ||
              id.includes('/ui/ConnectionStatus')) {
            return 'chunk-modals';
          }
          // Auth components
          if (id.includes('/auth/') || id.includes('/stores/AuthContext')) {
            return 'chunk-auth';
          }
          // UI components
          if (id.includes('/components/ui/')) {
            return 'chunk-ui';
          }
          // Layout components
          if (id.includes('/components/layout/')) {
            return 'chunk-layout';
          }
        },
      },
    },
    // Enable minification with esbuild (faster than terser, similar results)
    minify: 'esbuild',
    target: 'es2020',
  },
  // Remove console logs in production
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand'],
    exclude: [],
    // Force pre-bundling for faster dev
    force: false,
  },
  server: {
    port: 5173,
    strictPort: false,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
});
