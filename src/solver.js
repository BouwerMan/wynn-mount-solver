import solver from "javascript-lp-solver";
import { archetypes, tiers } from "./constants.js";

export class SolverEngine {
	static buildModel(deficits, availableTiers) {
		const variables = {};
		const ints = {};

		for (const tierLevel of availableTiers) {
			const tier = tiers[tierLevel];
			if (!tier) continue;

			// Add a small penalty based on the tier level.
			// EX: A Tier 115 item adds 0.00115 to the cost.
			// This makes the solver favor lower tier items when two solutions
			// use the same number of items.
			const tierPenalty = tierLevel / 100000;

			for (const slot of Object.keys(archetypes)) {
				const statsProvided = archetypes[slot];
				const statValues = tier[slot];
				const varName = `t${tierLevel}_${slot}`;

				// Apply the penalty to the cost
				const variable = { total: 1 + tierPenalty };

				statsProvided.forEach((stat, i) => {
					variable[stat] = statValues[i];
				});

				variables[varName] = variable;
				ints[varName] = 1;
			}
		}

		// For each stat we set the minimum to the stat deficit (max - limit)
		const constraints = {};
		for (const [stat, deficit] of Object.entries(deficits)) {
			constraints[stat] = { min: deficit };
		}

		return {
			optimize: "total",
			opType: "min",
			constraints,
			variables,
			ints,
		};
	}

	static solve(deficits, availableTiers) {
		const model = this.buildModel(deficits, availableTiers);
		return solver.Solve(model);
	}
}
