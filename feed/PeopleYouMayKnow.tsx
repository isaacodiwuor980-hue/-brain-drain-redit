/**
 * PeopleYouMayKnow.tsx — Phase 3 (Topic Suggestions)
 * Horizontal scroll of user cards. Hidden for users with 5+ followers.
 */

import { useDiscoverByTopics, useFollowerCount, useFollowUser } from "@/hooks/use-discover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Users } from "lucide-react";

export function PeopleYouMayKnow() {
  const { data: suggestions, isLoading } = useDiscoverByTopics(10);
  const { data: followerCount } = useFollowerCount();
  const followMutation = useFollowUser();

  if (followerCount !== undefined && followerCount >= 5) {
    return null;
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Finding people you may know...
      </div>
    );
  }
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="People you may know"
      className="rounded-xl border border-border/50 bg-background/50 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">People you may know</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {suggestions.map((user) => (
          <div
            key={user.id}
            className="flex-shrink-0 w-40 rounded-lg border border-border/50 bg-background p-3 text-center"
          >
            <Avatar className="mx-auto h-12 w-12">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
              <AvatarFallback>
                {user.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="mt-2 truncate text-sm font-medium">{user.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">@{user.username}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {user.overlap} shared topic{user.overlap === 1 ? "" : "s"}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              disabled={followMutation.isPending}
              onClick={() => followMutation.mutate(user.id)}
            >
              {followMutation.isPending && followMutation.variables === user.id ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <UserPlus className="mr-1 h-3 w-3" />
              )}
              Follow
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
