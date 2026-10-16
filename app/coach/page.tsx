import { TodaysDecision } from "../components/todays-decision";
import { CoachChat } from "../components/coach-chat";

export default function CoachPage() {
  return (
    <>
      <TodaysDecision presentation="coach" />
      <CoachChat />
    </>
  );
}
