/**
 * use-contact-sync.ts — Phase 6 (Phone Contact Sync)
 *
 * Contact Picker API + vCard fallback + SHA-256 hashing with per-user salt.
 * Raw phone numbers never leave the client — only hashes are sent.
 */

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth-token";
import { useAuth } from "@/components/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface ContactMatch {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
}

export function generateSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function getOrCreateSalt(): string {
  const KEY = "brain-drain-contact-salt";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 16) return existing;
    const newSalt = generateSalt();
    localStorage.setItem(KEY, newSalt);
    return newSalt;
  } catch {
    return generateSalt();
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;
  return cleaned;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ContactInfo {
  tel?: string[];
  name?: string[];
}
interface ContactsApi {
  select(properties: string[], options?: { multiple: boolean }): Promise<ContactInfo[]>;
}
function getContactsApi(): ContactsApi | null {
  const nav = navigator as Navigator & { contacts?: ContactsApi };
  return nav.contacts ?? null;
}
export function isContactPickerSupported(): boolean {
  return getContactsApi() !== null;
}

export function useContactSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const guest = !user || user.id.startsWith("guest-");

  const sendHashes = useCallback(
    async (hashes: string[]): Promise<ContactMatch[]> => {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/discover/by-contacts", {
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
    [],
  );

  const findFriendsFromContacts = useMutation({
    mutationFn: async (): Promise<ContactMatch[]> => {
      if (guest) throw new Error("Sign in to find friends from contacts");
      const contactsApi = getContactsApi();
      if (!contactsApi) {
        throw new Error(
          "Contact Picker API not supported in this browser. Try Chrome on Android, or upload a vCard file.",
        );
      }
      setIsPickerOpen(true);
      const selected = await contactsApi.select(["tel", "name"], { multiple: true });
      setIsPickerOpen(false);
      if (selected.length === 0) return [];

      const salt = getOrCreateSalt();
      const hashes: string[] = [];
      for (const contact of selected) {
        for (const phone of contact.tel ?? []) {
          hashes.push(await sha256Hex(normalizePhone(phone) + salt));
        }
      }
      if (hashes.length === 0) throw new Error("Selected contacts have no phone numbers");
      return sendHashes(hashes);
    },
    onSuccess: (data) => {
      setMatches(data);
      if (data.length === 0) {
        toast({
          title: "No friends found yet",
          description: "None of your contacts have joined Brain Drain yet. Invite them!",
        });
      } else {
        toast({
          title: `Found ${data.length} friend${data.length === 1 ? "" : "s"}`,
          description: "Follow them to see their posts in your feed.",
        });
      }
    },
    onError: (error: Error) => {
      setIsPickerOpen(false);
      toast({ title: "Contact sync failed", description: error.message, variant: "destructive" });
    },
  });

  /** vCard (.vcf) upload fallback for browsers without the Contact Picker. */
  const findFriendsFromVCard = useCallback(
    async (file: File): Promise<void> => {
      if (guest) {
        toast({ title: "Sign in to find friends", variant: "destructive" });
        return;
      }
      try {
        const text = await file.text();
        const phoneRegex = /TEL[^:]*:([^\r\n]+)/g;
        const phones: string[] = [];
        let match;
        while ((match = phoneRegex.exec(text)) !== null) {
          phones.push(match[1].trim());
        }
        if (phones.length === 0) {
          toast({
            title: "No contacts found in vCard",
            description: "The file didn't contain any phone numbers.",
            variant: "destructive",
          });
          return;
        }
        const salt = getOrCreateSalt();
        const hashes: string[] = [];
        for (const phone of phones) {
          hashes.push(await sha256Hex(normalizePhone(phone) + salt));
        }
        const data = await sendHashes(hashes);
        setMatches(data);
        toast({
          title: `Found ${data.length} friend${data.length === 1 ? "" : "s"}`,
          description: "From your vCard file.",
        });
      } catch (err) {
        toast({
          title: "vCard upload failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [guest, toast, sendHashes],
  );

  return {
    matches,
    isPickerOpen,
    isLoading: findFriendsFromContacts.isPending,
    isContactPickerSupported: isContactPickerSupported(),
    findFriendsFromContacts: findFriendsFromContacts.mutate,
    findFriendsFromVCard,
    clearMatches: () => setMatches([]),
  };
}
