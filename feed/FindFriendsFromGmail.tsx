/**
 * FindFriendsFromGmail.tsx — Phase 7 (Google Email OAuth)
 * Google People API + contacts.readonly scope. Privacy modal first.
 */

import { useState } from "react";
import { useGoogleContacts } from "@/hooks/use-google-contacts";
import { useFollowUser } from "@/hooks/use-discover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, Shield, Loader2, UserPlus, X } from "lucide-react";
import type { ContactMatch } from "@/hooks/use-contact-sync";

export function FindFriendsFromGmail() {
  const { matches, showMatches, setShowMatches, isLoading, findFriendsFromGmail, clearMatches } = useGoogleContacts();
  const followMutation = useFollowUser();
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const handleConfirm = () => {
    setShowPrivacyModal(false);
    findFriendsFromGmail();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPrivacyModal(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Find Gmail friends</p>
          <p className="text-xs text-muted-foreground">Match with people from your Google contacts</p>
        </div>
      </button>

      <Dialog open={showPrivacyModal} onOpenChange={setShowPrivacyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              How Gmail friend finding works
            </DialogTitle>
            <DialogDescription>You'll see a Google consent screen. Here's what happens:</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground py-2">
            <li>• Google asks you to grant <strong>contacts.readonly</strong> permission.</li>
            <li>• We fetch your contacts' email addresses via the Google People API.</li>
            <li>• Each email is hashed with SHA-256 + a per-user salt on your device.</li>
            <li>• Only the hashes are sent to our server — never the raw emails.</li>
            <li>• We match hashes against other users who opted in. You only see matches.</li>
            <li>• You can revoke Google access anytime at myaccount.google.com/permissions.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrivacyModal(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue with Google
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showMatches}
        onOpenChange={(open) => {
          setShowMatches(open);
          if (!open) clearMatches();
        }}
      >
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Friends from your Gmail contacts</DialogTitle>
            <DialogDescription>
              {matches.length} friend{matches.length === 1 ? "" : "s"} on MindSpool
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {matches.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No matches yet. Invite your friends to join MindSpool!
              </div>
            ) : (
              <div className="space-y-2">
                {matches.map((match: ContactMatch) => (
                  <div key={match.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card/40">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={match.avatarUrl ?? undefined} alt={match.displayName} />
                        <AvatarFallback>{match.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{match.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">@{match.username}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={followMutation.isPending}
                      onClick={() => followMutation.mutate(match.id)}
                    >
                      {followMutation.isPending && followMutation.variables === match.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><UserPlus className="h-3 w-3 mr-1" />Follow</>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMatches(false); clearMatches(); }}>
              <X className="h-4 w-4 mr-2" />Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
