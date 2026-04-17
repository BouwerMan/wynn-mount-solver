import { UrlStateManager } from "./state.js";
import { SolverEngine } from "./solver.js";
import { STAT_NAMES, FIELDS, ALL_TIERS, archetypes, tiers, capitalize } from "./constants.js";

export class UIController {
	static init() {
		this.renderStatsInputs();

		UrlStateManager.load();

		// Bind event listeners to form inputs
		for (const name of STAT_NAMES) {
			for (const field of FIELDS) {
				const elId = `${name}-${field}`;
				const el = document.getElementById(elId);

				if (el) {
					el.addEventListener("input", () => {
						UrlStateManager.save();
						if (field === "current") this.updateTierCheckboxes();
					});
				} else {
					console.warn(`[UI Setup] Missing DOM element: #${elId}`);
				}
			}
		}

		// Bind event listeners to  solve button
		const solveBtn = document.getElementById("solve-btn");
		if (solveBtn) {
			solveBtn.addEventListener("click", () => this.handleSolve());
		}

		this.updateTierCheckboxes();
	}

	static renderStatsInputs() {
		const container = document.getElementById("stats-container");
		if (!container) {
			console.warn("[UI Setup] Missing DOM element: #stats-container");
			return;
		}

		container.innerHTML = STAT_NAMES.map((name, index) => {
			const displayName = capitalize(name);

			// Only render the 'Current', 'Limit', 'Max' labels on the very first row
			const isFirst = index === 0;
			const currentLabel = isFirst
				? `<label class="mb-1 text-[10px] font-bold tracking-wider text-zinc-500 uppercase">Current</label>`
				: "";
			const limitLabel = isFirst
				? `<label class="mb-1 text-[10px] font-bold tracking-wider text-zinc-500 uppercase">Limit</label>`
				: "";
			const maxLabel = isFirst
				? `<label class="mb-1 text-[10px] font-bold tracking-wider text-zinc-500 uppercase">Max</label>`
				: "";

			return `
					<div class="mb-1 grid grid-cols-4 items-center gap-4 border-b border-zinc-800 pb-3 last:border-0 last:pb-0 last:mb-0">
						<div class="font-medium text-zinc-300">${displayName}</div>
						<div class="flex flex-col">
							${currentLabel}
							<input type="number" id="${name}-current" value="1" min="0" step="1" class="input-field" />
						</div>
						<div class="flex flex-col">
							${limitLabel}
							<input type="number" id="${name}-limit" value="10" min="0" step="1" class="input-field" />
						</div>
						<div class="flex flex-col">
							${maxLabel}
							<input type="number" id="${name}-max" value="30" min="0" step="1" class="input-field" />
						</div>
					</div>
				`;
		}).join("");
	}

	static updateTierCheckboxes() {
		let maxCurrentStat = 0;
		for (const name of STAT_NAMES) {
			const el = document.getElementById(`${name}-current`);
			if (!el) continue;
			maxCurrentStat = Math.max(maxCurrentStat, Number(el.value));
		}

		const availableTiers = ALL_TIERS.filter((t) => t <= maxCurrentStat);
		const container = document.getElementById("tier-checkboxes");
		if (!container) return;

		container.innerHTML = availableTiers
			.map(
				(t) => `
				<label class="cursor-pointer flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 px-3 py-2 rounded-lg hover:bg-zinc-700 transition-colors shadow-sm">
					<input type="checkbox" class="tier-check w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-cyan-600 focus:ring-cyan-600 focus:ring-offset-zinc-900" value="${t}" checked />
					<span class="text-sm font-semibold text-zinc-300">Tier ${t}</span>
				</label>
			`,
			)
			.join("");
	}

	static handleSolve() {
		const deficits = {};
		const errors = [];

		for (const name of STAT_NAMES) {
			const current = Number(document.getElementById(`${name}-current`)?.value || 0);
			const limit = Number(document.getElementById(`${name}-limit`)?.value || 0);
			const max = Number(document.getElementById(`${name}-max`)?.value || 0);

			deficits[name] = Math.max(0, max - limit);

			if (max < limit) errors.push(`${name}: max (${max}) cannot be less than limit (${limit})`);
			if (current > limit) errors.push(`${name}: current (${current}) cannot exceed limit (${limit})`);
		}

		const errorEl = document.getElementById("error");
		if (errorEl) {
			if (errors.length) {
				errorEl.textContent = errors.join("\n");
				return;
			}
			errorEl.textContent = "";
		}

		const checkedBoxes = document.querySelectorAll(".tier-check:checked");
		const availableTiers = Array.from(checkedBoxes).map((el) => Number(el.value));

		const result = SolverEngine.solve(deficits, availableTiers);
		this.renderResult(result, deficits);
	}

	static renderResult(result, deficits) {
		const resultEl = document.getElementById("result");
		if (!resultEl) return;

		if (!result.feasible) {
			resultEl.innerHTML = `<p class="error text-red-400">No solution found.</p>`;
			return;
		}

		const totalItemCount = Math.round(result.result);

		const materials = Object.entries(result)
			.filter(([key]) => !["feasible", "result", "bounded", "isIntegral"].includes(key))
			.map(([key, count]) => {
				const [tierPart, slot] = key.split("_");
				return { tier: tierPart.slice(1), slot, count };
			});

		materials.sort((a, b) => b.count - a.count || Number(a.tier) - Number(b.tier) || a.slot.localeCompare(b.slot));

		const gained = {};
		for (const { tier, slot, count } of materials) {
			const stNames = archetypes[slot];
			const values = tiers[tier][slot];
			stNames.forEach((stat, i) => {
				gained[stat] = (gained[stat] || 0) + values[i] * count;
			});
		}

		const overshoot = {};
		for (const name of STAT_NAMES) {
			overshoot[name] = (gained[name] || 0) - (deficits[name] || 0);
		}

		const itemsHtml = materials
			.map(({ tier, slot, count }) => {
				const prefix = tiers[tier].prefixes[slot];
				const displayName = `${capitalize(prefix)} ${capitalize(slot)}`;
				return `
					<div class="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
						<div class="flex items-center gap-3">
							<span class="bg-cyan-900/40 text-cyan-400 font-bold px-2.5 py-1 rounded-md text-sm border border-cyan-800/50">${count}×</span>
							<span class="font-medium text-zinc-300">${displayName}</span>
						</div>
						<span class="text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-800 px-2 py-1 rounded">Lvl ${tier}</span>
					</div>`;
			})
			.join("");

		const overshootHtml = Object.entries(overshoot)
			.filter(([, amount]) => amount > 0)
			.map(
				([name, amount]) => `
					<div class="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 px-2.5 py-1 rounded-md shadow-sm">
						<span class="text-xs text-zinc-400">${capitalize(name)}</span>
						<span class="text-xs font-bold text-emerald-400">+${amount}</span>
					</div>`,
			)
			.join("");

		const overshootSection = overshootHtml
			? `<div class="mt-6 border-t border-zinc-800/80 pt-4">
					<h3 class="mb-3 text-[10px] font-bold tracking-wider text-zinc-500 uppercase">Stat Overshoot</h3>
					<div class="flex flex-wrap gap-2">${overshootHtml}</div>
				</div>`
			: "";

		resultEl.innerHTML = `
			<div class="flex flex-col">${itemsHtml}</div>
			<div class="mt-4 flex items-center justify-between rounded-lg bg-zinc-800/40 border border-zinc-700/50 px-4 py-3">
				<span class="text-sm font-semibold text-zinc-300">Total Materials Needed</span>
				<span class="text-lg font-bold text-cyan-400">${totalItemCount} items</span>
			</div>
			${overshootSection}
		`;
	}
}
