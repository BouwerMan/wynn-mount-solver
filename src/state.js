import { STAT_NAMES, FIELDS } from "./constants.js";

export class UrlStateManager {
	static save() {
		const params = new URLSearchParams();
		for (const name of STAT_NAMES) {
			for (const field of FIELDS) {
				// Get current value in table and store it in URL
				const el = document.getElementById(`${name}-${field}`);
				if (el) params.set(`${name}_${field}`, el.value);
			}
		}
		window.history.replaceState({}, "", `?${params.toString()}`);
	}

	static load() {
		const params = new URLSearchParams(window.location.search);
		for (const name of STAT_NAMES) {
			for (const field of FIELDS) {
				const value = params.get(`${name}_${field}`);
				const el = document.getElementById(`${name}-${field}`);
				if (value !== null && el) {
					el.value = value;
				}
			}
		}
	}
}
