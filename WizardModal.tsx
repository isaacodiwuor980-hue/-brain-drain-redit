import { useState, useRef, useEffect } from "react";
import { Mind, Node, MindData } from "@/lib/types";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NodeEditor } from "./NodeEditor";
import { BrainCircuit, Tags, GitMerge, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MindData) => Promise<void>;
}

export function WizardModal({ isOpen, onClose, onSave }: WizardModalProps) {
  const [step, setStep] = useState(1);
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [mindType, setMindType] = useState<"knowledge" | "method" | "project" | "decision">("knowledge");
  const [summary, setSummary] = useState("");
  const [traits, setTraits] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState("");
  const traitInputRef = useRef<HTMLInputElement>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const isDirty = title.trim() !== "" || category.trim() !== "" || description.trim() !== "" || traits.length > 0 || nodes.length > 0;

  useEffect(() => {
    if (isOpen && isDirty) {
      window.__isAppDirty = true;
    } else {
      window.__isAppDirty = false;
    }
    return () => {
      window.__isAppDirty = false;
    };
  }, [isOpen, isDirty]);

  const resetState = () => {
    setStep(1);
    setTitle("");
    setCategory("");
    setDescription("");
    setTraits([]);
    setTraitInput("");
    setNodes([]);
    setRootNodeId(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const attemptClose = () => {
    if (isDirty) {
      setShowCloseConfirm(true);
    } else {
      handleClose();
    }
  };

  const handleNext = () => {
    if (step === 1 && !title.trim()) {
      toast({ title: "Title required", description: "Give your mind a name before continuing.", variant: "destructive" });
      return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => setStep(s => s - 1);

  const addTrait = () => {
    const v = traitInput.trim();
    if (!v) return;
    setTraits(prev => [...prev, v]);
    setTraitInput("");
    traitInputRef.current?.focus();
  };

  const removeTrait = (index: number) => {
    setTraits(prev => prev.filter((_, i) => i !== index));
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Validation Error", description: "Mind title is required.", variant: "destructive" });
      setStep(1);
      return;
    }
    if (nodes.length === 0) {
      toast({ title: "Validation Error", description: "Add at least one node.", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    const mindId = crypto.randomUUID();
    // BUG FIX: ensure the root node actually exists in the nodes array.
    // Previously, if the user deleted the root node but didn't set a new
    // one, rootNodeId could point to a non-existent ID → the engine would
    // halt on run. Now we fall back to the first question node, then the
    // first node of any type.
    const effectiveRoot =
      rootNodeId && nodes.some(n => n.id === rootNodeId)
        ? rootNodeId
        : nodes.find(n => n.node_type === "question")?.id ?? nodes[0].id;
    const finalNodes = nodes.map(n => ({ ...n, mind_id: mindId }));

    const mind: Mind = {
      id: mindId,
      title: title.trim(),
      category,
      description,
      created_at: Date.now(),
      root_node_id: effectiveRoot,
      repo_status: "private", // Local Mind — private by default
      mind_type: mindType,
      summary: summary.trim() || undefined,
    };

    try {
      await onSave({ mind, nodes: finalNodes });
      toast({ title: "Mind Saved", description: "Successfully encoded into system memory." });
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Save Failed", description: message || "Could not save to IndexedDB.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { num: 1, label: "Basics", icon: BrainCircuit },
    { num: 2, label: "Factors", icon: Tags },
    { num: 3, label: "Questions", icon: GitMerge }
  ];

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && attemptClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-card border-border/50 flex flex-col p-0 overflow-hidden gap-0">

        {/* Step tabs */}
        <div className="flex border-b border-border/50 shrink-0">
          {steps.map(s => {
            const Icon = s.icon;
            const active = step === s.num;
            const past = step > s.num;
            return (
              <button
                key={s.num}
                onClick={() => past && setStep(s.num)}
                className={`flex-1 flex items-center justify-center p-4 gap-2 text-sm font-mono tracking-wide transition-colors
                  ${active
                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                    : past
                      ? "text-foreground cursor-pointer hover:bg-muted/50"
                      : "text-muted-foreground cursor-default"}`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">Step {s.num}: {s.label}</span>
                <span className="sm:hidden">{s.num}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step 1: Domain Definition ── */}
          {step === 1 && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Mind title
                  </Label>
                  <Input
                    data-testid="input-mind-title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g., Which laptop should I buy?"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Tags (comma separated)
                  </Label>
                  <Input
                    data-testid="input-mind-category"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Shopping, Decisions, Tech"
                    className="h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  What does this mind help decide?
                </Label>
                <Textarea
                  data-testid="textarea-mind-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="A short, plain-language summary of the decision this mind helps people make."
                  className="min-h-[120px]"
                />
              </div>

              {/* Mind type + summary — compact, additive */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Mind type</Label>
                  <Select value={mindType} onValueChange={(v: "knowledge" | "method" | "project" | "decision") => setMindType(v)}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="knowledge">Knowledge — concepts, explanations, lessons</SelectItem>
                      <SelectItem value="method">Method — repeatable steps, inputs, results</SelectItem>
                      <SelectItem value="project">Project — plans, alternatives, progress</SelectItem>
                      <SelectItem value="decision">Decision — choices, trade-offs, outcomes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Short summary (optional)</Label>
                  <Input
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    placeholder="One-line summary for compact view"
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Trait Library ── */}
          {step === 2 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">
                  Factors to consider
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional. List the variables your questions will depend on
                  (e.g. "budget", "roof type", "symptom").
                </p>
              </div>

              {/* Tag chip display */}
              <div className="min-h-[56px] flex flex-wrap gap-2 p-3 bg-muted/20 border border-border/50 rounded-[16px]">
                {traits.length === 0 && (
                  <span className="text-xs text-muted-foreground italic self-center">
                    No traits added yet — type one below and click Add.
                  </span>
                )}
                {traits.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-primary/10 border border-primary/20 text-primary"
                    data-testid={`tag-trait-${i}`}
                  >
                    {t}
                    <button
                      onClick={() => removeTrait(i)}
                      className="hover:text-destructive transition-colors"
                      aria-label={`Remove trait ${t}`}
                      data-testid={`button-remove-trait-${i}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add trait input row */}
              <div className="flex gap-2">
                <Input
                  ref={traitInputRef}
                  data-testid="input-trait"
                  value={traitInput}
                  onChange={e => setTraitInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTrait(); } }}
                  placeholder="Add trait (e.g., roof_angle, wind_load, symptom_fever)"
                  className="flex-1"
                />
                <Button
                  data-testid="button-add-trait"
                  onClick={addTrait}
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Logic Couplet Mapping ── */}
          {step === 3 && (
            <NodeEditor
              nodes={nodes}
              setNodes={setNodes}
              rootNodeId={rootNodeId}
              setRootNodeId={setRootNodeId}
              mindId="temp"
            />
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border/50 flex justify-between sm:justify-between items-center bg-card/50 shrink-0">
          <Button variant="ghost" onClick={attemptClose} className="text-muted-foreground">
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} data-testid="button-wizard-back">
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={handleNext} data-testid="button-wizard-next">
                Next Step
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-primary text-primary-foreground shadow-primary/20 shadow-lg"
                data-testid="button-wizard-save"
              >
                {isSaving ? "⏳ Saving..." : "Digest & Sync Mind to Post"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Close Confirmation Modal */}
    <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard Unsaved Changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved edits in this mind creation wizard. Closing now will permanently discard all your configured traits and logic nodes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowCloseConfirm(false)}>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            setShowCloseConfirm(false);
            handleClose();
          }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
