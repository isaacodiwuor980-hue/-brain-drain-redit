import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import recommendationsRouter from "./recommendations";
import clientErrorsRouter from "./client-errors";
import feedRouter from "./feed";
import postsRouter from "./posts";
import topicsRouter from "./topics";
import mindsRouter from "./minds";
import dataApiRouter from "./data-api";
import searchRouter from "./search";
import skillsRouter from "./skills";
import habitsRouter from "./habits";
import discoverRouter from "./discover";
import onboardingRouter from "./onboarding";
import personalityRouter from "./personality";
import expertsRouter from "./experts";
import mentorsRouter from "./mentors";
import recallRouter from "./recall";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
// Phase 3: intelligence router removed (uncalled /intelligence/summary endpoint).
// The analytics-store helpers it used are still available for internal callers.
router.use(recommendationsRouter);
router.use(clientErrorsRouter);
router.use(feedRouter);
router.use(postsRouter);
router.use(topicsRouter);
router.use(mindsRouter);
// Phase 3: verify + provenance routers removed (501 stubs that advertised
// non-existent functionality in llms.txt and /data-quality). Restore them
// only when the real SSR implementations land.
router.use(dataApiRouter);
router.use(searchRouter);
router.use(skillsRouter);
router.use(habitsRouter);
router.use(discoverRouter);
// Phase 0004 — community rebuild routes
router.use(onboardingRouter);
router.use(personalityRouter);
router.use(expertsRouter);
router.use(mentorsRouter);
router.use(recallRouter);

export default router;
