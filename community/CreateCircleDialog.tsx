import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Globe, Lock, ShieldAlert, Image as ImageIcon, X } from "lucide-react";
import { useCommunities } from "@/hooks/use-communities";
import { useToast } from "@/hooks/use-toast";

const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB cap for circle images

export function CreateCircleDialog() {
  const { addCommunity } = useCommunities();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [language, setLanguage] = useState("English");
  const [location, setLocation] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "restricted" | "private">("public");
  const [allowMature, setAllowMature] = useState(false);
  // Cover + icon images — stored as data URLs (capped at 1MB each).
  // Bug fix: previously the dashed upload boxes were dead UI. Now they
  // trigger a real file input and the resulting data URL is persisted
  // on the Community record (image = icon, coverImage = cover).
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  // Create guard — prevents duplicate circles on rapid double-click.
  const [isCreating, setIsCreating] = useState(false);

  const readImageAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handlePickImage = async (which: "icon" | "cover") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > MAX_IMAGE_BYTES) {
        toast({ title: "Image too large", description: "Please choose an image under 1MB.", variant: "destructive" });
        return;
      }
      try {
        const dataUrl = await readImageAsDataUrl(file);
        if (which === "icon") setIconDataUrl(dataUrl);
        else setCoverDataUrl(dataUrl);
      } catch {
        toast({ title: "Couldn't read image", variant: "destructive" });
      }
    };
    input.click();
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (isCreating) return; // guard against rapid double-click
    setIsCreating(true);
    try {
      // Persist ALL collected fields — previously privacy, category,
      // tags, language, location, allowMature were silently dropped.
      const tagsArray = tags.split(",").map(t => t.trim()).filter(Boolean);
      await addCommunity({
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim(),
        memberCount: 1,
        active: true,
        image: iconDataUrl || undefined,
        coverImage: coverDataUrl || undefined,
        category: category.trim() || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        language: language.trim() || undefined,
        location: location.trim() || undefined,
        privacy,
        allowMature,
      });

      setOpen(false);
      // Reset all fields — previously several fields leaked into the
      // next creation session.
      setName("");
      setDescription("");
      setCategory("");
      setTags("");
      setLanguage("English");
      setLocation("");
      setPrivacy("public");
      setAllowMature(false);
      setIconDataUrl(null);
      setCoverDataUrl(null);
      toast({ title: "Circle Created", description: "Your Accountability Circle is now live and rooting." });
    } catch (error) {
      toast({ title: "Couldn't create circle", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create Accountability Circle</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 pt-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Circle Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Daily Hackers" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is the focus of this circle?" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cover Image &amp; Icon</Label>
                <div className="flex gap-4">
                  {/* Icon picker — square, becomes the circle's avatar. */}
                  <button
                    type="button"
                    onClick={() => handlePickImage("icon")}
                    className="relative w-20 h-20 rounded-[16px] bg-muted border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/80 overflow-hidden transition-colors group"
                    aria-label="Pick an icon image"
                  >
                    {iconDataUrl ? (
                      <>
                        <img src={iconDataUrl} alt="Icon preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] text-white font-medium">Change</span>
                        </div>
                      </>
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    )}
                  </button>
                  {/* Cover picker — wide, becomes the circle's banner. */}
                  <button
                    type="button"
                    onClick={() => handlePickImage("cover")}
                    className="relative flex-1 h-20 rounded-[16px] bg-muted border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/80 overflow-hidden transition-colors group"
                    aria-label="Pick a cover image"
                  >
                    {coverDataUrl ? (
                      <>
                        <img src={coverDataUrl} alt="Cover preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] text-white font-medium">Change</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Upload Cover Image</span>
                    )}
                  </button>
                  {/* Clear button — visible only when at least one image is set. */}
                  {(iconDataUrl || coverDataUrl) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => { setIconDataUrl(null); setCoverDataUrl(null); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">PNG/JPG, max 1MB each. Stored locally for now.</p>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Technology" />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="coding, accountability" />
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="English" />
              </div>
              <div className="space-y-2">
                <Label>Location (optional)</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Global or City" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Privacy Selection</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card 
                className={`cursor-pointer transition-colors ${privacy === 'public' ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setPrivacy('public')}
              >
                <CardHeader className="p-4">
                  <Globe className="w-6 h-6 mb-2 text-blue-500" />
                  <CardTitle className="text-base">Public</CardTitle>
                  <CardDescription className="text-xs">Anyone can discover and join.</CardDescription>
                </CardHeader>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-colors ${privacy === 'restricted' ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setPrivacy('restricted')}
              >
                <CardHeader className="p-4">
                  <ShieldAlert className="w-6 h-6 mb-2 text-yellow-500" />
                  <CardTitle className="text-base">Restricted</CardTitle>
                  <CardDescription className="text-xs">Visible publicly. Joining requires approval.</CardDescription>
                </CardHeader>
              </Card>

              <Card 
                className={`cursor-pointer transition-colors ${privacy === 'private' ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setPrivacy('private')}
              >
                <CardHeader className="p-4">
                  <Lock className="w-6 h-6 mb-2 text-red-500" />
                  <CardTitle className="text-base">Private</CardTitle>
                  <CardDescription className="text-xs">Only invited members can view. Hidden from search.</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Content Settings</h3>
            <div className="flex items-center justify-between p-4 border rounded-[16px] bg-card">
              <div className="space-y-0.5">
                <Label className="text-base">Allow Mature Content</Label>
                <p className="text-sm text-muted-foreground">Enables 18+ badge, age verification, and safe search filtering.</p>
              </div>
              <Switch checked={allowMature} onCheckedChange={setAllowMature} />
            </div>
          </div>
          
          <Button className="w-full mt-4" size="lg" onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? "Creating…" : "Initialize Active Relay & Create Circle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
