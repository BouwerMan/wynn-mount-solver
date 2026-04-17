import { SolverEngine } from "./solver.js";

// Listen for the "solve" command from the main thread
self.onmessage = async (event) => {
	const { deficits, availableTiers } = event.data;
	console.debug("[Worker] Received solve request", { availableTiers, deficits });
	const workerStart = performance.now();

	try {
		const result = await SolverEngine.solve(deficits, availableTiers);
		const totalMs = (performance.now() - workerStart).toFixed(2);
		console.info(`[Worker] Total worker time: ${totalMs}ms`);
		self.postMessage(result);
	} catch (err) {
		console.error("[Worker] Solve failed:", err);
		self.postMessage({ feasible: false, result: 0, error: err.message });
	}
};
