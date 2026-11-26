export interface BrainVersion {
  id: string;
  brain_id: string;
  branch: string;
  message: string;
  nodes: Node[];
  created_at: number;
}

export interface Branch {
  id: string;
  brain_id: string;
  name: string;
  isMain: boolean;
  parent_version_id?: string;
  created_at: number;
  /** Task 10: tags applied to this branch (e.g. "v1.0", "stable", "experiment"). */
  tags?: string[];
}

export interface PullRequest {
  id: string;
  brain_id: string;
  title: string;
  description: string;
  source_branch: string;
  target_branch: string;
  status: "open" | "merged" | "closed";
  created_at: number;
  /**
   * Phase B-5: GitHub-style answer branching.
   *
   * When a user answers a question post that has an attached brain, they
   * can propose an edit to that brain (fill the gaps, fix incomplete
   * branches, add missing outcomes). The edit lives in a sub-branch and
   * a PullRequest is opened against the brain's main branch.
   *
   * `originPostId` links the PR back to the question post so:
   *  - Other users can review the proposed answer in context.
   *  - The question author sees "1 proposed answer" on their post.
   *  - When the author merges the PR, the post is marked solved
   *    (Post.isSolved = true, Post.solvedBranchId = source_branch).
   *
   * `proposedByUserId` + `proposedByUserName` identify the answerer so
   * the author knows who to credit (and reputation flows on merge).
   *
   * All optional — old PRs simply have no post link and behave as before.
   */
  originPostId?: string;
  proposedByUserId?: string;
  proposedByUserName?: string;
  /**
   * The reviewer's verdict when status === "merged" or "closed".
   * Stored for the audit trail / reputation calculation.
   */
  reviewedByUserId?: string;
  reviewedAt?: number;
  reviewNote?: string;
  merged_at?: number;
}

export type BrainType = "knowledge" | "method" | "project" | "decision";

export interface Brain {
  id: string;
  title: string;
  category: string;
  description: string;
  created_at: number;
  root_node_id: string | null;
  repo_status?: "private" | "public_repo" | "archived";
  active_branch?: string;
  isFavorite?: boolean;
  tags?: string[];
  version?: number;
  /** Functional brain type — drives presentation + behavior. */
  brain_type?: BrainType;
  /** Short summary shown in compact view (separate from full description). */
  summary?: string;
  /** Explicit relationship to other brains (not tag-based — deliberate links). */
  related_brain_ids?: string[];
  /** Source references for attribution (URLs, post IDs, brain IDs). */
  source_refs?: Array<{ type: "post" | "brain" | "url"; id: string; label?: string }>;
  /** Contributor attribution (who contributed to this brain). */
  contributors?: Array<{ name: string; role?: string }>;
}

export interface Node {
  id: string;
  brain_id: string;
  node_type: "question" | "outcome";
  question_text?: string;
  if_true_node_id?: string | null;
  if_false_node_id?: string | null;
  result_text?: string;
  next_steps?: string;
  attachments?: NodeAttachment[];
  /**
   * Task 11: which branch this node belongs to. When undefined or "main",
   * the node is on the main branch. Forking a brain copies all main-branch
   * nodes into a new branch-scoped set so edits on the fork don't affect
   * the original until a PR merges them back.
   */
  branch_id?: string;
  /** ID of the original node this was forked from (lineage traceability). */
  forked_from_node_id?: string;
  /** Task 3 (Part 2): skill reference inserted via @Skill (snapshot + pointer). */
  skillRef?: NodeSkillReference;
  /** Task 4 (Part 2): lightweight read-only habit reference. */
  habitNote?: HabitNote;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  isBrain?: boolean;
  /**
   * Optional — set when the conversation was started from a shared post
   * (PostCard "Send to followers" / "Share as your post" or Community
   * Invite / Message flows). The Messages page renders this as a
   * "battleground context" banner at the top of the chat so participants
   * can jump back to the originating post while the long-running
   * discussion evolves.
   */
  originPostId?: string;
  originPostSnippet?: string;
  originPostAuthor?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  type: "reply" | "mention" | "reaction" | "brain_run";
  actorName: string;
  content: string;
  postId?: string;
  read: boolean;
  createdAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorName: string;
  authorId?: string;
  content: string;
  reactions: Record<string, number>;
  createdAt: number;
  isConfidential?: boolean;
  isPinned?: boolean;
  depth?: number;
  editedAt?: number;
  isDeleted?: boolean;
  isOptimistic?: boolean;

  // ── Hive-Mind Engine V2 fields ──────────────────────────────────

  /**
   * Count of authenticated external hyperlinks included in the comment
   * body. Source links boost the comment's gravity rank and award the
   * author +1 reputation each.
   */
  sourceLinks?: number;

  /**
   * Upvote count. Reddit/Quora parity — the primary quality signal for
   * comment ranking. The gravity formula uses (upvotes - downvotes) as
   * the net score. Additive — old comments default to 0/0.
   */
  upvotes?: number;
  /**
   * Downvote count. Reddit/Quora parity — lets the community bury
   * misinformation. Combined with upvotes in the gravity formula.
   * Additive — old comments default to 0/0.
   */
  downvotes?: number;
  /**
   * Which way the current user voted (null = no vote, "up" = upvoted,
   * "down" = downvoted). Stored per-user in the comment's userReactions
   * map — this field is just a cache for the current viewer. Additive.
   */
  myVote?: "up" | "down" | null;

  /**
   * Reader classification votes — replaced the removed river author
   * self-selection. The community (not the author) classifies each
   * comment: "house" = institutional/verifiable evidence, "mouth" =
   * crowd sentiment / lived experience. Mutually exclusive.
   */
  houseVotes?: number;
  mouthVotes?: number;
  myHouseVote?: boolean;
  myMouthVote?: boolean;

  /**
   * Cached gravity-rank score. Recomputed by the rankComments function
   * on each render (not persisted) so the formula can evolve without
   * migrations. Stored here only when fossilized (see below).
   */
  rankScore?: number;

  /**
   * Set when this comment was "fossilized" into the 30-day Consensus
   * Summary Block — the top 3 highest-ranking comments per post that
   * have source links. Fossilized comments are immutable (no edit,
   * no delete) and rendered with a gold-bordered "Verified Community
   * Wiki" appearance at the crown of the post.
   */
  isFossilized?: boolean;

  /**
   * The author's topic-expertise score at the time of posting. Used
   * by the gravity formula: higher expertise → higher rank. Defaults
   * to 0 for new users (grows as they accumulate source-linked
   * comments and fossilizations).
   */
  userTopicScore?: number;
}

export interface NodeAttachment {
  type: "image" | "html" | "pdf";
  name: string;
  data: string;
  size: number;
}

export interface BrainData {
  brain: Brain;
  nodes: Node[];
}

export type PostType = "post" | "question" | "answer" | "note";

/**
 * Task 1 (Part 2): Note attachments — inline-visible content in a feed card.
 * Photo (data URL), text, or HTML snippet. Rendered as a RECTANGULAR card
 * (not circular story), content visible without tapping.
 */
export interface NoteAttachment {
  type: "photo" | "text" | "html";
  /** photo: data URL; text: raw text; html: sanitized HTML snippet */
  data: string;
  /** Optional caption shown below the inline content */
  caption?: string;
}

export interface PostEvent {
  title: string;
  startsAt: number;
  endsAt?: number;
  location?: string;
  communityId?: string;
  communityName?: string;
}

export interface Post {
  id: string;
  userId: string;
  topicId: string;
  title?: string; // Add title for Reddit-style posts
  tags?: string[]; // Add tags for flair
  content: string;
  postType?: PostType;
  questionDetails?: string;
  answeredPostId?: string;
  answeredQuestionTitle?: string;
  answeredQuestionAuthor?: string;
  communityId?: string;
  communityName?: string;
  /**
   * Room migration (Phase 1, additive): Room alias for `communityId`.
   * When set, readers prefer it; `communityId` remains the source of
   * truth for old records.
   */
  roomId?: string;
  event?: PostEvent;
  mediaUrls?: string[];
  brainId?: string; // Optional link to a brain
  reactions: Record<string, number>; // e.g. { "upvote": 10, "downvote": 1 }
  userReactions?: Record<string, string[]>; // e.g. { "upvote": ["user1"], "downvote": ["user2"] }
  commentCount: number;
  repostCount?: number;
  createdAt: number;
  authorName?: string;
  /**
   * @deprecated legacy field — NOT the vote source of truth. Display code
   * must use getPostUpvoteCount(post) (reactions.upvote / userReactions).
   * Reading this directly shows 0 for every post created by PostCreator
   * and drifts from the real count once users vote.
   */
  upvotes?: number;
  type?: PostType;

  /** Task 1 (Part 2): inline-visible attachments for "note" posts. */
  noteAttachments?: NoteAttachment[];

  // ── Brain Question Integration (Phase 2) ────────────────────────

  /**
   * When a question post has an attached Brain, the question owner can
   * mark it "solved" once they've merged useful answer branches into
   * the main Brain. The final Brain becomes the structured solution
   * record. Branches and contributors are preserved.
   */
  isSolved?: boolean;
  /**
   * Timestamp when the question was marked solved. Used for display
   * and for the Decision Trail timeline.
   */
  solvedAt?: number;
  /**
   * The ID of the Brain branch that was merged as the final solution
   * (if a specific branch was selected). The original Brain + all
   * branches are preserved regardless.
   */
  solvedBranchId?: string;

  /**
   * The author's topic-expertise score at the time of posting. Used by
   * the feed ranking to boost answers from experts (Quora-style quality
   * ranking). Defaults to 0 for new users.
   */
  userTopicScore?: number;

  /**
   * Who can edit this post after it's published. The author can always
   * edit their own post regardless of this setting.
   *
   * `public`             — anyone can propose edits (Reddit wiki style).
   *                        Edits go through a moderation queue before
   *                        going live (Phase 4 dispute workflow).
   * `verified-experts`   — only users with Phase 1 verification tier
   *                        >= "credential" can propose edits. Used for
   *                        technical/expert posts where domain knowledge
   *                        is required to edit safely.
   * `me-only`            — only the author can edit. Default for personal
   *                        posts and notes.
   *
   * Defaults to "me-only" when unset (backward-compatible — old posts
   * simply stay author-locked, which is the safest default).
   */
  editPolicy?: "public" | "verified-experts" | "me-only";

  // ── Room migration (Phase 6): Typed Deposits ───────────────────
  // All additive. Old posts simply have no deposit fields and render as
  // regular feed posts. A Deposit is a typed, versioned artifact that a
  // Room's Curators can promote into the Library (Phase 7).

  /**
   * The Deposit type, when this post is a typed artifact rather than a
   * freeform post/question/answer/note. Drives the structured fields
   * shown and how it can be promoted into the Library.
   */
  depositType?: "procedure" | "decision" | "evidence" | "case" | "question" | "synthesis";
  /**
   * Per-type optional structured fields (free-form key/value). e.g. a
   * "procedure" might carry { steps, prerequisites }, an "evidence" post
   * might carry { source, confidence }. Renderers read these when present.
   */
  depositFields?: Record<string, string>;
  /**
   * Provenance trail for a Deposit. All fields optional so old posts and
   * minimal deposits remain valid. `decayFlag` marks a Deposit whose
   * evidence has since been superseded (preserved for the Library record).
   */
  provenance?: {
    author?: string;
    roleAtTime?: string;
    source?: string;
    validationStatus?: "unverified" | "community-validated" | "superseded";
    version?: number;
    decayFlag?: boolean;
  };
}

/**
 * Room migration (Phase 7): a Library entry is a versioned synthesis of one or
 * more Deposits, curated by a Room's Curators and signed off by the Steward.
 * Dissent is preserved as data (never dropped) so the record stays honest.
 * Additive — the `library_entries` store is created fresh in DB v21; old
 * installs simply have an empty Library.
 */
export interface LibraryEntry {
  id: string;
  roomId: string;
  /** Deposit Post ids that were synthesized into this entry. */
  depositIds: string[];
  title: string;
  summary: string;
  /** Version of this synthesis (increments on re-synthesis). */
  version: number;
  /** userId of the Curator who promoted the Deposits. */
  curatedBy?: string;
  /** userId of the Steward who signed off (optional until signed). */
  signedBy?: string;
  /** Preserved dissent — counter-arguments that were NOT merged. */
  dissent?: string;
  /** Whether the synthesis is still considered current. */
  superseded?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Keeps posts created before the vote UI update readable while new posts use
 * the explicit upvote/downvote keys.
 */
export function getPostUpvoteCount(post: Post): number {
  if (typeof post.reactions?.upvote === "number") return post.reactions.upvote;
  return (post.reactions?.like || 0) + (post.reactions?.love || 0);
}

export function getPostDownvoteCount(post: Post): number {
  return post.reactions?.downvote || 0;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  followerCount: number;
  isFollowed?: boolean;
  order?: number;
  category?: string;
}

export type MissionCategory = "Financial" | "Health" | "Learning" | "Business" | "Creativity" | "Discipline" | "Relationships" | "Other";

/** Attachment slot on a mission — either a brain or an external link. */
export interface MissionAttachment {
  type: "brain" | "link";
  /** When type === "brain" */
  brainId?: string;
  brainTitle?: string;
  /** When type === "link" */
  url?: string;
  label?: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  status: "active" | "completed" | "paused";
  targetDate?: number;
  progress: number; // 0-100
  xpReward: number;
  courseId?: string; // Links to a course if it is part of one
  createdAt: number;
  /** When true, the mission auto-resets daily and XP is re-granted each day it's completed. */
  repeatsDaily?: boolean;
  /** Last date (YYYY-MM-DD) the daily mission was reset/completed. */
  lastDailyReset?: string;
  /** Optional attached resource — either a brain or an external link. */
  attachment?: MissionAttachment;
}
export interface Milestone {
  id: string;
  missionId: string;
  title: string;
  completed: boolean;
  completedAt?: number;
  order: number;
  notes?: string;
  /** Task 4 (Part 2): ID of the habit attached to this milestone. */
  habitId?: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  authorId: string;
  totalLevels: number;
  enrolled: boolean;
  progress: number; // 0-100
  createdAt: number;
}

export interface Level {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
  isUnlocked: boolean;
  isCompleted: boolean;
}

export interface Quiz {
  id: string;
  levelId: string;
  title: string;
  timeLimitSeconds?: number;
  minScoreToPass: number; // 0-100
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  order: number;
}

export interface Reputation {
  id: "me";
  xp: number;
  level: number; // 1-100, calculated from xp
  streak: number; // consecutive active days
  lastActiveDate: string; // ISO date string YYYY-MM-DD
  totalMissionsCompleted: number;
  totalBrainsCreated: number;
  totalCheckIns: number;
  badges: string[];
}
export interface XPEvent {
  id: string;
  type: "mission_created" | "milestone_completed" | "mission_completed" | "brain_created" | "check_in" | "post_created" | "comment" | "brain_shared" | "vote_bonus";
  xpGained: number;
  description: string;
  createdAt: number;
}
export interface CircleCheckIn {
  id: string;
  circleId: string;
  userId: string;
  message: string;
  moodScore: number; // 1-5
  createdAt: number;
  upvotes?: number;
  downvotes?: number;
  /**
   * Current viewer's vote state — replaces the old always-increment
   * buttons (every tap was +1, up/down stacked, no un-vote). Toggle
   * semantics via toggleCheckinVote: mutual exclusion, click the active
   * vote again to remove it.
   */
  myUpvote?: boolean;
  myDownvote?: boolean;
  replies?: { id: string; userId: string; content: string; createdAt: number }[];
  linkedBrainId?: string;
  /**
   * Room migration (Phase 1, additive): Room alias for `circleId`. When
   * set, readers prefer it; `circleId` remains the source of truth for
   * old records. New check-ins keep writing `circleId` (the community
   * id) so the checkin → PostCard path is unchanged.
   */
  roomId?: string;
}
export interface Pathway {
  id: string;
  title: string;
  description: string;
  category: string;
  brainIds: string[]; // ordered list of brain IDs in this pathway
  forkedFromId?: string;
  authorId: string;
  forkCount: number;
  createdAt: number;
  /**
   * Milestones for this pathway. Additive — old pathways simply have
   * no milestones and render unchanged. Each milestone can be renamed,
   * have a brain link or daily cognitive scenario attached, and be
   * marked complete. See PathwayMilestone.
   */
  milestones?: PathwayMilestone[];
}

/**
 * A milestone inside a pathway. The user explicitly asked for:
 *  - rename after naming (title is mutable)
 *  - attach brain link OR daily cognitive scenario (linkedBrainId / cognitiveScenario)
 *  - mark complete after successful completion (completed + completedAt)
 *
 * Stored as part of the parent Pathway record (no separate store) so
 * reading a pathway also reads its milestones atomically.
 */
export interface PathwayMilestone {
  id: string;
  title: string;
  description?: string;
  /** Ordered position in the pathway (0-indexed). */
  order: number;
  /** Optional brain linked to this milestone for structured decision support. */
  linkedBrainId?: string;
  /**
   * Optional "daily cognitive scenario" — a short prompt the user practices
   * daily to internalise the milestone's skill. Free text, max 500 chars.
   */
  cognitiveScenario?: string;
  /** Completion state. */
  completed: boolean;
  completedAt?: number;
  /** Free-text notes the user adds when completing the milestone. */
  completionNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  image?: string;
  memberCount: number;
  /** Whether the circle is currently active (shown in the Community page). */
  active?: boolean;
  /** Legacy icon identifier (e.g. "shield", "stethoscope"). Kept for
   *  backward compatibility with seeded data. */
  icon?: string;
  isJoined?: boolean;
  /** B: membership state — drives the join/leave/request flow. */
  joinStatus?: "not_member" | "member" | "pending" | "restricted";
  /** When joinStatus is "pending" — timestamp the request was submitted. */
  joinRequestedAt?: number;
  checkInCount?: number;
  weeklyGoal?: string;
  memberNames?: string[];
  /**
   * Extended fields collected by CreateCircleDialog. All optional — old
   * communities simply have no values and render unchanged. These drive
   * the "Civilization Circles" feature on the Community page.
   */
  category?: string;
  tags?: string[];
  language?: string;
  location?: string;
  privacy?: "public" | "restricted" | "private";
  allowMature?: boolean;
  coverImage?: string;
  /**
   * Room migration (Phase 1, additive): the Room's charter. `mission` is
   * the one-sentence mission ("Find a functional cure for HIV"); `scope`
   * is the boundary of what the Room covers. Old circles have no charter
   * and render `description` as before.
   */
  charter?: { mission: string; scope: string };
  /**
   * Room migration (Phase 1, additive): Room visibility vocabulary.
   * Derived from `privacy` at read time when unset:
   * public → open, restricted → gated, private → sealed (label only).
   */
  visibility?: "open" | "gated" | "sealed";
  /**
   * Room migration (Phase 1, additive): the current user's role in this
   * Room. Derived as "contributor" when `joinStatus === "member"` and no
   * role is stored. One steward per Room; curators and observers are
   * assigned by the steward (Phase 5).
   */
  role?: "steward" | "curator" | "contributor" | "observer";
  /** Room migration (Phase 1, additive): userId of the creator. Set by
   *  CreateCircleDialog so stewardship can be assigned on creation. */
  createdBy?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  /** Task 13: cover/banner image URL for the profile header. */
  coverUrl?: string;
  followerCount: number;
  followingCount: number;
  pinnedDetails?: string;
  category?: "Blogger" | "Political Figure" | "Creator" | "Artist" | "Business" | "Developer" | "Student" | "Researcher" | "Public Figure" | "Personal" | "Other";
  personalDetails?: {
    location?: string;
    birthday?: string;
    gender?: string;
    languages?: string[];
    websiteLinks?: string[];
    socialLinks?: string[];
  };
  family?: {
    spouse?: string;
    parents?: string[];
    children?: string[];
    siblings?: string[];
  };
  tags?: {
    pets?: string[];
    sports?: string[];
    movies?: string[];
    instruments?: string[];
  };
  bookmarkedPostIds?: string[];
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
}

export interface Board {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
}

export interface Pin {
  id: string;
  boardId: string;
  postId: string;
  ownerId: string;
  createdAt: number;
}

export interface BrainDNA {
  id: string;
  brainId: string;
  parentBrainId?: string;
  childBrainIds: string[];
  linkedBrainIds: string[];
}

export interface LibraryBook {
  id: string;
  title: string;
  story: string;
  imageUrl?: string;
  status: 'Draft' | 'Under Review' | 'Published';
  createdAt: number;
}

export interface Story {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  type: "note" | "media";
  content?: string;
  mediaUrl?: string;
  /**
   * "video" when mediaUrl is a video clip (silent muted preview in the
   * tray, controls + sound in the fullscreen viewer). Optional + additive —
   * old stories without it are treated as images.
   */
  mediaType?: "image" | "video";
  brainId?: string;
  createdAt: number;
  expiresAt: number;
  isViewed?: boolean;
  /**
   * Optional attachments for notes — pictures, files, or HTML snippets.
   * Each attachment is a small object so the storage format stays simple
   * (plain JSON in IDB, no blobs). Images are stored as data URLs (under
   * 1MB); files and HTML are referenced by URL or stored inline.
   *
   * Additive — old stories simply have no attachments and render unchanged.
   */
  attachments?: StoryAttachment[];
}

export interface StoryAttachment {
  id: string;
  /** "video" is additive — a small muted preview plays in the story tray. */
  kind: "image" | "file" | "html" | "video" | "link" | "text";
  /** Data URL (image) or external URL (file/html). */
  url: string;
  /** Original filename for files, or title for HTML snippets. */
  name?: string;
  /** MIME type for files (e.g. "application/pdf"). */
  mimeType?: string;
  /** Size in bytes (for files). */
  sizeBytes?: number;
  /** For HTML snippets — the raw HTML content (sanitized on render). */
  html?: string;
  createdAt: number;
}

// ── Phase 2: Brain Question Integration ─────────────────────────

/**
 * The standard structured sections a question Brain can have.
 * Each section is optional — incomplete sections are shown as "—"
 * and the system NEVER invents missing information.
 */
export const BRAIN_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "problem", label: "Problem" },
  { key: "context", label: "Context" },
  { key: "goals", label: "Goals" },
  { key: "constraints", label: "Constraints" },
  { key: "known_facts", label: "Known Facts" },
  { key: "assumptions", label: "Assumptions" },
  { key: "evidence", label: "Evidence" },
  { key: "existing_ideas", label: "Existing Ideas" },
  { key: "proposed_solutions", label: "Proposed Solutions" },
  { key: "unknowns", label: "Unknowns" },
  { key: "questions", label: "Questions" },
  { key: "decisions", label: "Decisions" },
  { key: "resources", label: "Resources" },
  { key: "data", label: "Data" },
  { key: "conclusions", label: "Conclusions" },
];

/**
 * Structured sections of a Brain attached to a question. Each section
 * can be complete (has content) or incomplete (shown as "—").
 * The system NEVER invents missing information.
 */
export interface BrainSection {
  key: string;
  label: string;
  content: string | null; // null = incomplete, not yet filled
  lastEditedAt?: number;
  lastEditedBy?: string;
}

/**
 * A Brain branch created by an answerer. Preserves the relationship
 * to the original question Brain. The existing use-brain-repo hook
 * already has createBranch/switchBranch/deleteBranch — this type
 * extends the concept with attribution for the question workflow.
 */
export interface BrainContribution {
  id: string;
  brainId: string;
  branchId: string;
  contributorId: string;
  contributorName: string;
  postId: string; // the question post this contribution belongs to
  createdAt: number;
  changedSections: string[]; // which BrainSection keys were modified
  summary: string; // brief description of what the branch changes
  status: "proposed" | "reviewing" | "merged" | "rejected";
}

// ── Phase 4: Bookmark Collections ───────────────────────────────

export type CollectionVisibility = "private" | "selected" | "circle" | "public";
export type CollectionPermission = "viewer" | "contributor" | "editor" | "owner";

export interface BookmarkCollection {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  visibility: CollectionVisibility;
  createdAt: number;
  updatedAt: number;
  items: BookmarkItem[];
  collaborators?: Array<{
    userId: string;
    permission: CollectionPermission;
  }>;
}

export interface BookmarkItem {
  id: string;
  collectionId: string;
  postId: string;
  savedAt: number;
  savedBy: string;
  note?: string; // "Why saved: ..."
}

// ── Phase 6: Knowledge Artifacts + Decision Trails ──────────────

export interface KnowledgeArtifact {
  id: string;
  postId?: string; // optional link to the social post it originated from
  authorId: string;
  authorName: string;
  title: string;
  problem?: string;
  proposedSolution?: string;
  framework?: string;
  evidence?: string;
  data?: string;
  implementationNotes?: string;
  context?: string;
  outcome?: string;
  relatedBrainId?: string;
  relatedDecisionTrailId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DecisionTrail {
  id: string;
  title: string;
  problem: string;
  optionsConsidered?: string[];
  evidenceConsulted?: string[];
  brainBranchesConsidered?: string[];
  knowledgeArtifactIds?: string[];
  finalDecision?: string;
  decisionRationale?: string;
  implementation?: string;
  outcome?: string; // "Outcome not yet recorded" if empty
  relatedBrainId?: string;
  relatedPostId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ── Phase 8: Impact + Resonance + Milestones ────────────────────

export interface ImpactNode {
  id: string;
  fromUserId: string;
  toUserId?: string;
  type: "contributor" | "idea" | "decision" | "project" | "beneficiary";
  description: string;
  evidenceType: "user_confirmation" | "project_record" | "deployment_record" | "community_confirmation" | "verified_artifact" | "system_activity";
  evidenceId?: string;
  createdAt: number;
}

export interface ResonanceScore {
  userId: string;
  score: number;
  signals: {
    ideasReused: number;
    brainSolutionsAdapted: number;
    artifactsImplemented: number;
    projectsInfluenced: number;
    documentedOutcomes: number;
    independentConfirmations: number;
  };
  updatedAt: number;
}

export interface TransformationMilestone {
  id: string;
  userId: string;
  title: string;
  description: string;
  criteria: string;
  evidenceIds: string[];
  verificationStatus: "unverified" | "self-reported" | "peer-verified" | "system-verified";
  dateAchieved?: number;
  createdAt: number;
}

// ── Phase 9: Identity Engine ────────────────────────────────────

export interface ExpertHandle {
  handle: string; // e.g. "ke.nbo.ai.isaac.r1"
  country: string;
  city?: string;
  domain: string;
  nameStem: string;
  disambiguator: string;
  G: string; // "?" if no authorized genetic data
  B: number; // interaction preference score (user-selected, not clinical)
  S: number; // profile confidence / data consistency
  fullId: string; // "ke.nbo.ai.isaac.r1#G?.B70.S82"
}

// ── Phase 1 (Trust Layer): verification tiers, identity proofs, badges ───
// All fields are OPTIONAL on existing records — old posts/topics/profiles
// continue to render unchanged. Verification state lives in its own store,
// not on the user record, so no migration is needed for existing users.

/**
 * Three verification tiers. Higher tier = stronger evidence of identity.
 * Tiers are monotonic: a credential-verified user is also identity-verified.
 *
 * `anonymous`    — default. No claim of identity. Content still allowed but
 *                  ranks below verified content in confidence calculations.
 * `identity`     — a human-proof check (see IdentityProofType) links this
 *                  account to a unique human without revealing who.
 * `credential`   — a verifiable credential (see CredentialField) is attached.
 *                  This is the strongest tier and unlocks the "Expert" badge.
 */
export type VerificationTier = "anonymous" | "identity" | "credential";

/** Supported human-proof checks. Each is independent; any one is sufficient. */
export type IdentityProofType =
  | "device-attestation" // WebAuthn / Play Integrity / App Attest
  | "phone-otp"          // SMS OTP (weakest, but lowest friction)
  | "email-otp"          // Email OTP
  | "webauthn-passkey"   // Strongest device-bound proof
  | "persona-check";     // Liveness + government-ID via third party

/** A credential attached to a `credential`-tier verification. */
export interface CredentialField {
  /** e.g. "MD", "PhD", "PE", "JD", "CFA", "AWS Solutions Architect" */
  label: string;
  /** Issuing org, e.g. "Kenya Medical Practitioners Council" */
  issuer: string;
  /** Free-text scope, e.g. "Internal Medicine, KNH 2018-2024" */
  scope?: string;
  /** Optional verification URL (issuer's public registry) */
  verificationUrl?: string;
  /** SHA-256 of the supporting document, if one was uploaded */
  documentHash?: string;
  /** Year the credential was granted */
  year?: number;
}

/**
 * A single piece of evidence linking a user to a unique human.
 * Stored in `identity_proofs` store. Multiple proofs per user are allowed;
 * the strongest one decides the user's effective tier.
 */
export interface IdentityProof {
  id: string;
  userId: string;
  type: IdentityProofType;
  /** "pending" while the user is solving the challenge, "verified" once proof
   *  succeeded, "revoked" if the user later removes it or it expires. */
  status: "pending" | "verified" | "revoked";
  /** Tier this proof grants if verified. */
  grantsTier: VerificationTier;
  /** Type-specific payload. phone-otp → { country, redactedNumber }. */
  payload: Record<string, string | number | boolean>;
  /** Stable hash of the verified artifact (e.g. attestation object) so we can
   *  detect re-use across accounts without storing PII. */
  proofHash?: string;
  /** When this proof was verified. */
  verifiedAt?: number;
  /** Proofs auto-expire after this many ms (default 365 days). */
  expiresAt?: number;
  createdAt: number;
}

/**
 * The full verification record for a user. One row per user. Stored in
 * `verification_records` store. Updated whenever a proof is added/revoked.
 */
export interface VerificationRecord {
  userId: string;
  /** Effective tier — the highest tier among non-expired verified proofs. */
  tier: VerificationTier;
  /** Tier history for auditability. Append-only. */
  tierHistory: {
    from: VerificationTier;
    to: VerificationTier;
    reason: string;
    at: number;
  }[];
  /** Credentials (only present at `credential` tier). */
  credentials: CredentialField[];
  /** IDs of all proofs (verified, pending, revoked) for this user. */
  proofIds: string[];
  /** Public display name shown on the verification page. */
  displayName?: string;
  /** Public bio shown on the verification page (max 280 chars). */
  publicBio?: string;
  updatedAt: number;
}

/** Visible badge shown next to a contributor's name. Derived from tier. */
export type VerificationBadgeKind =
  | "anonymous"
  | "identity-verified"
  | "expert"
  | "issue-curator"; // reserved for Phase 4 dispute curators

export interface VerificationBadge {
  kind: VerificationBadgeKind;
  tier: VerificationTier;
  label: string;
  /** Tailwind classes for the badge dot. */
  color: string;
  /** Tooltip shown on hover. */
  explanation: string;
}

// ── Phase 1.5: Brain Drain Core ──────────────────────────────────
// The lifelong timeline of captured expertise. A DrainEntry is the atomic
// unit of "drained brain" — one idea, technique, secret, or mentorship
// lesson that an expert poured out of their head and into the platform.
//
// Design principle: every field is OPTIONAL on existing records. Old
// posts/comments/brains continue to render unchanged. A DrainEntry is a
// NEW kind of record that REFERENCES existing entities, never replaces
// them. This keeps the migration safe.

/**
 * Three skill ranks. Self-assessed AND peer-validated (see SkillValidation).
 * A user can be at different tiers in different skills — "expert cook,
 * professional programmer, beginner carpenter". The tier is per-skill.
 *
 * `beginner`     — actively learning, contributing questions + attempts.
 * `professional` — produces working solutions, contributes techniques.
 * `expert`       — owns secrets not found elsewhere (the "worth more
 *                  than gold" tier). Peer validation required.
 */
export type SkillTier = "beginner" | "professional" | "expert";

/**
 * How a SkillTier was established. A tier is only as strong as its
 * strongest validation. `self-claimed` alone never grants `expert`.
 *
 * `self-claimed`  — the user said so. Worth 1 point.
 * `peer-verified` — 3+ professionals/experts in the same skill vouched.
 *                   Worth 3 points.
 * `credential-linked` — tied to a CredentialField from Phase 1 (e.g. a
 *                   real MD or PE). Worth 5 points, but only if the
 *                   credential's scope matches the skill.
 * `outcome-proven` — apprentices who drank from this user's brain and
 *                   then achieved professional/expert tier themselves.
 *                   Worth 10 points — the strongest possible signal.
 *                   Tracked in Phase 3 (DrinkLog).
 */
export type SkillValidationSource =
  | "self-claimed"
  | "peer-verified"
  | "credential-linked"
  | "outcome-proven";

export interface SkillValidation {
  source: SkillValidationSource;
  /** Skill domain, e.g. "cooking", "surgery", "agile-coaching". */
  skill: string;
  /** Tier this validation supports. */
  tier: SkillTier;
  /** Who vouched (for peer-verified) or which apprentice (for outcome-proven). */
  witnesses?: string[];
  /** When the validation was recorded. */
  at: number;
  /** Optional note (e.g. "KNH 2018-2024 internal medicine"). */
  note?: string;
}

/**
 * Legacy status of a brain's owner. Drives the drink permissions.
 *
 * `alive`              — owner is alive. Brain is private unless they
 *                       explicitly license entries. Apprentices drink
 *                       only with permission.
 * `deceased-unverified`— someone reported the owner deceased. We require
 *                       2 independent confirmations (obituary URL +
 *                       verified human proof) before transitioning.
 * `deceased-verified`  — owner confirmed deceased. Brain transitions
 *                       according to their BrainWill (default: private
 *                       for 12 months, then licensed-public).
 * `legacy-unlocked`    — brain is now drinkable by anyone, according to
 *                       the will's license terms. This is the "worth
 *                       more than gold" state — the secrets are now
 *                       available to the next generation.
 */
export type LegacyStatus =
  | "alive"
  | "deceased-unverified"
  | "deceased-verified"
  | "legacy-unlocked";

// ═══════════════════════════════════════════════════════════════════════════
// Part 2 — Skill Store + Habits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Task 5/8/9 (Part 2): a single step in a Skill.
 * Every step follows the authoring convention: Action + Tool + Why + Error-if-skipped.
 * The Yes/No outcome paths (Task 9) are encoded as `yesOutcome` / `noOutcome`.
 */
export interface SkillStep {
  /** 1-indexed step number (matches the "Step 1, Step 2…" authoring convention). */
  order: number;
  /** What to do, e.g. "Loosen lug nuts before jacking the car." */
  action: string;
  /** Required tool, e.g. "21mm spanner". May be empty for non-tool steps. */
  tool?: string;
  /** Why this step matters, e.g. "If the wheel isn't loosened first…" */
  why: string;
  /** Safety warning / consequence if skipped, e.g. "wheel spins / accident risk". */
  errorIfSkipped?: string;
  /** Task 9: Yes outcome path — what happens if the step succeeds. */
  yesOutcome?: string;
  /** Task 9: No outcome path — what happens if the step fails/can't be done. */
  noOutcome?: string;
  /** Mandatory keywords/tags this step contributes when inserted via @Skill (Task 7). */
  keywords?: string[];
}

/**
 * Task 5/8 (Part 2): a Skill store entry.
 * Generated FROM an already-built brain, stays private, goes through review,
 * gets published to the public skill store. Stays traceable to its source brain.
 */
export interface SkillEntry {
  /** Task 5: structured auto-generated ID, e.g. AUTO-TOYOTA-COROLLA-2015-FRONT_BRAKE-v01 */
  id: string;
  /** Source domain, e.g. "AUTO", "MEDICAL", "COOKING". */
  domain: string;
  /** Make/manufacturer/author, e.g. "TOYOTA". */
  make?: string;
  /** Model, e.g. "COROLLA". */
  model?: string;
  /** Year, e.g. 2015. */
  year?: number;
  /** Part/subsystem, e.g. "FRONT_BRAKE". */
  part?: string;
  /** Version, e.g. "v01". */
  version: string;
  /** Human-readable title, e.g. "Toyota Corolla 2015 Front Brake Pad Replacement". */
  title: string;
  /** Attribution: source expert name. */
  authorName: string;
  /** Attribution: years of experience. */
  authorYearsExperience?: number;
  /** The numbered steps. */
  steps: SkillStep[];
  /** ID of the brain this skill was generated from (lineage, Task 8). */
  sourceBrainId?: string;
  /** Publishing status (Task 8). */
  status: "private" | "in_review" | "published";
  /** Reviewer who approved (Task 8 — PR-style review). */
  reviewerId?: string;
  /** When published. */
  publishedAt?: number;
  /** When created. */
  createdAt: number;
}

/**
 * Task 3 (Part 2): a skill reference embedded in a brain node.
 * Stores BOTH a copied snapshot (so the brain works standalone — npm install model)
 * AND a reference pointer back to the source skill (for "Update to latest version").
 */
export interface NodeSkillReference {
  /** ID of the source skill. */
  skillId: string;
  /** Version of the skill that was copied in. */
  version: string;
  /** Title of the skill at copy time (snapshot). */
  title: string;
  /** Copied step data (snapshot — brain works standalone, not live-synced). */
  steps: SkillStep[];
  /** When the skill was inserted. */
  insertedAt: number;
}

/**
 * Task 4 (Part 2): a Habit. Stored SEPARATELY from brain nodes (never inside
 * nodes — that risks the habit being overwritten when the brain is edited).
 * Attached to a Milestone; the milestone's progress is driven by the habit's
 * tracked completion/streak.
 */
export interface Habit {
  id: string;
  /** The new routine being installed (user fills this in). */
  newRoutine: string;
  /** The existing anchor habit that acts as the cue/trigger. */
  anchorHabit: string;
  /** Whether the new routine comes before or after the anchor. */
  timing: "before" | "after";
  /** The reward that reinforces the new routine immediately after. */
  reward: string;
  /** The topic the habit is filed under (matched from the brain's headline). */
  topic: string;
  /** ID of the milestone this habit is attached to. */
  milestoneId?: string;
  /** ID of the mission this habit's milestone belongs to. */
  missionId?: string;
  /** Completion log — array of ISO date strings (YYYY-MM-DD) the habit was done. */
  completionLog: string[];
  /** Target streak for auto-completing the milestone. */
  targetStreak: number;
  /** Author info — set when the habit is synced to Supabase for cross-user recall. */
  authorId?: string;
  authorName?: string;
  /** Lifecycle: private (local only) → in_review → published (synced to Supabase). */
  status?: "private" | "in_review" | "published";
  reviewerId?: string;
  publishedAt?: number;
  createdAt: number;
}

/** Task 4: a lightweight, non-editable reference shown in the brain editor. */
export interface HabitNote {
  habitId: string;
  /** Snapshot of the habit summary shown in the brain (read-only). */
  summary: string;
}

/**
 * The atomic unit of drained expertise. One idea, technique, secret,
 * or mentorship lesson. Stored in `drain_entries` store.
 *
 * A DrainEntry is NOT a post. A post is a public Q&A artifact. A drain
 * entry is a piece of the expert's brain, captured forever. An expert
 * can write a drain entry privately (legacy-gated) without ever posting
 * it publicly — it only becomes drinkable when they die or explicitly
 * license it.
 */
export interface DrainEntry {
  id: string;
  /** The brain this entry belongs to (one brain per expert per skill). */
  brainId: string;
  /** The expert who drained this entry. */
  userId: string;
  /** Skill domain, e.g. "cooking", "surgery". */
  skill: string;
  /** The expert's tier in this skill at the time of draining. */
  tierAtDrain: SkillTier;

  /** Short title — what technique/secret is this? Max 120 chars. */
  title: string;
  /** The drained knowledge itself. Markdown. Max 10000 chars. */
  body: string;

  /**
   * Visibility. `private` = only the expert can see it until legacy-unlock.
   * `licensed` = drinkable now under the chosen license. `legacy-gated` =
   * private now, drinkable when the expert dies (default).
   */
  visibility: "private" | "legacy-gated" | "licensed";

  /** License choice (only meaningful when visibility !== "private"). */
  license?: DrainLicense;

  /** Optional: post/comment that triggered this drain (provenance link). */
  sourcePostId?: string;
  sourceCommentId?: string;

  /** Optional: mentorship context — "I taught this to N apprentices". */
  mentorshipNote?: string;

  /** Tags for searchability. Max 10 tags, each max 40 chars. */
  tags?: string[];

  /** When the entry was drained. */
  createdAt: number;
  /** Last edit time. Every edit creates a hash in the provenance chain (Phase 2). */
  editedAt?: number;
  /** Soft-delete marker. Never hard-delete — provenance must survive. */
  deletedAt?: number;
}

/**
 * License choices for a drain entry. Default is `proprietary` (no one can
 * drink without explicit per-apprentice permission). AI lab licensing is
 * handled in Phase 6.
 *
 * `proprietary`  — all rights reserved. Drink only with explicit grant.
 * `cc-by-nc`     — drinkable for personal learning, not for commercial AI training.
 * `cc-by-sa`     — drinkable, including commercially, but derivatives must share-alike.
 * `cc0`          — public domain. Anyone, including AI labs, can drink freely.
 * `apprentice-only` — drinkable only by users on an active apprenticeship path (Phase 3).
 */
export type DrainLicense =
  | "proprietary"
  | "cc-by-nc"
  | "cc-by-sa"
  | "cc0"
  | "apprentice-only";

/**
 * A brain's will — what happens to the drained brain when the expert dies.
 * Stored in `brain_wills` store (one per brain).
 */
export interface BrainWill {
  brainId: string;
  /** Current legacy status of the brain's owner. */
  legacyStatus: LegacyStatus;

  /**
   * What happens on confirmed death.
   * `private-forever` — brain dies with the owner. Used for entries the
   *                     expert never wanted shared (e.g. patient stories).
   * `delayed-unlock`  — private for N months, then legacy-unlocked.
   *                     Default: 12 months. Gives family time to grieve.
   * `immediate-unlock` — legacy-unlocked on confirmed death.
   * `heir-designated`  — passed to a designated heir (another verified user).
   */
  onDeath: "private-forever" | "delayed-unlock" | "immediate-unlock" | "heir-designated";
  /** Months of delay when onDeath === "delayed-unlock". Default 12. */
  unlockDelayMonths?: number;
  /** User ID of the designated heir, when onDeath === "heir-designated". */
  heirUserId?: string;

  /** Default license applied to all entries when the brain unlocks. */
  defaultLicenseOnUnlock: DrainLicense;

  /** Death confirmations — need 2 independent sources to transition. */
  deathConfirmations: DeathConfirmation[];

  /** When the will was last updated. */
  updatedAt: number;
}

export interface DeathConfirmation {
  /** Who confirmed — userId of the verifier (must be tier >= professional). */
  verifierUserId: string;
  /** Public obituary or news article URL. */
  sourceUrl: string;
  /** SHA-256 hash of the source page (Phase 2) so we can detect later edits. */
  sourceHash?: string;
  /** Free-text note. */
  note?: string;
  at: number;
}

/**
 * Drain completeness — how much of the expert's full expertise has been
 * captured. Computed from drain entry count, recency, diversity, and
 * peer-validation depth. 0-100%.
 *
 * This is the headline metric on every expert's profile. It answers
 * "how much of this genius have we actually saved before they die?"
 */
export interface DrainCompleteness {
  brainId: string;
  /** 0-100. */
  score: number;
  /** Breakdown of the score for transparency. */
  components: {
    /** More entries → higher score (logarithmic, capped). */
    volumePoints: number;
    /** Entries drained recently (last 90 days) → bonus. */
    recencyPoints: number;
    /** Entries across multiple sub-skills → bonus. */
    diversityPoints: number;
    /** Entries peer-verified or outcome-proven → bonus. */
    depthPoints: number;
  };
  /** Total entry count (excluding soft-deleted). */
  entryCount: number;
  /** Distinct sub-skills touched. */
  skillCount: number;
  /** Last drain timestamp. */
  lastDrainAt: number | null;
  computedAt: number;
}

/**
 * A read model for the lifelong timeline view (the "Facebook timeline
 * but for expertise" the user described). Not stored — computed on read
 * from drain_entries + brain_wills.
 */
export interface BrainTimelineEntry {
  drainEntry: DrainEntry;
  /** Whether this entry is currently drinkable by the requesting user. */
  drinkable: boolean;
  /** Why it is or isn't drinkable. */
  drinkReason: string;
  /** Legacy status of the brain at this point in the timeline. */
  legacyStatusAtEntry: LegacyStatus;
}

export interface BrainTimeline {
  brainId: string;
  ownerUserId: string;
  ownerTier: SkillTier;
  skill: string;
  legacyStatus: LegacyStatus;
  completeness: DrainCompleteness;
  entries: BrainTimelineEntry[];
}

// ── Phase 2: Provenance Ledger ───────────────────────────────────
// Every drain entry (the atomic unit of expertise from Phase 1.5) gets
// a SHA-256 hash. Edits chain hashes so any tampering is detectable.
// A public /verify/:recordId SSR page proves "this secret really came
// from this expert at this time, and here's the chain of custody for
// every edit."

/**
 * The kind of record a provenance entry covers. Drains are the primary
 * case (they're the "worth more than gold" data), but we also hash
 * posts + comments + brain nodes so the whole content graph is
 * tamper-evident.
 */
export type ProvenanceRecordKind =
  | "drain-entry"
  | "post"
  | "comment"
  | "brain-node"
  | "brain-will"
  | "verification-record";

/**
 * One link in the provenance chain. Stored in `provenance_chain`. Each
 * link covers ONE version of ONE record:
 *  - recordId       — the ID of the record this link covers
 *  - kind           — what type of record (drain-entry / post / etc.)
 *  - version        — monotonic per-record version counter (1, 2, 3…)
 *  - contentHash    — SHA-256 of the canonical JSON of the record body
 *  - prevHash       — the contentHash of the PREVIOUS version of this
 *                     record (empty string for v1). This is what makes
 *                     the chain tamper-evident: changing any historical
 *                     version breaks every subsequent prevHash.
 *  - chainHash      — SHA-256 of (prevHash + contentHash + version +
 *                     recordId). This is the "block hash" — changing
 *                     anything in this link or any prior link changes
 *                     every subsequent chainHash.
 *  - authorId       — who created this version
 *  - authorName     — display name at time of signing (for the public
 *                     verify page; not used for trust — the hash is)
 *  - editReason     — free-text note ("fixed typo", "added citation")
 *  - signedAt       — when this version was sealed
 *
 * The chain is per-record (each record has its own chain of versions),
 * NOT a single global chain. This is deliberate: a global chain would
 * make every edit depend on every other edit's ordering, which is
 * fragile under concurrent writes. Per-record chains are easy to
 * verify independently and still tamper-evident.
 */
export interface ProvenanceRecord {
  id: string; // = `${recordId}#v${version}` for easy lookup
  recordId: string;
  kind: ProvenanceRecordKind;
  version: number; // 1-indexed
  contentHash: string; // 64-char lowercase hex SHA-256
  prevHash: string; // 64-char hex, or "" for v1
  chainHash: string; // 64-char hex
  authorId: string;
  authorName?: string;
  editReason?: string;
  signedAt: number;
}

/**
 * A compact edit-history entry for UI rendering. Derived from the
 * provenance chain — not a separate source of truth. Stored in
 * `edit_history` as a denormalised read model so the UI can render
 * an edit timeline without re-deriving it from the chain every time.
 */
export interface EditHistoryEntry {
  id: string;
  recordId: string;
  kind: ProvenanceRecordKind;
  version: number;
  authorId: string;
  authorName?: string;
  editReason?: string;
  contentHash: string;
  /** Whether this version is the current (latest) one. */
  isCurrent: boolean;
  signedAt: number;
}

/**
 * The result of verifying a record's provenance chain. Returned by
 * verifyChain() and surfaced on the /verify/:recordId SSR page.
 */
export interface ChainVerificationResult {
  recordId: string;
  /** True if every link's chainHash matches the recomputed value. */
  valid: boolean;
  /** The first broken link (if any). Undefined when valid=true. */
  brokenAtVersion?: number;
  /** Human-readable explanation of the result. */
  explanation: string;
  /** Total versions in the chain. */
  versionCount: number;
  /** The current (latest) version number. */
  currentVersion: number;
  /** The current content hash. */
  currentContentHash: string;
  /** When the chain was first created (v1 signedAt). */
  createdAt: number;
  /** When the current version was sealed. */
  updatedAt: number;
}

// ── Phase 3: Confidence Score per answer ─────────────────────────
// Replaces the impossible "100% accuracy" claim with evidence-based
// confidence. Every answer gets a 0-100 score computed from:
//   - independent confirmations (other verified users who agree)
//   - citations (source links the answer cites)
//   - contributor reputation (Phase 1 verification tier + Phase 1.5 skill tier)
//   - disputes (open corrections subtract)
//   - provenance bonus (Phase 2 hash chain intact = small bonus)
//
// The score is NEVER presented as "accuracy". It is always shown with
// its component breakdown so the reader can see WHY the confidence is
// what it is, and weigh the evidence themselves.

/**
 * The components that feed into a ConfidenceScore. Each is a 0-N raw
 * value plus a 0-100 normalised contribution. The final score is the
 * weighted sum of the normalised contributions.
 *
 * We store BOTH the raw value and the normalised contribution so the
 * "how is this calculated?" explainer can show "4 confirmations → 32/40
 * points" rather than just a final number.
 */
export interface ConfidenceComponents {
  /** Independent confirmations: other verified users whose answer agrees. */
  confirmations: {
    /** Raw count of confirming users (weighted by their tier — see formula). */
    count: number;
    /** 0-40 normalised contribution to the final score. */
    points: number;
    /** Max possible points for this component (40). */
    maxPoints: number;
  };
  /** Citations: source links the answer cites. */
  citations: {
    /** Raw count of citation URLs in the answer body. */
    count: number;
    /** 0-20 normalised contribution (4 points each, capped at 5 citations). */
    points: number;
    maxPoints: number;
  };
  /** Contributor reputation: the answerer's verification + skill tier. */
  reputation: {
    /** Phase 1 verification tier of the answerer. */
    verificationTier: VerificationTier;
    /** Phase 1.5 skill tier of the answerer in the answer's topic. */
    skillTier: SkillTier;
    /** 0-20 normalised contribution. */
    points: number;
    maxPoints: number;
  };
  /** Disputes: open corrections against this answer (subtracts). */
  disputes: {
    /** Raw count of OPEN disputes. */
    openCount: number;
    /** Raw count of RESOLVED disputes that upheld the correction. */
    upheldCount: number;
    /** Negative contribution (0 to -30). Each open dispute = -5, each upheld = -10. */
    points: number;
    maxPoints: number;
  };
  /** Provenance bonus: Phase 2 hash chain intact. */
  provenance: {
    /** True if the answer has a provenance chain and verifyChain returned valid. */
    chainIntact: boolean;
    /** 0 or 5 — flat bonus for an intact chain. */
    points: number;
    maxPoints: number;
  };
}

/**
 * The full confidence score for an answer. Stored in `confidence_scores`
 * (keyPath: postId) and recomputed on every relevant event (new
 * confirmation, new citation, new dispute, tier change, chain update).
 */
export interface ConfidenceScore {
  /** The post/answer ID this score covers. */
  postId: string;
  /** Final 0-100 score. Weighted sum of component points. */
  score: number;
  /** The breakdown — always shown alongside the score so the reader
   *  can see HOW it was calculated. */
  components: ConfidenceComponents;
  /** Human-readable label: "Very low" / "Low" / "Moderate" / "High" / "Very high". */
  label: ConfidenceLabel;
  /** One-paragraph explanation, e.g. "High confidence: 3 expert confirmations, 2 citations, intact provenance chain. -5 for 1 open dispute." */
  explanation: string;
  /** When the score was (re)computed. */
  computedAt: number;
}

export type ConfidenceLabel = "very-low" | "low" | "moderate" | "high" | "very-high";

/**
 * Inputs to computeConfidenceScore. The caller gathers these from the
 * relevant stores (posts, verification records, drain entries, disputes,
 * provenance chain) and passes them in. The function is pure — no I/O.
 */
export interface ConfidenceInput {
  postId: string;
  /** Confirmations: each is a user who posted an agreeing answer + their tiers. */
  confirmations: Array<{
    userId: string;
    verificationTier: VerificationTier;
    skillTier: SkillTier;
  }>;
  /** Citation URLs extracted from the answer body. */
  citations: string[];
  /** The answerer's own tiers. */
  answererVerificationTier: VerificationTier;
  answererSkillTier: SkillTier;
  /** Open + upheld dispute counts. */
  openDisputeCount: number;
  upheldDisputeCount: number;
  /** Whether the Phase 2 provenance chain is intact. */
  provenanceChainIntact: boolean;
  /** Override the clock for testing. */
  now?: number;
}

// ── Phase 4: Dispute & Correction Workflow ────────────────────────
// Verified experts flag outdated/wrong answers, propose corrections
// with provenance trails (Phase 2 hashes every proposed edit), and a
// public moderation log records every action. Open disputes feed back
// into Phase 3's confidence score (-5 per open, -10 per upheld).

/**
 * The lifecycle of a dispute.
 *
 * `open`         — filed, awaiting the answerer's response or a
 *                  moderator's review.
 * `answered`     — the answerer responded (accepted / rejected /
 *                  counter-proposed). Awaiting moderator review.
 * `upheld`       — a moderator upheld the dispute. The correction is
 *                  applied; the answer's confidence score drops by 10.
 * `rejected`     — a moderator rejected the dispute. No change to the
 *                  answer. The dispute remains in the log for audit.
 * `withdrawn`    — the filer withdrew the dispute (e.g. they were wrong).
 */
export type DisputeStatus = "open" | "answered" | "upheld" | "rejected" | "withdrawn";

/**
 * The kind of correction the filer is proposing.
 *
 * `update`       — the answer is outdated; here's the updated content.
 * `refute`       — the answer is wrong; here's why (no replacement).
 * `merge`        — the answer is partial; merge in this missing piece.
 * `delete`       — the answer is harmful/spam; remove it (moderator-only).
 */
export type CorrectionKind = "update" | "refute" | "merge" | "delete";

/**
 * A dispute filed against an answer (post). Stored in `disputes`.
 *
 * The dispute references:
 *  - postId       — the answer being disputed
 *  - filerId      — the verified expert who filed (must be tier >= identity)
 *  - kind         — what kind of correction is proposed
 *  - reason       — free-text explanation (why is this wrong/outdated?)
 *  - citations    — supporting URLs (the filer's evidence)
 *  - proposedBody — the corrected content (for `update` / `merge`)
 *  - provenanceHash — SHA-256 of the proposed body (Phase 2 chain link)
 *
 * The answerer can respond (accept / reject / counter-propose), and a
 * moderator (the answer's author OR a platform moderator) resolves it.
 * Every action is appended to the moderation log.
 */
export interface Dispute {
  id: string;
  postId: string;
  /** The question this dispute's answer responds to (denormalised for queries). */
  questionId?: string;
  filerId: string;
  filerName?: string;
  /** Filer's verification tier at time of filing (for the moderation UI). */
  filerTier: VerificationTier;
  kind: CorrectionKind;
  status: DisputeStatus;
  /** Why the filer thinks the answer is wrong/outdated. Max 2000 chars. */
  reason: string;
  /** Supporting URLs (the filer's evidence). */
  citations: string[];
  /** The corrected content (for `update` / `merge`). Max 10000 chars. */
  proposedBody?: string;
  /** SHA-256 of the proposed body — links to the Phase 2 provenance chain. */
  provenanceHash?: string;
  /** The answerer's response (if any). */
  response?: {
    action: "accept" | "reject" | "counter";
    note?: string;
    /** For `counter` — the answerer's counter-proposal body. */
    counterBody?: string;
    at: number;
  };
  /** Moderator resolution (if any). */
  resolution?: {
    action: "uphold" | "reject";
    moderatorId: string;
    moderatorName?: string;
    note?: string;
    at: number;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * One entry in the public moderation log. Stored in `moderation_log`.
 * Every dispute-related action (file / respond / resolve / withdraw)
 * appends a row here. The log is append-only — never edited or deleted.
 *
 * This is the "transparent moderation logs" the user asked for: anyone
 * can see who did what when, and the log is tamper-evident via the
 * Phase 2 provenance chain (every action that changes a record gets a
 * chain link).
 */
export interface ModerationAction {
  id: string;
  /** The dispute this action relates to. */
  disputeId: string;
  /** The post/answer the dispute is about. */
  postId: string;
  /** What kind of action this is. */
  type: ModerationActionType;
  /** Who performed the action. */
  actorId: string;
  actorName?: string;
  /** Free-text note attached to the action. */
  note?: string;
  /** The dispute status BEFORE this action (for audit trail). */
  fromStatus?: DisputeStatus;
  /** The dispute status AFTER this action. */
  toStatus?: DisputeStatus;
  at: number;
}

export type ModerationActionType =
  | "filed"           // a dispute was filed
  | "answered"        // the answerer responded
  | "upheld"          // a moderator upheld the dispute
  | "rejected"        // a moderator rejected the dispute
  | "withdrawn"       // the filer withdrew
  | "correction-applied"; // the upheld correction was applied to the post
