import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const REPO_NAME = "wynn-mount-solver";

export default defineConfig(({ command }) => ({
	plugins: [tailwindcss()],
	base: command === "build" ? `/${REPO_NAME}/` : "/",
}));
