import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// One dev server for both: Vite serves the React page, the Cloudflare plugin runs the Worker (and the agent) in workerd
export default defineConfig({
	plugins: [react(), cloudflare()],
});
