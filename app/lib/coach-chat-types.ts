export type CoachConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  memoryObservation?: CoachMemoryObservation | null;
  memorySaved?: boolean;
};

export type CoachMemoryCategory =
  | "temporary"
  | "recurring_preference"
  | "profile_information";

export type CoachMemoryObservation = {
  category: CoachMemoryCategory;
  detail: string;
};

export type SavedCoachMemory = {
  id: string;
  sourceMessageId: string;
  category: Exclude<CoachMemoryCategory, "temporary">;
  detail: string;
  createdAt: string;
};
