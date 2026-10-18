export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkPlannerStorage, formatPlannerStorageProblems } = await import(
    "./app/lib/planner-storage-check"
  );
  try {
    const problems = await checkPlannerStorage();
    if (problems.length) console.error(formatPlannerStorageProblems(problems));
    else console.info("Planner storage check passed.");
  } catch (error) {
    console.error("Planner storage check could not run:", error);
  }
}
