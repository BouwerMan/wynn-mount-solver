import { SolverEngine } from "./solver.js";

// Listen for the "solve" command from the main thread
self.onmessage = (event) => {
	const { deficits, availableTiers } = event.data;

	const result = SolverEngine.solve(deficits, availableTiers);

	// Send the result back
	self.postMessage(result);
};
