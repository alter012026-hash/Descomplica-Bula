import fs from "fs";
import path from "path";

const statePath = path.join(process.cwd(), "data", "weekly-featured.json");

export function getWeeklyFeatured(now = Date.now()) {
  if (!fs.existsSync(statePath)) return null;

  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const expiresAt = Date.parse(state.expiresAt || "");
  if (!state.slug || !Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return state;
}
