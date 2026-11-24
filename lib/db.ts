const DB_NAME = "brainBuilder";
const DB_VERSION = 19;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * PREVIEW FIX (home feed blank in iframe / Safari ITP):
 *
 * In sandboxed preview iframes (z.ai embeds preview-*.space-z.ai) and in
 * Safari's third-party tracking protection, merely ACCESSING indexedDB (or
 * opening a database) throws SecurityError. Before this fix, every idb.*
 * call rejected, which killed the feed queryFn BEFORE the network fetch ran
 * (use-social reads the cache first) → the home feed rendered permanently
 * empty in the preview — the #1 reported preview issue.
 *
 * Strategy: IndexedDB is a CACHE here; the cloud API is the source of truth.
 * So on storage-ACCESS errors we degrade gracefully:
 *   - reads  → safe empty defaults ([]) / undefined
 *   - writes → silent no-op (data simply isn't cached locally)
 * and log ONCE per session. Genuine bugs (DataError, version issues) still
 * throw so they surface in testing.
 */
let storageBlockedLogged = false;

function isStorageAccessError(err: unknown): boolean {
  if (err instanceof DOMException) {
    // SecurityError: access blocked (sandboxed iframe, ITP, permissions
    // policy). NotAllowedError: some browsers use this for denied storage.
    // InvalidStateError: the origin is opaque (sandbox without
    // allow-same-origin) — the DB layer is unusable there too.
    return (
      err.name === "SecurityError" ||
      err.name === "NotAllowedError" ||
      err.name === "InvalidStateError"
    );
  }
  // Firefox in blocked contexts: "The operation failed for reasons unrelated
  // to the database itself and not covered by any other error code."
  if (err instanceof DOMException === false && err instanceof Error) {
    return err.name === "UnknownError";
  }
  return false;
}

/**
 * Wrap an IDB operation so storage-ACCESS failures resolve to a safe
 * default instead of rejecting. Non-access errors still reject.
 */
function withStorageFallback<T>(opName: string, op: () => Promise<T>, fallback: T): Promise<T> {
  return op().catch((err) => {
    if (isStorageAccessError(err)) {
      if (!storageBlockedLogged) {
        storageBlockedLogged = true;
        console.warn(
          `[db] Local storage is blocked in this context (${err.name}) — running cloud-first with no offline cache. ` +
            "All data still loads from the API.",
        );
      }
      return fallback;
    }
    throw err;
  });
}

/**
 * Opens (or reuses the cached) IndexedDB connection. Reusing a single
 * connection avoids the overhead of opening a new one for every read/write
 * and prevents transaction churn during bulk operations.
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  // PREVIEW FIX: accessing `indexedDB` ITSELF throws SecurityError in
  // sandboxed iframes / ITP-blocked contexts — guard the access, not just
  // the request callbacks.
  try {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new DOMException("indexedDB unavailable", "SecurityError"));
    }
  } catch (err) {
    return Promise.reject(err);
  }

  dbPromise = new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      // Some browsers throw SYNCHRONOUSLY on open() when storage is blocked.
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      reject(err);
      return;
    }

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;

      // Recover from the browser invalidating the connection (e.g. storage
      // eviction, private mode, devtools deletion).
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        // Another tab/context requested a version upgrade; close gracefully
        // so the upgrade can proceed.
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains("brains")) {
          db.createObjectStore("brains", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("nodes")) {
          const nodeStore = db.createObjectStore("nodes", { keyPath: "id" });
          nodeStore.createIndex("brain_id", "brain_id", { unique: false });
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains("posts")) {
          const postStore = db.createObjectStore("posts", { keyPath: "id" });
          postStore.createIndex("topicId", "topicId", { unique: false });
          postStore.createIndex("userId", "userId", { unique: false });
        }
        if (!db.objectStoreNames.contains("topics")) {
          db.createObjectStore("topics", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("profile")) {
          db.createObjectStore("profile", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("brain_dna")) {
          const dnaStore = db.createObjectStore("brain_dna", { keyPath: "id" });
          dnaStore.createIndex("brainId", "brainId", { unique: true });
        }
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains("messages")) {
          const messageStore = db.createObjectStore("messages", { keyPath: "id" });
          messageStore.createIndex("conversationId", "conversationId", { unique: false });
        }
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("notifications")) {
          db.createObjectStore("notifications", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("comments")) {
          const commentStore = db.createObjectStore("comments", { keyPath: "id" });
          commentStore.createIndex("postId", "postId", { unique: false });
          commentStore.createIndex("parentId", "parentId", { unique: false });
        }
        if (!db.objectStoreNames.contains("communities")) {
          db.createObjectStore("communities", { keyPath: "id" });
        }
      }

      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains("missions")) {
          const missionStore = db.createObjectStore("missions", { keyPath: "id" });
          missionStore.createIndex("status", "status", { unique: false });
          missionStore.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains("milestones")) {
          const milestoneStore = db.createObjectStore("milestones", { keyPath: "id" });
          milestoneStore.createIndex("missionId", "missionId", { unique: false });
        }
        if (!db.objectStoreNames.contains("reputation")) {
          db.createObjectStore("reputation", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("xp_events")) {
          db.createObjectStore("xp_events", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("checkins")) {
          const checkinStore = db.createObjectStore("checkins", { keyPath: "id" });
          checkinStore.createIndex("circleId", "circleId", { unique: false });
          checkinStore.createIndex("userId", "userId", { unique: false });
        }
        if (!db.objectStoreNames.contains("pathways")) {
          db.createObjectStore("pathways", { keyPath: "id" });
        }
      }

      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains("books")) {
          db.createObjectStore("books", { keyPath: "id" });
        }
      }

      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains("analytics_events")) {
          const analyticsStore = db.createObjectStore("analytics_events", { keyPath: "id" });
          analyticsStore.createIndex("type", "type", { unique: false });
          analyticsStore.createIndex("sessionId", "sessionId", { unique: false });
          analyticsStore.createIndex("createdAt", "createdAt", { unique: false });
          analyticsStore.createIndex("route", "route", { unique: false });
        }
      }

      if (oldVersion < 7) {
        if (!db.objectStoreNames.contains("daily_challenges")) {
          const challengeStore = db.createObjectStore("daily_challenges", { keyPath: "id" });
          challengeStore.createIndex("dateString", "dateString", { unique: false });
          challengeStore.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains("user_challenge_attempts")) {
          const attemptStore = db.createObjectStore("user_challenge_attempts", { keyPath: "id" });
          attemptStore.createIndex("userId", "userId", { unique: false });
          attemptStore.createIndex("challengeId", "challengeId", { unique: false });
        }
        if (!db.objectStoreNames.contains("leaderboards")) {
          const leaderboardStore = db.createObjectStore("leaderboards", { keyPath: "id" });
          leaderboardStore.createIndex("timeframe", "timeframe", { unique: false });
        }
        if (!db.objectStoreNames.contains("user_achievements")) {
          const achStore = db.createObjectStore("user_achievements", { keyPath: "id" });
          achStore.createIndex("userId", "userId", { unique: false });
          achStore.createIndex("badgeId", "badgeId", { unique: false });
        }
        if (!db.objectStoreNames.contains("realtime_sessions")) {
          const sessionStore = db.createObjectStore("realtime_sessions", { keyPath: "id" });
          sessionStore.createIndex("hostUserId", "hostUserId", { unique: false });
          sessionStore.createIndex("status", "status", { unique: false });
        }
      }
      if (oldVersion < 8) {
        if (!db.objectStoreNames.contains("stories")) {
          const storyStore = db.createObjectStore("stories", { keyPath: "id" });
          storyStore.createIndex("userId", "userId", { unique: false });
          storyStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      }
      // Phase 2-9: New stores for the knowledge network layer.
      // All stores use keyPath "id" and are additive — existing stores
      // and data are untouched. Old records continue rendering because
      // all new fields on existing types are optional with safe defaults.
      if (oldVersion < 9) {
        // Phase 2: Brain contributions (answer branches on question brains)
        if (!db.objectStoreNames.contains("brain_contributions")) {
          db.createObjectStore("brain_contributions", { keyPath: "id" });
        }
        // Phase 4: Bookmark collections
        if (!db.objectStoreNames.contains("bookmark_collections")) {
          db.createObjectStore("bookmark_collections", { keyPath: "id" });
        }
        // Phase 6: Knowledge Artifacts
        if (!db.objectStoreNames.contains("knowledge_artifacts")) {
          db.createObjectStore("knowledge_artifacts", { keyPath: "id" });
        }
        // Phase 6: Decision Trails
        if (!db.objectStoreNames.contains("decision_trails")) {
          db.createObjectStore("decision_trails", { keyPath: "id" });
        }
        // Phase 8: Impact nodes
        if (!db.objectStoreNames.contains("impact_nodes")) {
          db.createObjectStore("impact_nodes", { keyPath: "id" });
        }
        // Phase 8: Transformation milestones
        if (!db.objectStoreNames.contains("transformation_milestones")) {
          db.createObjectStore("transformation_milestones", { keyPath: "id" });
        }
      }
      // v10: connections store for CommunityPage's connectWith function.
      if (oldVersion < 10) {
        if (!db.objectStoreNames.contains("connections")) {
          db.createObjectStore("connections", { keyPath: "id" });
        }
      }
      // v11: Phase 1 Trust Layer. Two new stores — identity_proofs and
      // verification_records. Both are additive; no existing store is
      // touched. Records only exist for users who have opted to verify,
      // so anonymous users see no change.
      if (oldVersion < 11) {
        if (!db.objectStoreNames.contains("identity_proofs")) {
          const proofStore = db.createObjectStore("identity_proofs", {
            keyPath: "id",
          });
          proofStore.createIndex("userId", "userId", { unique: false });
          proofStore.createIndex("status", "status", { unique: false });
          proofStore.createIndex("proofHash", "proofHash", { unique: false });
        }
        if (!db.objectStoreNames.contains("verification_records")) {
          db.createObjectStore("verification_records", { keyPath: "userId" });
        }
      }
      // v12: Phase 1.5 Brain Drain Core. Two new stores — drain_entries
      // (the atomic unit of drained expertise) and brain_wills (the
      // succession rules for each brain). Both additive; existing stores
      // and records are untouched.
      if (oldVersion < 12) {
        if (!db.objectStoreNames.contains("drain_entries")) {
          const drainStore = db.createObjectStore("drain_entries", {
            keyPath: "id",
          });
          drainStore.createIndex("brainId", "brainId", { unique: false });
          drainStore.createIndex("userId", "userId", { unique: false });
          drainStore.createIndex("skill", "skill", { unique: false });
          drainStore.createIndex("createdAt", "createdAt", { unique: false });
          drainStore.createIndex("visibility", "visibility", { unique: false });
        }
        if (!db.objectStoreNames.contains("brain_wills")) {
          db.createObjectStore("brain_wills", { keyPath: "brainId" });
        }
      }
      // v13: Phase B-5 — branches + pull_requests stores for GitHub-style
      // answer branching. Previously use-brain-repo.ts used in-memory mock
      // data; now branches and PRs persist to IDB so answer-branches
      // survive reloads. Additive — no existing store touched.
      if (oldVersion < 13) {
        if (!db.objectStoreNames.contains("branches")) {
          const branchStore = db.createObjectStore("branches", { keyPath: "id" });
          branchStore.createIndex("brain_id", "brain_id", { unique: false });
          branchStore.createIndex("name", "name", { unique: false });
        }
        if (!db.objectStoreNames.contains("pull_requests")) {
          const prStore = db.createObjectStore("pull_requests", { keyPath: "id" });
          prStore.createIndex("brain_id", "brain_id", { unique: false });
          prStore.createIndex("status", "status", { unique: false });
          prStore.createIndex("originPostId", "originPostId", { unique: false });
        }
      }
      // v14: Phase 2 Provenance Ledger. Two new stores — provenance_chain
      // (one row per version per record, chained SHA-256 hashes) and
      // edit_history (denormalised read model for the UI). Both additive;
      // no existing store is touched. Old records simply have no
      // provenance chain yet and render unchanged.
      if (oldVersion < 14) {
        if (!db.objectStoreNames.contains("provenance_chain")) {
          const provStore = db.createObjectStore("provenance_chain", {
            keyPath: "id",
          });
          provStore.createIndex("recordId", "recordId", { unique: false });
          provStore.createIndex("kind", "kind", { unique: false });
          provStore.createIndex("signedAt", "signedAt", { unique: false });
          // Composite lookup by (recordId, version) isn't directly supported
          // by a single IDB index, but the recordId index + in-memory sort
          // is fast enough for the chain sizes we expect (tens of versions
          // per record, not thousands).
        }
        if (!db.objectStoreNames.contains("edit_history")) {
          const histStore = db.createObjectStore("edit_history", {
            keyPath: "id",
          });
          histStore.createIndex("recordId", "recordId", { unique: false });
          histStore.createIndex("kind", "kind", { unique: false });
        }
      }
      // v15: Phase 3 Confidence Scores. One new store — confidence_scores
      // (keyPath: postId, one row per answer). Additive; no existing
      // store touched. Old answers simply have no score yet and render
      // without the confidence badge until they're recomputed.
      if (oldVersion < 15) {
        if (!db.objectStoreNames.contains("confidence_scores")) {
          const scoreStore = db.createObjectStore("confidence_scores", {
            keyPath: "postId",
          });
          scoreStore.createIndex("score", "score", { unique: false });
          scoreStore.createIndex("label", "label", { unique: false });
          scoreStore.createIndex("computedAt", "computedAt", { unique: false });
        }
      }
      // v16: Phase 4 Dispute & Correction Workflow. Two new stores —
      // disputes (one row per dispute, keyPath: id) and moderation_log
      // (append-only audit trail, keyPath: id). Both additive; no
      // existing store touched. Old answers simply have no disputes.
      if (oldVersion < 16) {
        if (!db.objectStoreNames.contains("disputes")) {
          const disputeStore = db.createObjectStore("disputes", { keyPath: "id" });
          disputeStore.createIndex("postId", "postId", { unique: false });
          disputeStore.createIndex("filerId", "filerId", { unique: false });
          disputeStore.createIndex("status", "status", { unique: false });
          disputeStore.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("moderation_log")) {
          const logStore = db.createObjectStore("moderation_log", { keyPath: "id" });
          logStore.createIndex("disputeId", "disputeId", { unique: false });
          logStore.createIndex("postId", "postId", { unique: false });
          logStore.createIndex("actorId", "actorId", { unique: false });
          logStore.createIndex("type", "type", { unique: false });
          logStore.createIndex("at", "at", { unique: false });
        }
      }
      // v17: PERF — add an answeredPostId index to the posts store so the
      // confidence-score recompute can query sibling answers directly
      // (O(answers-to-this-question)) instead of loading ALL posts
      // (O(total-posts)) and filtering. Adding an index to an existing
      // store is allowed in a versionchange transaction.
      if (oldVersion < 17) {
        if (db.objectStoreNames.contains("posts")) {
          // In an onupgradeneeded handler, the upgrade transaction is
          // accessible via (event.target as IDBOpenDBRequest).transaction.
          const upgradeTx = (event.target as IDBOpenDBRequest).transaction;
          if (upgradeTx) {
            const postStore = upgradeTx.objectStore("posts");
            if (!postStore.indexNames.contains("answeredPostId")) {
              postStore.createIndex("answeredPostId", "answeredPostId", { unique: false });
            }
          }
        }
      }

      if (oldVersion < 18) {
        // PERF-001: boards + pins were previously stored in Firestore, which
        // forced the entire 885KB firebase SDK to load on the home feed
        // (PostCard → useBoards → @/lib/firebase barrel). Moving them to
        // IDB makes the app local-first for boards and removes firebase
        // from the critical path. The "boards" store keyed by id with an
        // index on ownerId for fast per-user queries; "pins" store keyed
        // by id with indexes on boardId + postId for lookups.
        if (!db.objectStoreNames.contains("boards")) {
          const boardStore = db.createObjectStore("boards", { keyPath: "id" });
          boardStore.createIndex("ownerId", "ownerId", { unique: false });
        }
        if (!db.objectStoreNames.contains("pins")) {
          const pinStore = db.createObjectStore("pins", { keyPath: "id" });
          pinStore.createIndex("boardId", "boardId", { unique: false });
          pinStore.createIndex("postId", "postId", { unique: false });
        }
      }

      if (oldVersion < 19) {
        // Part 2 Task 5/8: skills store (private skill library + published skills).
        // Part 2 Task 4: habits store (separate from brain nodes — never overwritten).
        if (!db.objectStoreNames.contains("skills")) {
          const skillStore = db.createObjectStore("skills", { keyPath: "id" });
          // Index on status for "private" vs "published" filtering.
          skillStore.createIndex("status", "status", { unique: false });
          // Index on sourceBrainId for lineage traceability (Task 8).
          skillStore.createIndex("sourceBrainId", "sourceBrainId", { unique: false });
        }
        if (!db.objectStoreNames.contains("habits")) {
          const habitStore = db.createObjectStore("habits", { keyPath: "id" });
          // Index on milestoneId so a milestone can look up its attached habit.
          habitStore.createIndex("milestoneId", "milestoneId", { unique: false });
          // Index on topic for @habit mention scanning.
          habitStore.createIndex("topic", "topic", { unique: false });
        }
      }
    };
  });

  // A failed open must not poison the cached connection for the rest of the
  // session. Only clear the same attempt, not a newer connection.
  const attempt = dbPromise;
  void attempt.catch(() => {
    if (dbPromise === attempt) dbPromise = null;
  });
  return attempt;
}

/**
 * Resets the cached connection so the next call to openDB() reopens it.
 * Used after a versionchange/blocked event or when storage is cleared.
 */
export function resetDBConnection() {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
  }
  dbPromise = null;
}

export const idb = {
  /** Persist a local-first brain and its nodes atomically. Unlike cache writes,
   * this must reject when storage is unavailable: no cloud write backs it up. */
  async saveBrainWithNodes(brain: { id: string }, nodes: Array<{ id: string }>): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["brains", "nodes"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save brain"));
      tx.onabort = () => reject(tx.error ?? new Error("Brain save was aborted"));
      try {
        // A user save is authoritative local data, never a cloud-only stub.
        const localBrain = { ...brain } as typeof brain & { __cloudMetadataOnly?: boolean };
        delete localBrain.__cloudMetadataOnly;
        tx.objectStore("brains").put(localBrain);
        for (const node of nodes) tx.objectStore("nodes").put(node);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  },

  /** Delete a brain and its nodes in one durable transaction. */
  async deleteBrainWithNodes(brainId: string): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["brains", "nodes"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not delete brain."));
      tx.onabort = () => reject(tx.error ?? new Error("Brain deletion was aborted."));
      tx.objectStore("brains").delete(brainId);
      const cursor = tx.objectStore("nodes").index("brain_id").openCursor(brainId);
      cursor.onsuccess = () => {
        if (cursor.result) {
          cursor.result.delete();
          cursor.result.continue();
        }
      };
    });
  },

  /** Cache previously unseen cloud records without replacing local edits.
   * The existence check and insert share a transaction with competing writes. */
  async cacheNewBrains<T extends { id: string }>(brains: T[]): Promise<void> {
    if (brains.length === 0) return;
    await withStorageFallback("cacheNewBrains", async () => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("brains", "readwrite");
        const store = tx.objectStore("brains");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Cloud cache transaction aborted"));
        for (const brain of new Map(brains.map((item) => [item.id, item])).values()) {
          const request = store.get(brain.id);
          request.onsuccess = () => {
            if (request.result === undefined) store.add({ ...brain, __cloudMetadataOnly: true });
          };
        }
      });
    }, undefined);
  },

  /** Hydrate only an unchanged metadata-only stub, never a concurrent local edit.
   * Adding nodes (rather than upserting) prevents collisions with other brains. */
  async hydrateCloudBrain(
    expected: { id: string; __cloudMetadataOnly?: boolean },
    brain: { id: string },
    nodes: Array<{ id: string; brain_id: string }>,
  ): Promise<boolean> {
    if (brain.id !== expected.id || nodes.some((node) => node.brain_id !== brain.id)) {
      throw new Error("Cloud brain data does not match the requested brain.");
    }
    const db = await openDB();
    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(["brains", "nodes"], "readwrite");
      const brainStore = tx.objectStore("brains");
      const nodeStore = tx.objectStore("nodes");
      let hydrated = false;
      tx.oncomplete = () => resolve(hydrated);
      tx.onerror = () => reject(tx.error ?? new Error("Could not cache cloud brain."));
      tx.onabort = () => reject(tx.error ?? new Error("Cloud brain cache was aborted."));
      const current = brainStore.get(expected.id);
      current.onsuccess = () => {
        if (!current.result?.__cloudMetadataOnly || JSON.stringify(current.result) !== JSON.stringify(expected)) return;
        const count = nodeStore.index("brain_id").count(expected.id);
        count.onsuccess = () => {
          if (count.result !== 0) return;
          const localBrain = { ...brain } as typeof brain & { __cloudMetadataOnly?: boolean };
          delete localBrain.__cloudMetadataOnly;
          brainStore.put(localBrain);
          for (const node of nodes) nodeStore.add(node);
          hydrated = true;
        };
      };
    });
  },

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    return withStorageFallback(`get(${storeName})`, async () => {
      const db = await openDB();
      return new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }, undefined);
  },

  /** A missing record is undefined; storage errors are never converted to absence. */
  async getStrict<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(key);
      let result: T | undefined;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("Local read failed"));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("Local read failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Local read aborted"));
    });
  },

  /** Read local export data without converting storage failures into empty lists. */
  async getAllStrict<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();
      let result: T[];
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("Local read failed"));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("Local read failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Local read aborted"));
    });
  },

  async getAll<T>(storeName: string): Promise<T[]> {
    return withStorageFallback(`getAll(${storeName})`, async () => {
      const db = await openDB();
      return new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }, []);
  },

  async getAllByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
    return withStorageFallback(`getAllByIndex(${storeName},${indexName})`, async () => {
      const db = await openDB();
      return new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }, []);
  },

  /** Authoritative local writes must fail if persistence is unavailable. */
  async putStrict<T = unknown>(storeName: string, value: T): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Local write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Local write aborted"));
      tx.objectStore(storeName).put(value);
    });
  },

  async put<T = unknown>(storeName: string, value: T): Promise<void> {
    await withStorageFallback(`put(${storeName})`, async () => {
      const db = await openDB();
      // F2: resolve on tx.oncomplete (NOT the request-level success callback).
      // The request success event fires when the request is queued, not when
      // the transaction commits. If the transaction later aborts (quota error,
      // version change), the Promise would already have resolved — caller
      // thinks the write succeeded but the data was rolled back.
      // tx.oncomplete is the only durable signal.
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }, undefined);
  },

  /**
   * Persists many values to a single store inside ONE transaction. This is
   * dramatically faster than awaiting idb.put() in a loop (which opens a new
   * transaction per item).
   */
  async putAll<T = unknown>(storeName: string, values: T[]): Promise<void> {
    if (values.length === 0) return;
    await withStorageFallback(`putAll(${storeName})`, async () => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        for (const value of values) {
          store.put(value);
        }
      });
    }, undefined);
  },

  async delete(storeName: string, key: string): Promise<void> {
    await withStorageFallback(`delete(${storeName})`, async () => {
      const db = await openDB();
      // F2: same durability fix as put() — resolve on tx.oncomplete.
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }, undefined);
  },

  /**
   * Deletes many keys from one store in a single transaction.
   */
  async deleteAll(storeName: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await withStorageFallback(`deleteAll(${storeName})`, async () => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        for (const key of keys) {
          store.delete(key);
        }
      });
    }, undefined);
  },

  async clear(storeName: string): Promise<void> {
    await withStorageFallback(`clear(${storeName})`, async () => {
      const db = await openDB();
      // F2: same durability fix as put() — resolve on tx.oncomplete.
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }, undefined);
  },

  /** Clear IndexedDB in one transaction; never treat blocked storage as success. */
  async clearAllStrict(): Promise<void> {
    const db = await openDB();
    const names = Array.from(db.objectStoreNames);
    if (names.length === 0) return;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(names, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Local clear failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Local clear aborted"));
      for (const name of names) tx.objectStore(name).clear();
    });
  },

  /**
   * Clears every object store. This is destructive and is only used by the
   * admin-gated "Refresh data" action in Settings.
   */
  async clearAll(storeNames?: string[]): Promise<void> {
    await withStorageFallback("clearAll", async () => {
      const db = await openDB();
      const names = storeNames && storeNames.length > 0 ? storeNames : Array.from(db.objectStoreNames);
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(names, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        for (const name of names) {
          tx.objectStore(name).clear();
        }
      });
    }, undefined);
  },

  storeNames(): Promise<string[]> {
    return withStorageFallback("storeNames", async () => {
      const db = await openDB();
      return Array.from(db.objectStoreNames);
    }, []);
  },
};
