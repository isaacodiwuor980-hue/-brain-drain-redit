# Zero-budget deployment review (planning only)

No hosting account, app-store account, project, paid service or deployment has been created. The owner asks whether to use Vercel at zero cost or skip it for now. They chose no paid features without review, both native Android and iOS for the first pilot, and waiting for both if web is ready sooner. They report no separate native repository, no public deployment and no domain; these reports are not independently verified. The owner can test on both kinds of device and plans to use support email (address and operation not yet verified).

## Vercel: possible evaluation, not a production recommendation yet

- Vercel's [Hobby plan](https://vercel.com/docs/plans/hobby) has a free tier, usage limits and possible pauses after limits. Its [fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines) restricts Hobby to personal, non-commercial use. Whether this particular pilot qualifies is **unverified** and must be checked with Vercel against the actual project and intended use; do not assume that a free pilot is necessarily eligible. Costs and terms can change.
- Vercel supports [Express applications](https://vercel.com/docs/frameworks/backend/express), but this repository's `server.ts` starts a long-running Express listener and combines API and application serving. The repo does not have an obvious Vercel configuration at its root. A compatible serverless entry point, routing, static build, secret management, security headers, authentication, service-role containment and deployment behavior require review and synthetic testing. Do not deploy the existing process unchanged and assume it works.
- Serverless instances cannot be assumed to share in-memory caches, rate limits or state. Review all such app behavior, background work, network connection reuse, error handling and whether features depend on a persistent filesystem or process before considering deployment. Vercel [function limits](https://vercel.com/docs/functions/limitations) and service quotas apply. Zero hosting price does not mean all other dependencies are free or sufficiently recoverable.
- The Vercel connector was reported disconnected. Connecting it would only provide access to available tools; it is not authorization to create or deploy anything. No connection is needed to continue planning or local implementation.

## Native distribution and budget

- Owner says there is no separate native repository; a shallow local search found no obvious Android/iOS directories or Capacitor configuration. This is not a complete audit and does not establish native readiness. Both platforms require a real build, device testing, app-store distribution plan, Firebase login and deep-link/session review, offline privacy and update enforcement.
- Apple states its [Developer Program](https://developer.apple.com/programs/) costs **US$99 per year** and includes TestFlight distribution. Google describes a **US$25 one-time** [Play Console registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en). Availability, taxes, account eligibility, device/build costs and other charges need confirmation. Neither account or expenditure is approved. These published charges conflict with an assumption that private store-based testing for both platforms is automatically zero-cost; other legitimate distribution options have not been verified.
- The owner's latest choice is to wait for web and both native platforms before the first pilot. Do not silently replace that with a web-only launch or claim a free store distribution path. Present costs and options for a later decision if this prevents release.

## Suggested next steps — no live changes

1. Continue local security/identity/vote/privacy implementation and validation, including a detailed native and serverless compatibility audit.
2. Prepare the exact hosting architecture, allowed-use check, costs/limits and a test/deployment/rollback plan. Do not enter, log or request credentials in chat.
3. Keep the current Supabase project as target. Recovery remains unverified; each exact migration and deployment requires separate approval. Do not apply `DEPLOYMENT.md`'s old instruction to blindly run the initial migration or deploy Firebase rules.
4. Review native distribution, fees, store ownership, required platform tools and real-device testing before asking permission for purchases or deployment. No readiness guarantee.
