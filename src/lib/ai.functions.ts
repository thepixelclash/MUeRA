import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const askAI = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      mode: z.enum([
        "summary",
        "notes",
        "quiz",
        "flashcards",
        "extract",
        "chat",
        "plan",
        "recovery",
        "timetable",
      ]),
      prompt: z.string().min(1).max(4000),
      context: z.string().max(30000).default(""),
      accessToken: z.string().max(4000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { guard } = await import("./ai-guard");
    const g = await guard(data.accessToken);
    if (!g.ok) return { error: g.error, status: g.status };
    const { runAI } = await import("./ai.server");
    return runAI(data.mode, data.prompt, data.context);
  });
