import data from "./materials.json";

export const STAT_NAMES = ["speed", "acceleration", "altitude", "energy", "handling", "toughness", "boost", "training"];
export const FIELDS = ["current", "limit", "max"];

// Archetypes is what stat each thing (ingot, gem, etc.) improves during feeding (speed, accel, etc.)
export const { archetypes, tiers } = data;

export const ALL_TIERS = Object.keys(tiers).map(Number);
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
