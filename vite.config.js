import { defineConfig } from 'vite';

// Repo name — must match the GitHub repo, since Pages serves from
// https://<user>.github.io/<repo>/
const REPO_NAME = 'wynn-mount-solver';

export default defineConfig(({ command }) => ({
	// In dev, serve from root. In build, prefix assets with the repo name
	// so they resolve correctly on GitHub Pages.
	base: command === 'build' ? `/${REPO_NAME}/` : '/',
}));
