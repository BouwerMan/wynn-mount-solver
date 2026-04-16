#!/usr/bin/env node
// Parses Wynncraft mount wiki markup into materials.json.
// Usage:
//   node build-materials.js < wiki.txt > materials.json
//   node build-materials.js wiki.txt > materials.json

import fs from "node:fs";

const input = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : fs.readFileSync(0, "utf8");

// Column order in every tier table on the wiki.
const STAT_COLUMNS = ["speed", "acceleration", "altitude", "energy", "handling", "toughness", "boost", "training"];

// The 8 archetype keys we care about, matched case-insensitively against
// the second word of each row's material name ("Copper Ingot" -> "ingot").
const ARCHETYPE_KEYS = new Set(["ingot", "gem", "wood", "paper", "string", "grains", "oil", "meat"]);

// Extract every `|-|Level N=` block up to the next `|-|` or `</tabber>`.
function extractTierBlocks(src) {
	// The first tier is introduced with `Level 1=` (no leading `|-|`), the rest
	// with `|-|Level N=`. Normalize by capturing both.
	const blocks = {};
	const re = /(?:\|-\|)?Level\s+(\d+)=([\s\S]*?)(?=\|-\|Level\s+\d+=|<\/tabber>)/g;
	let m;
	while ((m = re.exec(src)) !== null) {
		blocks[m[1]] = m[2];
	}
	return blocks;
}

// Parse one tier's wikitable into { prefixes, stats } where
//   prefixes = { ingot: "copper", ... }
//   stats    = { ingot: [energy, toughness], gem: [speed, energy, training], ... }
function parseTierBlock(block) {
	const prefixes = {};
	const stats = {};

	// Each data row starts with `|- style="text-align:center"` and the next line
	// is `| style="text-align:left" | {{ProfessionIcon|...}} <Name> || <cells>`.
	// Split into rows, then pick out the ones that look like data rows.
	const rows = block.split(/\|-\s*style="text-align:center"/);
	for (const row of rows) {
		// Find the material name: "{{ProfessionIcon|...}} Copper Ingot || ..."
		const nameMatch = row.match(
			/style="text-align:left"\s*\|\s*\{\{ProfessionIcon\|[^}]+\}\}\s*([A-Za-z]+)\s+([A-Za-z]+)\s*\|\|/,
		);
		if (!nameMatch) continue;

		const prefix = nameMatch[1].toLowerCase();
		const archetype = nameMatch[2].toLowerCase();
		if (!ARCHETYPE_KEYS.has(archetype)) continue;

		// Everything after the name cell: split by `||` to get the 8 stat cells.
		const afterName = row.slice(nameMatch.index + nameMatch[0].length);
		// Cells can trail into the next `|-` row or into `\n|}` (table close);
		// stop at whichever comes first.
		const cellSection = afterName.split(/\n\|[-}]/)[0];
		const cells = cellSection.split("||").map((c) => c.trim());

		if (cells.length < STAT_COLUMNS.length) {
			throw new Error(
				`Tier row for "${prefix} ${archetype}" has ${cells.length} cells, expected ${STAT_COLUMNS.length}`,
			);
		}

		// Keep the non-empty cells in column order -> the archetype's stat values.
		const values = [];
		for (let i = 0; i < STAT_COLUMNS.length; i++) {
			const cell = cells[i];
			if (cell === "") continue;
			// Cell looks like "+4" or "+12". Strip leading '+' and parse.
			const n = parseInt(cell.replace(/^\+/, ""), 10);
			if (Number.isNaN(n)) {
				throw new Error(`Could not parse cell "${cell}" in row "${prefix} ${archetype}"`);
			}
			values.push(n);
		}

		prefixes[archetype] = prefix;
		stats[archetype] = values;
	}

	return { prefixes, stats };
}

// Derive archetype -> [stat, stat, ...] from which columns are populated for
// the archetype across all tiers. We use the first tier that has the row.
function deriveArchetypes(tierBlocks) {
	const archetypes = {};

	for (const tierName of Object.keys(tierBlocks)) {
		const block = tierBlocks[tierName];
		const rows = block.split(/\|-\s*style="text-align:center"/);
		for (const row of rows) {
			const nameMatch = row.match(
				/style="text-align:left"\s*\|\s*\{\{ProfessionIcon\|[^}]+\}\}\s*([A-Za-z]+)\s+([A-Za-z]+)\s*\|\|/,
			);
			if (!nameMatch) continue;
			const archetype = nameMatch[2].toLowerCase();
			if (!ARCHETYPE_KEYS.has(archetype)) continue;
			if (archetypes[archetype]) continue;

			const afterName = row.slice(nameMatch.index + nameMatch[0].length);
			const cellSection = afterName.split(/\n\|[-}]/)[0];
			const cells = cellSection.split("||").map((c) => c.trim());

			const statsForArchetype = [];
			for (let i = 0; i < STAT_COLUMNS.length; i++) {
				if (cells[i] !== "") statsForArchetype.push(STAT_COLUMNS[i]);
			}
			archetypes[archetype] = statsForArchetype;
		}
	}

	// Preserve archetype order as it appears in the original schema.
	const ordered = {};
	for (const key of ["ingot", "gem", "wood", "paper", "string", "grains", "oil", "meat"]) {
		if (archetypes[key]) ordered[key] = archetypes[key];
	}
	return ordered;
}

function build(src) {
	const tierBlocks = extractTierBlocks(src);
	if (Object.keys(tierBlocks).length === 0) {
		throw new Error("No `Level N=` blocks found in input");
	}

	const archetypes = deriveArchetypes(tierBlocks);

	// Sort tiers numerically.
	const tierNumbers = Object.keys(tierBlocks)
		.map(Number)
		.sort((a, b) => a - b);

	const tiers = {};
	for (const n of tierNumbers) {
		const { prefixes, stats } = parseTierBlock(tierBlocks[String(n)]);
		tiers[String(n)] = { prefixes, ...stats };
	}

	return { archetypes, tiers };
}

const out = build(input);
process.stdout.write(JSON.stringify(out, null, "\t") + "\n");
