import { readFileSync } from "node:fs";
import {
  checkPlannerStorage,
  formatPlannerStorageProblems,
} from "../app/lib/planner-storage-check.ts";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
} catch {
  // Environment may already be provided.
}
const problems = await checkPlannerStorage();
if (problems.length) {
  console.error(formatPlannerStorageProblems(problems));
  process.exit(1);
}
console.log("Planner storage is complete.");
