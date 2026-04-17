import GLPK from "glpk.js";
import { archetypes, tiers } from "./constants.js";

const glpkReady = GLPK();

export class SolverEngine {
	// Build one variable per (tier, slot) that actually does something for a
	// deficit. We also cap each variable so the solver doesn't bother exploring
	// quantities that are pure overshoot.
	static buildVariableDefs(availableTiers, deficits) {
		const defs = [];

		for (const tierLevel of availableTiers) {
			const tier = tiers[tierLevel];
			if (!tier) continue;

			for (const slot of Object.keys(archetypes)) {
				const statsProvided = archetypes[slot];
				const statValues = tier[slot];
				const name = `t${tierLevel}_${slot}`;
				const contribs = {};
				let maxUseful = 0;

				statsProvided.forEach((stat, i) => {
					const points = statValues[i];
					contribs[stat] = points;
					const d = deficits[stat];
					if (d > 0 && points > 0) {
						const ub = Math.ceil(d / points);
						if (ub > maxUseful) maxUseful = ub;
					}
				});

				if (maxUseful === 0) continue;
				defs.push({ name, tierLevel, contribs, maxUseful });
			}
		}

		return defs;
	}

	// Both phases use the same structure, deficit constraints, and
	// variable bounds. The objective and the item cap in phase 2 are the only
	// things that change between calls.
	static buildModel(defs, deficits, glpk, objectiveVars, extraConstraints = []) {
		const subjectTo = [];

		// Deficit constraints: sum(points * x) >= deficit
		for (const [stat, deficit] of Object.entries(deficits)) {
			const vars = [];
			for (const d of defs) {
				if (d.contribs[stat]) vars.push({ name: d.name, coef: d.contribs[stat] });
			}
			if (vars.length === 0) continue;
			subjectTo.push({
				name: `deficit_${stat}`,
				vars,
				bnds: { type: glpk.GLP_LO, lb: deficit, ub: 0 },
			});
		}

		subjectTo.push(...extraConstraints);

		const bounds = defs.map((d) => ({
			name: d.name,
			type: glpk.GLP_DB,
			lb: 0,
			ub: d.maxUseful,
		}));

		return {
			name: "mount_feed",
			objective: { direction: glpk.GLP_MIN, name: "obj", vars: objectiveVars },
			subjectTo,
			bounds,
			generals: defs.map((d) => d.name),
		};
	}

	static async solve(deficits, availableTiers) {
		console.debug("[Solver] Building model...", { availableTiers, deficits });
		const glpk = await glpkReady;

		const buildStart = performance.now();
		const defs = this.buildVariableDefs(availableTiers, deficits);
		const buildMs = (performance.now() - buildStart).toFixed(2);
		console.debug(`[Solver] Variables built in ${buildMs}ms — ${defs.length} variables`);

		// Nothing to solve — either all deficits are already met or no available
		// tier/slot combo contributes anything useful.
		if (defs.length === 0) {
			return { feasible: true, result: 0 };
		}

		// First phase minimizes raw item count.
		const p1ObjVars = defs.map((d) => ({ name: d.name, coef: 1 }));
		const p1Model = this.buildModel(defs, deficits, glpk, p1ObjVars);

		const p1Start = performance.now();
		const p1 = await glpk.solve(p1Model, { msglev: glpk.GLP_MSG_ERR, presol: true });
		const p1Ms = (performance.now() - p1Start).toFixed(2);
		const p1Ok = p1.result.status === glpk.GLP_OPT;
		console.info(`[Solver] Phase 1 (min items) in ${p1Ms}ms — status: ${p1.result.status}, items: ${p1.result.z}`);

		if (!p1Ok) return { feasible: false, result: 0 };

		const minItems = Math.round(p1.result.z);

		// Second phase caps items at minimum, then tries to minimize tier usage.
		const p2ObjVars = defs.map((d) => ({ name: d.name, coef: d.tierLevel }));
		const itemCap = {
			name: "item_cap",
			vars: defs.map((d) => ({ name: d.name, coef: 1 })),
			bnds: { type: glpk.GLP_UP, lb: 0, ub: minItems },
		};
		const p2Model = this.buildModel(defs, deficits, glpk, p2ObjVars, [itemCap]);

		const p2Start = performance.now();
		const p2 = await glpk.solve(p2Model, { msglev: glpk.GLP_MSG_ERR, presol: true });
		const p2Ms = (performance.now() - p2Start).toFixed(2);
		const p2Ok = p2.result.status === glpk.GLP_OPT;
		console.info(
			`[Solver] Phase 2 (min tier cost) in ${p2Ms}ms — status: ${p2.result.status}, tierCost: ${p2.result.z}`,
		);

		// Phase 2 should always succeed here, but fall back to phase 1 just in case.
		const chosen = p2Ok ? p2 : p1;

		const out = { feasible: true, result: minItems };
		for (const [name, qty] of Object.entries(chosen.result.vars)) {
			if (qty > 0) out[name] = qty;
		}
		return out;
	}
}
