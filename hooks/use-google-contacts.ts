/**
 * use-google-contacts.ts — Phase 7 (Google Email OAuth)
 *
 * Requests the Google contacts.readonly scope, fetches contacts via the
 * People API, hashes each email with the user's salt, matches against
 * profiles.email_hash. Raw emails never leave the client.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth-token";
import { useAuth } from "@/components/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateSalt, sha256Hex, type ContactMatch } from "./use-contact-sync";

async function fetchGoogleContactEmailHashes(): Promise<string[]> {
  const [{ auth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([
    import("@/lib/firebase-auth"),
    import("firebase/auth"),
  ]);

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/contacts.readonly");
  provider.setCustomParameters({ prompt: "consent" });

  const userCredential = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(userCredential);
  if (!credential?.accessToken) {
    throw new Error(
      "Could not get Google access token. Please re-authenticate and grant contacts permission.",
    );
  }
  const accessToken = credential.accessToken;

  const emails: string[] = [];
  let pageToken: string | undefined = undefined;
  const MAX_PAGES = 5; // 5 pages × 2000 = 10,000 contacts max

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "emailAddresses");
    url.searchParams.set("pageSize", "2000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`People API error (${res.status}): ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const conn of data.connections ?? []) {
      for (const emailObj of conn.emailAddresses ?? []) {
        if (typeof emailObj.value === "string") {
          emails.push(emailObj.value.toLowerCase().trim());
        }
      }
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  if (emails.length === 0) {
    throw new Error("Your Google account has no contacts with email addresses");
  }

  const salt = getOrCreateSalt();
  const hashes: string[] = [];
  for (const email of emails) {
    hashes.push(await sha256Hex(email + salt));
  }
  return hashes;
}

export function useGoogleContacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const guest = !user || user.id.startsWith("guest-");

  const findFriendsFromGmail = useMutation({
    mutationFn: async (): Promise<ContactMatch[]> => {
      if (guest) throw new Error("Sign in with Google first to find Gmail friends");
      const hashes = await fetchGoogleContactEmailHashes();
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/discover/by-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hashes }),
      });
      if (!res.ok) throw new Error(`Server error (status ${res.status})`);
      const data = await res.json();
      return data.matches ?? [];
    },
    onSuccess: (data) => {
      setMatches(data);
      setShowMatches(true);
      if (data.length === 0) {
        toast({
          title: "No friends found yet",
          description: "None of your Gmail contacts have joined Brain Drain yet.",
        });
      } else {
        toast({
          title: `Found ${data.length} friend${data.length === 1 ? "" : "s"}`,
          description: "From your Google contacts.",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Gmail sync failed", description: error.message, variant: "destructive" });
    },
  });

  return {
    matches,
    showMatches,
    setShowMatches,
    isLoading: findFriendsFromGmail.isPending,
    findFriendsFromGmail: findFriendsFromGmail.mutate,
    clearMatches: () => {
      setMatches([]);
      setShowMatches(false);
    },
  };
}
