/**
 * FindFriendsFromContacts.tsx — Phase 6 (Phone Contact Sync)
 * Contact Picker + vCard fallback. Privacy modal before the picker.
 */

import { useState, useRef } from "react";
import { useContactSync, type ContactMatch } from "@/hooks/use-contact-sync";
import { useFollowUser } from "@/hooks/use-discover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Phone, Upload, Shield, Loader2, UserPlus, X } from "lucide-react";

export function FindFriendsFromContacts() {
  const { matches, isLoading, isContactPickerSupported, findFriendsFromContacts, findFriendsFromVCard, clearMatches } = useContactSync();
  const followMutation = useFollowUser();
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showMatchesModal, setShowMatchesModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = () => {
    setShowPrivacyModal(false);
    if (isContactPickerSupported) {
      findFriendsFromContacts();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await findFriendsFromVCard(file);
      setShowMatchesModal(true);
    }
    e.target.value = "";
  };

  if (matches.length > 0 && !showMatchesModal) {
    setShowMatchesModal(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPrivacyModal(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Phone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Find friends from contacts</p>
          <p className="text-xs text-muted-foreground">Match with people you already know</p>
        </div>
      </button>

      <Dialog open={showPrivacyModal} onOpenChange={setShowPrivacyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Your privacy is protected
            </DialogTitle>
            <DialogDescription>We never see or store your raw contacts. Here's how it works:</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground py-2">
            <li>• You pick which contacts to share (one at a time, or all at once).</li>
            <li>• Each phone number is hashed with SHA-256 + a per-user salt on your device.</li>
            <li>• Only the hashes are sent to our server — never the raw phone numbers.</li>
            <li>• We match hashes against other users who opted in. You only see matches.</li>
            <li>• You can revoke this anytime by deleting your contact hash in Settings.</li>
          </ul>
          {isContactPickerSupported ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPrivacyModal(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <p className="text-xs text-muted-foreground text-center">
                Contact Picker API not supported in this browser. Upload a vCard file instead.
              </p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => setShowPrivacyModal(false)}>Cancel</Button>
                <Button className="flex-1" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload vCard
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".vcf,text/vcard"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showMatchesModal}
        onOpenChange={(open) => {
          setShowMatchesModal(open);
          if (!open) clearMatches();
        }}
      >
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Friends from your contacts</DialogTitle>
            <DialogDescription>
              {matches.length} friend{matches.length === 1 ? "" : "s"} on Brain Drain
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {matches.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No matches yet. Invite your friends to join Brain Drain!
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
            <Button variant="outline" onClick={() => { setShowMatchesModal(false); clearMatches(); }}>
              <X className="h-4 w-4 mr-2" />Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
