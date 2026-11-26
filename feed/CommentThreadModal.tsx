import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CommentThread } from "./CommentThread";

interface CommentThreadModalProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  postAuthorName: string;
  /**
   * Optional post author id, forwarded for thread controls. Confidential
   * replies are currently hidden from everyone, including the author.
   */
  postAuthorId?: string;
}

export function CommentThreadModal({
  postId,
  isOpen,
  onClose,
  postAuthorName: _postAuthorName,
  postAuthorId = "me",
}: CommentThreadModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto sm:rounded-[16px] p-0 border-border/50 bg-card hide-scrollbar">
        <DialogHeader className="p-[28px] pb-4 sticky top-0 bg-card/95 backdrop-blur z-20 border-b border-border/50">
          <DialogTitle className="text-[17px] font-bold text-center">Thread</DialogTitle>
          <DialogDescription className="text-center text-[13px] text-muted-foreground mt-1">
            Reply freely — readers upvote/downvote and classify with House / Mouth votes.
          </DialogDescription>
        </DialogHeader>
        <div className="px-[28px] pb-[28px]">
          {/* Task 3 fix: key={postId + isOpen} forces a full remount each time
              the modal reopens. Previously the CommentThread kept its internal
              state (replyToId, content) across open/close cycles, so reopening
              an old thread weeks later would leave replyToId set from a
              previous session — the main editor showed blank and new comments
              went to the wrong parent. The remount resets everything. */}
          <CommentThread key={`${postId}-${isOpen}`} postId={postId} postAuthorId={postAuthorId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
