import "./style.css";
import solver from "javascript-lp-solver";
import data from "./materials.json";

const statNames = ["speed", "acceleration", "altitude", "energy", "handling", "toughness", "boost", "training"];

const fields = ["current", "limit", "max"];

const { archetypes, tiers } = data;

const allTiers = Object.keys(tiers).map(Number);

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function buildModel(deficits, availableTiers) {
	const variables = {};
	const ints = {};

	for (const tierLevel of availableTiers) {
		const tier = tiers[tierLevel];
		if (!tier) continue;

		for (const slot of Object.keys(archetypes)) {
			const statNames = archetypes[slot];
			const statValues = tier[slot];
			const varName = `t${tierLevel}_${slot}`;

			const variable = { total: 1 };
			statNames.forEach((stat, i) => {
				variable[stat] = statValues[i];
			});

			variables[varName] = variable;
			ints[varName] = 1;
		}
	}

	return {
		optimize: "total",
		opType: "min",
		constraints: {
			speed: { min: deficits.speed },
			acceleration: { min: deficits.acceleration },
			altitude: { min: deficits.altitude },
			energy: { min: deficits.energy },
			handling: { min: deficits.handling },
			toughness: { min: deficits.toughness },
			boost: { min: deficits.boost },
			training: { min: deficits.training },
		},
		variables,
		ints,
	};
}

function writeStateToUrl() {
	const params = new URLSearchParams();
	for (const name of statNames) {
		// Set three params: e.g. speed_current, speed_limit, speed_max
		// Read each value from the corresponding input
		for (const field of fields) {
			params.set(`${name}_${field}`, document.getElementById(`${name}-${field}`).value);
		}
	}
	window.history.replaceState({}, "", `?${params.toString()}`);
}

function hydrateFormFromUrl() {
	const params = new URLSearchParams(window.location.search);
	for (const name of statNames) {
		for (const field of fields) {
			const key = `${name}_${field}`;
			const value = params.get(key);
			if (value !== null) {
				document.getElementById(`${name}-${field}`).value = value;
			}
		}
	}
}

function renderStatsInputs() {
	const container = document.getElementById("stats-container");

	container.innerHTML = statNames
		.map((name, index) => {
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

			// We use 'last:border-0 last:pb-0' so the bottom border disappears on the final item
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
		})
		.join("");
}

// Helper function that reads current stats, computes available
// tiers, and re-renders the checkbox container
function updateTierCheckboxes() {
	let max = 0;
	for (const name of statNames) {
		const val = Number(document.getElementById(`${name}-current`).value);
		max = Math.max(max, val);
	}
	const availableTiers = allTiers.filter((t) => t <= max);

	const container = document.getElementById("tier-checkboxes");
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

function renderResult(result, deficits) {
	const resultEl = document.getElementById("result");

	if (!result.feasible) {
		resultEl.innerHTML = `<p class="error">No solution found.</p>`;
		return;
	}

	// Extract materials
	const materials = Object.entries(result)
		.filter(([key]) => !["feasible", "result", "bounded", "isIntegral"].includes(key))
		.map(([key, count]) => {
			const [tierPart, slot] = key.split("_");
			const tier = tierPart.slice(1);
			return { tier, slot, count };
		});

	// Sort by count desc, then tier asc, then slot alphabetically
	materials.sort((a, b) => b.count - a.count || Number(a.tier) - Number(b.tier) || a.slot.localeCompare(b.slot));

	console.log(materials);

	const gained = {};
	for (const { tier, slot, count } of materials) {
		const stNames = archetypes[slot];
		const values = tiers[tier][slot];
		stNames.forEach((stat, i) => {
			gained[stat] = (gained[stat] || 0) + values[i] * count;
		});
	}

	const overshoot = {};
	for (const name of statNames) {
		overshoot[name] = (gained[name] || 0) - (deficits[name] || 0);
	}

	// Build HTML
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
            <span class="text-lg font-bold text-cyan-400">${result.result} items</span>
        </div>
        
		${overshootSection}
	`;
}

renderStatsInputs();

// Attach the update function to every stat input
for (const name of statNames) {
	for (const field of fields) {
		document.getElementById(`${name}-${field}`).addEventListener("input", () => {
			writeStateToUrl();
			if (field === "current") updateTierCheckboxes();
		});
	}
}

updateTierCheckboxes();
hydrateFormFromUrl();
updateTierCheckboxes();

document.getElementById("solve-btn").addEventListener("click", () => {
	const stats = {};
	const deficits = {};
	for (const name of statNames) {
		stats[name] = {
			current: Number(document.getElementById(`${name}-current`).value),
			limit: Number(document.getElementById(`${name}-limit`).value),
			max: Number(document.getElementById(`${name}-max`).value),
		};
		deficits[name] = Math.max(0, stats[name].max - stats[name].limit);
	}

	const errors = [];
	for (const [name, { current, limit, max }] of Object.entries(stats)) {
		if (max < limit) errors.push(`${name}: max (${max}) cannot be less than limit (${limit})`);
		if (current > limit) errors.push(`${name}: current (${current}) cannot exceed limit (${limit})`);
	}

	const errorEl = document.getElementById("error");
	if (errors.length) {
		errorEl.textContent = errors.join("\n");
		return;
	}
	errorEl.textContent = "";

	const checked = document.querySelectorAll(".tier-check:checked");
	const availableTiers = Array.from(checked).map((el) => Number(el.value));

	const model = buildModel(deficits, availableTiers);
	const result = solver.Solve(model);
	console.log(result);
	renderResult(result, deficits);
});
