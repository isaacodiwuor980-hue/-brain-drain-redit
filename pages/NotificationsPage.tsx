import { useNotifications } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { idb } from "@/lib/db";
import type { Post } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckCheck, MessageCircle, Heart, Zap, AtSign, BellOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";

export function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Filter tabs (All / Unread / Mentions) intentionally removed per the
  // dry-state design goal — the page just shows every notification in
  // reverse-chronological order. "Mark all read" stays for one-tap
  // triage. This saves vertical space and removes an engagement-tax UI.
  const filteredNotifications = [...notifications].sort((a, b) => b.createdAt - a.createdAt);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case "reply": return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case "reaction": return <Heart className="w-4 h-4 text-red-500" />;
      case "brain_run": return <Zap className="w-4 h-4 text-yellow-500" />;
      case "mention": return <AtSign className="w-4 h-4 text-green-500" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  const handleNotificationClick = async (notif: { id: string; read?: boolean; postId?: string; type: string }) => {
    if (!notif.read) markAsRead(notif.id);

    // Direct to the attached activity
    if (notif.postId) {
      // B5 stale-link guard: seeded/legacy notifications can reference posts
      // that no longer exist (seed churn, deleted content). Verify before
      // deep-linking so a dead notification never opens a broken state.
      try {
        const post = await idb.get<Post>("posts", notif.postId);
        if (!post) {
          toast({
            title: "That content is no longer available",
            description: "Opening your home feed instead.",
          });
          setLocation("/");
          return;
        }
      } catch {
        // IDB unavailable — fall through to the deep link (harmless: the
        // home feed already renders a missing-post state).
      }
      setLocation(`/?postId=${notif.postId}`);
    } else if (notif.type === "brain_run") {
      setLocation("/library");
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col bg-background">
      {/* Sticky Header with blurred background */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 pb-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Notifications</h1>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-8 text-xs font-bold border-border cursor-pointer"
            onClick={() => markAllAsRead()}
            disabled={unreadCount === 0}
            aria-label="Mark all notifications as read"
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Mark all read
          </Button>
        </div>
        {unreadCount > 0 && (
          <div className="px-4 pb-2 text-xs text-muted-foreground">
            {unreadCount} unread
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {filteredNotifications.length === 0 ? (
            // F8: replaced bare "No notifications found." with an illustrated
            // empty state matching the HomeFeed pattern. Icon + heading +
            // supportive copy + a CTA that routes the user back to the feed
            // where notifications are generated. Empty states are a prime
            // retention surface — a dead-end here costs D1 retention.
            <div className="p-12 text-center space-y-4 max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <BellOff className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-foreground">You're all caught up</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When someone replies to your posts, mentions you, or runs your brains, you'll see it here.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setLocation("/")}
              >
                Browse the feed
              </Button>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div 
                key={notif.id} 
                className={`p-4 hover:bg-accent/30 transition-colors flex gap-4 cursor-pointer ${!notif.read ? 'bg-accent/10' : ''}`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="relative">
                  <Avatar>
                    <AvatarFallback>{(notif.actorName || "?").substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border">
                    {getIcon(notif.type)}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm">
                    <span className="font-semibold">{notif.actorName}</span> {notif.content}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(notif.createdAt, { addSuffix: true })}
                  </p>
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
