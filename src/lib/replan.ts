import { buildPlan } from "./planner";
import { getState, setState, today } from "./store";

export function regenerate(reason: string) {
  const s = getState();
  const now = new Date();
  const r = buildPlan(
    s.tasks,
    s.subjects,
    s.settings,
    today(),
    now.getHours() * 60 + now.getMinutes(),
  );
  setState(() => ({ tasks: r.tasks, planNote: `${reason}\n${r.note}` }));
}
