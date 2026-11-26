import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import recommendationsRouter from "./recommendations";
import clientErrorsRouter from "./client-errors";
import feedRouter from "./feed";
import feedPrivacyRouter from "./feed-privacy";
import postsRouter from "./posts";
import voteStateV2Router from "./vote-state-v2";
import topicsRouter from "./topics";
import brainsRouter from "./brains";
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
import meRouter from "./me";
import tsrgStatusRouter from "./tsrg-status";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(tsrgStatusRouter);
router.use(eventsRouter);
// Phase 3: intelligence router removed (uncalled /intelligence/summary endpoint).
// The analytics-store helpers it used are still available for internal callers.
router.use(recommendationsRouter);
router.use(clientErrorsRouter);
router.use(feedRouter);
router.use(feedPrivacyRouter);
router.use(postsRouter);
router.use(voteStateV2Router);
router.use(topicsRouter);
router.use(brainsRouter);
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
