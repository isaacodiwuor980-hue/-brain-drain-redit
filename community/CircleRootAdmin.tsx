import { useState, useEffect, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Settings, Users, Activity, Radio, BookOpen, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCommunities } from "@/hooks/use-communities";

interface Props {
  communityId: string;
  communityName: string;
}

export function CircleRootAdmin({ communityId, communityName }: Props) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { communities, updateCharter, transferStewardship, promoteToCurator, demoteToContributor, makeObserver } = useCommunities();
  const community = communities.find((c) => c.id === communityId);
  const currentRole = community?.role ?? (community?.joinStatus === "member" ? "contributor" : null);

  const [semanticMatching, setSemanticMatching] = useState(true);
  const [persistentOrbit, setPersistentOrbit] = useState(true);
  // Phase 4/5: charter editor draft state, seeded from the live record.
  const [missionDraft, setMissionDraft] = useState(community?.charter?.mission ?? "");
  const [scopeDraft, setScopeDraft] = useState(community?.charter?.scope ?? "");

  // Keep drafts in sync when the Community record loads or the selected
  // Room changes. Guarded by the saved charter value, so typing in the
  // draft does not trigger a reset (community.charter is unchanged until save).
  useEffect(() => {
    setMissionDraft(community?.charter?.mission ?? "");
    setScopeDraft(community?.charter?.scope ?? "");
  }, [communityId, community?.charter?.mission, community?.charter?.scope]);
  
  const contentTypes = ['Posts', 'Questions', 'Polls', 'Quizzes', 'Quiz Answers', 'Assignments', 'Articles', 'Tutorials', 'Files', 'Images', 'Videos', 'Audio', 'Voice Notes', 'Events', 'Announcements', 'Challenges', 'Projects', 'Live Sessions', 'Job Posts', 'Marketplace', 'Resource Links', 'Wikis', 'AI Generated Notes'];
  const [contentToggles, setContentToggles] = useState<Record<string, boolean>>(
    contentTypes.reduce((acc, type) => ({ ...acc, [type]: true }), {})
  );

  const [reviewPeriod, setReviewPeriod] = useState('Trusted Members Skip Review');
  const [customRules, setCustomRules] = useState(`1. No spam\n2. Respect members\n3. Academic references required\n4. No duplicate questions`);

  const recTypes = ['Suggested Quizzes', 'Related Topics', 'Similar Discussions', 'Popular Posts', 'Popular Files', 'Related Resources', 'Recommended Members', 'Suggested Study Groups', 'Suggested Rooms', 'Recent Activity'];
  const [recToggles, setRecToggles] = useState<Record<string, boolean>>(
    recTypes.reduce((acc, type) => ({ ...acc, [type]: true }), {})
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full mt-4 flex items-center gap-2 border-primary/20 hover:bg-primary/5 text-primary">
          <Shield className="w-4 h-4" />
          /root RoomSteward
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] sm:h-[85vh] p-0 flex flex-col rounded-t-xl">
        <div className="p-6 border-b flex items-center justify-between bg-muted/30">
          <div>
            <SheetTitle className="text-2xl font-mono flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              /root Workspace
            </SheetTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Advanced Room configuration for: <span className="font-semibold text-foreground">{communityName}</span>
            </p>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary uppercase tracking-widest text-xs font-mono">
            Owner Access
          </Badge>
        </div>

        <Tabs defaultValue="active-relay" className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <TabsList className="h-auto md:w-64 flex flex-row md:flex-col justify-start items-stretch bg-muted/10 border-r rounded-none p-4 gap-2 overflow-x-auto md:overflow-y-auto">
            <TabsTrigger value="active-relay" className="justify-start gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Radio className="w-4 h-4" /> Active Relay Engine
            </TabsTrigger>
            <TabsTrigger value="content" className="justify-start gap-2">
              <BookOpen className="w-4 h-4" /> Content Configuration
            </TabsTrigger>
            <TabsTrigger value="moderation" className="justify-start gap-2">
              <AlertTriangle className="w-4 h-4" /> Moderation & Rules
            </TabsTrigger>
            <TabsTrigger value="charter" className="justify-start gap-2">
              <FileText className="w-4 h-4" /> Charter
            </TabsTrigger>
            <TabsTrigger value="roles" className="justify-start gap-2">
              <Users className="w-4 h-4" /> Member Roles
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="justify-start gap-2">
              <Activity className="w-4 h-4" /> Recommendation Engine
            </TabsTrigger>
            <TabsTrigger value="settings" className="justify-start gap-2">
              <Settings className="w-4 h-4" /> General Settings
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-6 bg-background">
            <TabsContent value="active-relay" className="m-0 space-y-6">
              <div>
                <h3 className="text-lg font-bold">Active Relay Engine</h3>
                <p className="text-sm text-muted-foreground">Configure the intelligent routing layer for this Room.</p>
              </div>
              
              <div className="grid gap-6">
                <div className="p-4 border rounded-[16px] space-y-4">
                  <h4 className="font-semibold text-primary">Routing Algorithm</h4>
                  <div className="flex items-center justify-between">
                    <Label>Enable Semantic Matching</Label>
                    <Switch checked={semanticMatching} onCheckedChange={(v) => { setSemanticMatching(v); toast({title: "Settings Updated", description: "Semantic Matching updated."}); }} />
                  </div>
                  <p className="text-xs text-muted-foreground">Uses embeddings for intent detection rather than exact keyword match.</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t">
                    <Label>Maximum Hop Limit</Label>
                    <Input type="number" defaultValue={50} className="w-24" />
                  </div>
                </div>

                <div className="p-4 border rounded-[16px] space-y-4">
                  <h4 className="font-semibold text-primary">Persistent Orbit</h4>
                  <div className="flex items-center justify-between">
                    <Label>Allow Pending Orbit State</Label>
                    <Switch checked={persistentOrbit} onCheckedChange={(v) => { setPersistentOrbit(v); toast({title: "Settings Updated", description: "Persistent Orbit updated."}); }} />
                  </div>
                  <p className="text-xs text-muted-foreground">Keep unanswered requests circulating through the linked member structure.</p>
                </div>
                
                <div className="p-4 border rounded-[16px] bg-muted/20">
                  <h4 className="font-semibold mb-4 text-primary">Relay Analytics</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Orbit Success Rate</p>
                      <p className="text-2xl font-bold">87%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Avg Hop Count</p>
                      <p className="text-2xl font-bold">4.2</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Avg Response Time</p>
                      <p className="text-2xl font-bold">12m</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Knowledge Coverage</p>
                      <p className="text-2xl font-bold">92%</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-background rounded-[16px] border">
                      <span className="font-semibold block mb-2">Top Contributors</span>
                      <ul className="text-muted-foreground space-y-1">
                        <li>1. Sarah J. (142 orbits resolved)</li>
                        <li>2. Marcus T. (98 orbits resolved)</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-background rounded-[16px] border">
                      <span className="font-semibold block mb-2">Most Requested Topics</span>
                      <ul className="text-muted-foreground space-y-1">
                        <li>1. React Hooks</li>
                        <li>2. System Design</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="m-0 space-y-6">
              <div>
                <h3 className="text-lg font-bold">Content Configuration</h3>
                <p className="text-sm text-muted-foreground">Choose what types of content members can publish.</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {contentTypes.map(type => (
                  <div key={type} className="flex items-center justify-between p-3 border rounded-[16px]">
                    <Label>{type}</Label>
                    <Switch checked={contentToggles[type]} onCheckedChange={(v) => setContentToggles({ ...contentToggles, [type]: v })} />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="moderation" className="m-0 space-y-6">
              <div>
                <h3 className="text-lg font-bold">Moderation & Custom Rules</h3>
                <p className="text-sm text-muted-foreground">Set rules and review periods for new content.</p>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Review Period</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {['Immediate Publish', 'Review First', 'Trusted Members Skip Review', 'AI Assisted Review', 'Manual Approval', 'Scheduled Publishing'].map(opt => (
                    <div key={opt} className="flex items-center space-x-2 border p-3 rounded-[16px] cursor-pointer hover:bg-muted/50" onClick={() => setReviewPeriod(opt)}>
                      <input type="radio" name="review_period" className="w-4 h-4" checked={opt === reviewPeriod} onChange={() => setReviewPeriod(opt)} />
                      <Label className="cursor-pointer">{opt}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t">
                <h4 className="font-semibold">Custom Rules</h4>
                <Textarea 
                  value={customRules}
                  onChange={(e) => setCustomRules(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Markdown supported. New members must accept these before joining.</p>
                <Button onClick={() => toast({ title: "Rules Saved", description: "Moderation rules updated successfully." })}>Save Rules</Button>
              </div>
            </TabsContent>
            
            <TabsContent value="recommendations" className="m-0 space-y-6">
              <div>
                <h3 className="text-lg font-bold">Recommendation Engine</h3>
                <p className="text-sm text-muted-foreground">Configure what recommendations appear in the Room.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {recTypes.map(type => (
                  <div key={type} className="flex items-center justify-between p-3 border rounded-[16px]">
                    <Label>{type}</Label>
                    <Switch checked={recToggles[type]} onCheckedChange={(v) => setRecToggles({ ...recToggles, [type]: v })} />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="roles" className="m-0 space-y-6">
              <div>
                <h3 className="text-lg font-bold">Member Roles</h3>
                <p className="text-sm text-muted-foreground">Manage permissions across hierarchy levels.</p>
              </div>

              {/* Phase 5: functional role management for the current viewer.
                  Local-first: the `role` lives on this user's Community
                  record. Cross-user promotion needs a member directory. */}
              <div className="p-4 border rounded-[16px] bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Your role in this Room</span>
                  <Badge variant="outline" className="bg-primary/10 text-primary uppercase tracking-widest text-xs font-mono">
                    {currentRole ?? "none"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Steward and Curator can manage the charter and promote Deposits into the Library. Observer is read-only.
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  Role and charter changes are paused until membership and permissions are verified. Displayed local roles are not proof of authorization.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled onClick={() => { void transferStewardship(communityId); toast({ title: "Stewardship claimed", description: "You are now the Room steward." }); }}>
                    Claim Stewardship
                  </Button>
                  <Button variant="outline" size="sm" disabled onClick={() => { void promoteToCurator(communityId); toast({ title: "Role updated", description: "You are now a Curator." }); }}>
                    Make Curator
                  </Button>
                  <Button variant="outline" size="sm" disabled onClick={() => { void demoteToContributor(communityId); toast({ title: "Role updated", description: "You are now a Contributor." }); }}>
                    Make Contributor
                  </Button>
                  <Button variant="outline" size="sm" disabled onClick={() => { void makeObserver(communityId); toast({ title: "Role updated", description: "You are now an Observer (read-only)." }); }}>
                    Make Observer
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {['Owner', 'Co-owner', 'Administrator', 'Moderator', 'Trusted Member', 'Contributor', 'Member', 'Visitor'].map(role => (
                   <div key={role} className="flex items-center justify-between p-3 border rounded-[16px] bg-card">
                     <span className="font-medium">{role}</span>
                     <Button variant="ghost" size="sm" onClick={() => toast({title: "Edit Permissions", description: `Editing permissions for ${role}`})}>Edit Permissions</Button>
                   </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="charter" className="m-0 space-y-6">
              <div>
                <h3 className="text-lg font-bold">Room Charter</h3>
                <p className="text-sm text-muted-foreground">The mission and scope of this Room. Visible on the Room card and detail panel.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Mission</Label>
                  <Textarea
                    value={missionDraft}
                    onChange={(e) => setMissionDraft(e.target.value)}
                    placeholder="One sentence: what does this Room exist to do?"
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Textarea
                    value={scopeDraft}
                    onChange={(e) => setScopeDraft(e.target.value)}
                    placeholder="What's in-bounds vs out-of-bounds for this Room?"
                    className="min-h-[80px]"
                  />
                </div>
                <Button
                  disabled
                  onClick={async () => {
                    try {
                      await updateCharter({ communityId, mission: missionDraft.trim(), scope: scopeDraft.trim() });
                      toast({ title: "Charter Saved", description: "This Room's mission and scope were updated." });
                    } catch (error) {
                      toast({ title: "Couldn't save charter", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
                    }
                  }}
                >
                  Save Charter
                </Button>
              </div>
            </TabsContent>

          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Badge({ children, className, variant: _variant }: { children: ReactNode; className?: string; variant?: string }) {
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${className}`}>{children}</span>;
}
