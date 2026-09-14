import { z } from "@workspace/api-zod";

export const MAX_FEEDBACK_MESSAGE_LENGTH = 4_000;
export const MAX_FEEDBACK_EMAIL_LENGTH = 254;

const optionalEmail = z.preprocess(
  (value) => typeof value === "string" ? value.trim() : value,
  z.union([z.literal(""), z.string().email().max(MAX_FEEDBACK_EMAIL_LENGTH)]).optional(),
);

export const FeedbackBody = z.object({
  type: z.enum(["idea", "bug", "other"]).default("other"),
  message: z.string().trim().min(1).max(MAX_FEEDBACK_MESSAGE_LENGTH),
  email: optionalEmail,
}).strict();
