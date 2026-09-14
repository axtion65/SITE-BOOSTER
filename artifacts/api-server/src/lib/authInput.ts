import { z } from "@workspace/api-zod";

export const ChangePasswordBody = z.object({
  email: z.string().email().max(254),
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
}).strict();
