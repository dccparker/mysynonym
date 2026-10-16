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
};
