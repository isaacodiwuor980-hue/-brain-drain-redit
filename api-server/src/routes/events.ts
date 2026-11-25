import { Router, type IRouter } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import { storeAnalyticsEvents } from "../lib/analytics-store";

const AnalyticsEventType = z.enum([
  "session_start",
  "session_end",
  "app_visible",
  "app_hidden",
  "page_view",
  "post_created",
  "post_reaction",
  "post_share",
  "post_moderation_waiting",
  "comment_created",
  "comment_reaction",
  "message_sent",
  "search_submitted",
  "search_recent_selected",
  "topic_selected",
  "feed_mode_selected",
  "notification_opened",
  "mission_reminder",
  "brain_launch",
]);

const AnalyticsEventSchema = z.object({
  id: z.string().min(1).max(120),
  type: AnalyticsEventType,
  sessionId: z.string().min(1).max(120),
  createdAt: z.number().int().positive(),
  route: z.string().max(300),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const AnalyticsEventsRequestSchema = z.object({
  events: z.array(AnalyticsEventSchema).min(1).max(50),
  clientSentAt: z.number().int().positive().optional(),
});

const AnalyticsStorageModeSchema = z.enum(["supabase", "file", "memory"]);

const AnalyticsEventsResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  storageMode: AnalyticsStorageModeSchema,
});

type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

function sanitizePayload(payload: AnalyticsEvent["payload"]) {
  if (!payload) return undefined;

  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(payload)) {
    const field = key.toLowerCase();
    // Do not trust old or third-party clients to remove these fields.
    if (field === "search" || field === "referrer" || field === "query") continue;
    if (field === "path" && typeof value === "string") {
      entries.push([key, value.split(/[?#]/, 1)[0].slice(0, 160)]);
    } else if (typeof value === "string") entries.push([key, value.slice(0, 160)]);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) entries.push([key, value]);
    else if (Array.isArray(value)) entries.push([key, value.slice(0, 20).map(item => {
      // Nested objects/arrays can hide fields that the top-level filter removes.
      if (typeof item === "string") return item.slice(0, 160);
      if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
      return "[redacted]";
    })]);
    else entries.push([key, "[redacted]"]);
  }
  return Object.fromEntries(entries);
}

const router: IRouter = Router();

router.post("/events", async (req, res) => {
  const parsed = AnalyticsEventsRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      accepted: 0,
      error: "Invalid analytics event payload",
    });
    return;
  }

  // Reject the entire batch, rather than silently acknowledging dropped events.
  // This avoids storing legacy vote activity even from older clients. Other
  // event types still accept untrusted fields and need a separate privacy review.
  if (parsed.data.events.some(event => event.type === "post_reaction" || event.type === "comment_reaction")) {
    res.status(422).json({ accepted: 0, error: "Reaction analytics unavailable" });
    return;
  }

  const events = parsed.data.events.map((event) => ({
    ...event,
    route: event.route.split(/[?#]/, 1)[0],
    payload: sanitizePayload(event.payload),
  }));

  try {
    const { storageMode } = await storeAnalyticsEvents(events);

    const typeCounts = events.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    logger.info(
      {
        accepted: events.length,
        storageMode,
        typeCounts,
        sessionCount: new Set(events.map((event) => event.sessionId)).size,
      },
      "Analytics events accepted",
    );

    const response = AnalyticsEventsResponseSchema.parse({ accepted: events.length, storageMode });
    res.status(202).json(response);
  } catch {
    // Upstream error bodies may contain event content; never log them here.
    logger.error({}, "Failed to store analytics events");
    res.status(500).json({ accepted: 0, error: "Analytics storage unavailable" });
  }
});

// /events/summary was removed in Phase 3: uncalled HTTP endpoint. The
// underlying getAnalyticsSummary() function is still used internally by
// the intelligence module; if you need a summary, call that function from
// a server context, not via HTTP.

export default router;
