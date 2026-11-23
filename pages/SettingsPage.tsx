import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme";
import { User, Shield, Paintbrush, Database, Check, ChevronRight, ChevronDown, Monitor, Moon, Sun, Palette, LogOut, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idb } from "@/lib/db";
import { AdminGateDialog } from "@/components/ui/admin-gate-dialog";
import { refreshLocalData } from "@/lib/data-maintenance";
import { collectLocalExport } from "@/lib/local-data-export";
import { clearLocalAnalytics, getLocalAnalyticsControl, LOCAL_ANALYTICS_CHANGE, setLocalAnalyticsEnabled } from "@/lib/local-analytics-control";

interface SavedSettings {
  displayName: string;
  bio: string;
  notifications: boolean;
  privateProfile: boolean;
}

const DEFAULT_SETTINGS: SavedSettings = {
  displayName: "",
  bio: "",
  notifications: true,
  privateProfile: false,
};

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { user, profile, updateProfileData, logOut } = useAuth();

  const [savedSettings, setSavedSettings] = useState<SavedSettings>(DEFAULT_SETTINGS);

  const [displayName, setDisplayName] = useState(savedSettings.displayName);
  const [bio, setBio] = useState(savedSettings.bio);
  const [notifications, setNotifications] = useState(savedSettings.notifications);
  const [privateProfile, setPrivateProfile] = useState(savedSettings.privateProfile);
  const [localActivity, setLocalActivity] = useState<boolean | null>(null);
  const [activityBusy, setActivityBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    const refresh = () => { void getLocalAnalyticsControl().then(value => { if (mounted) setLocalActivity(value.enabled); }).catch(() => { if (mounted) setLocalActivity(null); }); };
    const onStorage = (event: StorageEvent) => { if (event.key === LOCAL_ANALYTICS_CHANGE) refresh(); };
    refresh(); window.addEventListener(LOCAL_ANALYTICS_CHANGE, refresh); window.addEventListener("storage", onStorage);
    return () => { mounted = false; window.removeEventListener(LOCAL_ANALYTICS_CHANGE, refresh); window.removeEventListener("storage", onStorage); };
  }, []);
  const changeLocalActivity = async (enabled: boolean) => {
    setActivityBusy(true);
    try { await setLocalAnalyticsEnabled(enabled); setLocalActivity(enabled); }
    catch { setLocalActivity(null); toast({ title: "Could not save activity setting", description: "Browser storage is unavailable. No change was confirmed.", variant: "destructive" }); }
    finally { setActivityBusy(false); }
  };
  const clearLocalActivity = async () => {
    if (!confirm("Clear saved activity on this browser? This cannot be undone. Cloud records and other devices are not affected.")) return;
    setActivityBusy(true);
    try { await clearLocalAnalytics(); toast({ title: "Local activity cleared", description: "Only activity stored by this browser was cleared. Cloud records and other devices were not changed." }); }
    catch { toast({ title: "Could not clear activity", description: "Browser storage is unavailable. No deletion was confirmed.", variant: "destructive" }); }
    finally { setActivityBusy(false); }
  };
  const [activeSection, setActiveSection] = useState("appearance");
  // Compress the long-tail settings sections so the page is scannable at a
  // glance. The Account + Appearance sections are essential and stay open by
  // default; Privacy and Advanced are collapsed behind a "Show more" toggle
  // so the user doesn't have to scroll past them to find what they need.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    privacy: false,
    advanced: false,
  });
  const toggleSection = (id: string) =>
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  const [isRefreshOpen, setIsRefreshOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Hydrate the form from the signed-in/guest profile and local privacy
  // preferences once they load.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const next: SavedSettings = { ...DEFAULT_SETTINGS };
      if (profile) {
        next.displayName = profile.displayName || user?.displayName || "";
        next.bio = profile.bio || "";
      }
      try {
        const privacy = await idb.get<Partial<SavedSettings>>("settings", "privacy-settings");
        if (privacy) {
          if (typeof privacy.notifications === "boolean") next.notifications = privacy.notifications;
          if (typeof privacy.privateProfile === "boolean") next.privateProfile = privacy.privateProfile;
        }
      } catch {
        // Best-effort; defaults are fine.
      }
      if (cancelled) return;
      setSavedSettings(next);
      setDisplayName(next.displayName);
      setBio(next.bio);
      setNotifications(next.notifications);
      setPrivateProfile(next.privateProfile);
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [profile, user?.displayName]);

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await refreshLocalData();
      toast({
        title: "Data refreshed",
        description: "Local content has been reset. Reloading…",
      });
      // Reload after a brief beat so the toast is visible and seeding re-runs.
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      console.error("Failed to refresh local data", error);
      setIsRefreshing(false);
      toast({
        title: "Refresh failed",
        description: "Could not refresh local data. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isDirty = 
    displayName !== savedSettings.displayName ||
    bio !== savedSettings.bio ||
    notifications !== savedSettings.notifications ||
    privateProfile !== savedSettings.privateProfile;

  useEffect(() => {
    window.__isAppDirty = isDirty;
    return () => {
      window.__isAppDirty = false;
    };
  }, [isDirty]);

  const handleDiscard = () => {
    setDisplayName(savedSettings.displayName);
    setBio(savedSettings.bio);
    setNotifications(savedSettings.notifications);
    setPrivateProfile(savedSettings.privateProfile);
    toast({
      title: "Changes Discarded",
      description: "Settings reverted to their previously saved state.",
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    const next: SavedSettings = {
      displayName,
      bio,
      notifications,
      privateProfile,
    };
    try {
      // Persist profile fields through the auth layer (Firestore for signed-in
      // users, IndexedDB for guests). Privacy toggles are stored locally.
      await updateProfileData({ displayName: displayName.trim() || "Builder", bio });
      try {
        // Preserve legacy fields, including an earlier saved-off activity
        // preference, until the separate activity control is explicitly set.
        const previous = await idb.get<Record<string, unknown>>("settings", "privacy-settings");
        await idb.put("settings", {
          ...previous,
          id: "privacy-settings",
          notifications,
          privateProfile,
        });
      } catch {
        // Privacy preferences are best-effort; profile save is the priority.
      }
      setSavedSettings(next);
      toast({
        title: "Settings saved",
        description: "Your configurations have been updated.",
      });
    } catch (error) {
      console.error("Failed to save settings", error);
      toast({
        title: "Save failed",
        description: "Could not save your settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    {
      id: "account",
      title: "Account",
      icon: User,
      description: "Manage your profile, email, and password."
    },
    {
      id: "privacy",
      title: "Privacy & Notifications",
      icon: Shield,
      description: "Control who can see your activity and interact with you."
    },
    {
      id: "appearance",
      title: "Appearance",
      icon: Paintbrush,
      description: "Customize the look and feel of Brain Builder."
    },
    {
      id: "advanced",
      title: "Advanced",
      icon: Database,
      description: "Configure how your brains process and store logic."
    }
  ];

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleExportAccountData = async () => {
    try {
      const data = await collectLocalExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `brain-builder-local-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Local export ready", description: "Selected browser data only; cloud data and other local stores are not included." });
    } catch {
      toast({ title: "Local export failed", description: "Browser data could not be read. No complete export was created.", variant: "destructive" });
    }
  };

  const handleClearLocalData = async () => {
    if (!confirm("Clear this browser's local data? This cannot be undone and may remove unsynced work. Your account and cloud data will NOT be deleted.")) return;
    try {
      await idb.clearAllStrict();
      let browserStorageCleared = true;
      try { localStorage.clear(); } catch { browserStorageCleared = false; }
      try { sessionStorage.clear(); } catch { browserStorageCleared = false; }
      toast({
        title: browserStorageCleared ? "Local data cleared" : "Local data partly cleared",
        description: browserStorageCleared ? "Browser data was cleared. Your account and cloud data were not deleted. Reloading..." : "IndexedDB was cleared, but some browser storage could not be cleared. Your account and cloud data were not deleted.",
        ...(browserStorageCleared ? {} : { variant: "destructive" as const }),
      });
      if (browserStorageCleared) setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast({ title: "Could not clear local data", description: "Browser storage could not be cleared. Your account and cloud data were not deleted.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 pb-32 md:pb-32">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences and app settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Settings Navigation (Desktop) */}
        <aside className="hidden md:block md:col-span-4 lg:col-span-3">
          <nav className="flex flex-col space-y-1 sticky top-6">
            {sections.map((section) => (
              <Button 
                key={section.id} 
                variant={activeSection === section.id ? "secondary" : "ghost"} 
                className="justify-start gap-3 h-12"
                onClick={() => scrollToSection(section.id)}
              >
                <section.icon className="w-5 h-5 text-muted-foreground" />
                {section.title}
              </Button>
            ))}
          </nav>
        </aside>

        {/* Settings Content */}
        <div className="col-span-1 md:col-span-8 lg:col-span-9 space-y-8">
          
          {/* Account Section Placeholder */}
          <section id="account">
             <div className="mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> Account
              </h2>
            </div>
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="display-name" className="text-sm font-medium">Display Name</Label>
                      <Input
                        id="display-name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g., Isaac Real"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio" className="text-sm font-medium">Bio / Motto</Label>
                      <Textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Write a short summary about yourself"
                        className="min-h-[80px]"
                      />
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">Email Address</h3>
                      <p className="text-sm text-muted-foreground">{user?.email || "No email linked"}</p>
                    </div>
                    <Button variant="outline" onClick={() => toast({ title: "Email changes require verification", description: "This feature needs a backend email-verification flow. Contact support to change your email." })}>Change</Button>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">Sign Out</h3>
                      <p className="text-sm text-muted-foreground">Log out of your account on this device</p>
                    </div>
                    <Button variant="destructive" onClick={logOut}><LogOut className="w-4 h-4 mr-2" /> Sign Out</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* Appearance Section */}
          <section id="appearance">
            <div className="mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Paintbrush className="w-5 h-5 text-primary" /> Appearance
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Customize how Brain Builder looks on your device.</p>
            </div>

            <Card>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-4">Theme</h3>
                    {/* Two-card segmented control inspired by X / Threads.
                        - "System" follows the OS prefers-color-scheme (dark
                          or light, depending on your device setting).
                        - "System Dynamic" does the same AND adopts the OS
                          accent colour (when available) so the app matches
                          your device's colour palette natively. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        className={`h-auto py-5 flex flex-col gap-2 relative text-left no-default-hover-elevate no-default-active-elevate ${theme === 'system' ? 'border-primary bg-primary/5' : ''}`}
                        onClick={() => setTheme("system")}
                        aria-pressed={theme === 'system'}
                      >
                        {theme === 'system' && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                        <div className="flex items-center gap-2 self-start">
                          <Monitor className="w-5 h-5 text-primary" />
                          <span className="font-semibold">System</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Dark or light — depending on your device setting. Switches automatically when your OS does.
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                          <Sun className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </Button>

                      <Button
                        variant="outline"
                        className={`h-auto py-5 flex flex-col gap-2 relative text-left no-default-hover-elevate no-default-active-elevate ${theme === 'dynamic' ? 'border-primary bg-primary/5' : ''}`}
                        onClick={() => setTheme("dynamic")}
                        aria-pressed={theme === 'dynamic'}
                      >
                        {theme === 'dynamic' && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                        <div className="flex items-center gap-2 self-start">
                          <Palette className="w-5 h-5 text-primary" />
                          <span className="font-semibold">System Dynamic</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Matches your device colour palette — follows dark/light AND adopts your OS accent colour when available.
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="w-3.5 h-3.5 rounded-full bg-primary/40" />
                          <span className="w-3.5 h-3.5 rounded-full bg-chart-1" />
                          <span className="w-3.5 h-3.5 rounded-full bg-chart-2" />
                        </div>
                      </Button>
                    </div>

                    {/* Explicit Light / Dark overrides intentionally removed.
                        The user's OS already controls light/dark via
                        prefers-color-scheme, and "System Dynamic" adopts
                        the OS accent colour on top. Exposing manual light/
                        dark toggles here only created duplicate state and
                        confusion (users would override their OS, then
                        forget they did). The two "System" cards above are
                        the only theme controls now — mono feature, no
                        duplication. */}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* Privacy & Notifications — compressed behind Show More by default */}
          <section id="privacy">
            <button
              type="button"
              onClick={() => toggleSection("privacy")}
              className="flex items-center justify-between w-full mb-2 text-left"
              aria-expanded={expandedSections.privacy}
            >
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Privacy &amp; Notifications
              </h2>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSections.privacy ? "rotate-180" : ""}`} />
            </button>
            {expandedSections.privacy ? (
            <Card>
              <CardContent className="p-0 divide-y">
                <div className="p-6 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="font-medium">Push Notifications</h3>
                    <p className="text-sm text-muted-foreground">Saved preference only; it does not control push notifications yet.</p>
                  </div>
                  <Switch checked={notifications} onCheckedChange={setNotifications} />
                </div>

                <div className="p-6 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="font-medium">Private Profile</h3>
                    <p className="text-sm text-muted-foreground">Saved preference only; it does not restrict profile, post, or brain visibility.</p>
                  </div>
                  <Switch checked={privateProfile} onCheckedChange={setPrivateProfile} />
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 id="local-activity-label" className="font-medium flex items-center gap-2"><Shield className="w-4 h-4 text-primary" aria-hidden="true" /> Activity on this browser</h3>
                      <p id="local-activity-description" className="text-sm text-muted-foreground">When off, this browser stops saving and sending app activity events and stops using saved activity for recommendations. Your followed topics still affect the feed.</p>
                    </div>
                    <Switch aria-labelledby="local-activity-label" aria-describedby="local-activity-description" checked={localActivity === true} disabled={localActivity === null || activityBusy} onCheckedChange={value => void changeLocalActivity(value)} />
                  </div>
                  {localActivity === null && <p role="status" className="text-sm text-muted-foreground">Activity setting unavailable on this browser.</p>}
                  <p className="text-sm text-muted-foreground">This applies to this browser, including anyone using it. It does not delete activity already sent, control other devices, or stop other analytics services. Previously saved activity is kept until you clear it and can be used again if you turn this on.</p>
                  <Button variant="outline" disabled={activityBusy} onClick={() => void clearLocalActivity()}>Clear saved browser activity</Button>
                </div>
              </CardContent>
            </Card>
            ) : (
              <p className="text-sm text-muted-foreground italic px-1 py-2 leading-relaxed">
                Manage browser activity and view the limitations of other privacy preferences. <span className="not-italic font-medium text-foreground/70">Tap to expand.</span>
              </p>
            )}
          </section>

          <Separator />

          {/* Advanced — compressed behind Show More by default */}
          <section id="advanced">
            <button
              type="button"
              onClick={() => toggleSection("advanced")}
              className="flex items-center justify-between w-full mb-2 text-left"
              aria-expanded={expandedSections.advanced}
            >
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" /> Advanced
              </h2>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSections.advanced ? "rotate-180" : ""}`} />
            </button>
            {expandedSections.advanced && (
            <div className="space-y-2">
              <Button onClick={() => void handleExportAccountData()} variant="outline" className="w-full justify-between h-14 px-6 font-normal">
                <span>Export selected local data</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Button>
              <Button onClick={() => setIsRefreshOpen(true)} variant="outline" className="w-full justify-between h-14 px-6 font-normal">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Refresh Local Data
                </span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Button>
              <p className="px-1 text-xs text-muted-foreground">The export contains selected browser data only and may include data from other accounts on this device. It does not include cloud data.</p>
              <Button onClick={() => void handleClearLocalData()} variant="outline" className="w-full justify-between h-14 px-6 font-normal text-destructive hover:text-destructive hover:bg-destructive/10">
                <span>Clear local browser data</span>
                <ChevronRight className="w-5 h-5 text-destructive/50" />
              </Button>
              <p className="px-1 text-xs text-muted-foreground">Clearing local data does not delete your account or cloud data. A complete account deletion process is not yet available here.</p>
            </div>
            )}
          </section>

        </div>
      </div>

      {/* Floating Save/Discard Banner */}
      {isDirty && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border border-border/50 rounded-[16px] shadow-2xl flex items-center justify-between px-6 py-4 gap-4 w-[calc(100%-2rem)] max-w-lg animate-in fade-in slide-in-from-bottom-5">
          <div className="flex flex-col text-left">
            <span className="text-sm font-semibold">Unsaved settings</span>
            <span className="text-xs text-muted-foreground">You have modified your preferences.</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={isSaving}>
              Discard
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={isSaving} className="bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              {isSaving ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </div>
      )}

      <AdminGateDialog
        open={isRefreshOpen}
        onOpenChange={(open) => {
          if (!isRefreshing) setIsRefreshOpen(open);
        }}
        title="Refresh local data"
        description="This clears locally stored brains, posts, missions, messages and other content, then reloads the app with fresh starter data. Your profile, appearance and privacy settings are kept. This cannot be undone."
        confirmLabel="Refresh data & reload"
        busy={isRefreshing}
        onConfirm={handleRefreshData}
      />
    </div>
  );
}
