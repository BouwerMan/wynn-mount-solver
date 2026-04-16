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
	  <label>
		<input type="checkbox" class="tier-check" value="${t}" checked />
		Tier ${t}
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
			return `<li>${count}× ${displayName} (Level ${tier})</li>`;
		})
		.join("");

	const overshootHtml = Object.entries(overshoot)
		.filter(([, amount]) => amount > 0)
		.map(([name, amount]) => `<li>${capitalize(name)}: +${amount}</li>`)
		.join("");

	const overshootSection = overshootHtml ? `<h3>Overshoot:</h3><ul>${overshootHtml}</ul>` : "";

	resultEl.innerHTML = `
		<h3>Total: ${result.result} items</h3>
		<ul>${itemsHtml}</ul>
		${overshootSection}
	`;
}

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
