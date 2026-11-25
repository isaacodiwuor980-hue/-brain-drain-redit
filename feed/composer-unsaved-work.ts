interface ComposerWork {
  content: string;
  title: string;
  tags: string[];
  details: string;
  media: unknown[];
  noteAttachments: unknown[];
  brainId: string | null;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  depositFields: Record<string, string>;
  depositType?: string;
  isEventMode?: boolean;
  pendingTag?: string;
  topicId?: string;
  communityId?: string;
  questionId?: string;
  editPolicy?: string;
}

/** The editor has no safe automatic draft persistence: warn before discarding. */
export function hasComposerUnsavedWork(work: ComposerWork): boolean {
  return Boolean(work.content.trim() || work.title.trim() || work.tags.length || work.details.trim() ||
    work.media.length || work.noteAttachments.length || work.brainId || work.isEventMode ||
    work.eventTitle.trim() || work.eventDate || work.eventTime || work.eventLocation.trim() ||
    (work.depositType && work.depositType !== "none") || Object.values(work.depositFields).some(value => value.trim()) ||
    work.pendingTag?.trim() || work.topicId || work.communityId || work.questionId ||
    (work.editPolicy && work.editPolicy !== "me-only"));
}
