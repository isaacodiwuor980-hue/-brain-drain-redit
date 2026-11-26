import { useMemo, useState, useRef, useEffect } from "react";
import { Mind, Node, NodeSkillReference, SkillEntry, HabitNote } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowRight, Image as ImageIcon, FileCode2, FileText, X, ShieldCheck, AlertTriangle, Undo2, CheckCircle2, Sparkles, RefreshCw, Target } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { MindIssue, validateMind } from "@/lib/mind-validator";
import { useSkills } from "@/hooks/use-skills";
import { useHabits } from "@/hooks/use-habits";
import { idb } from "@/lib/db";

const NEW_Q = "__new_q__";
const NEW_O = "__new_o__";
const NONE  = "__none__";

interface NodeEditorProps {
  nodes: Node[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  rootNodeId: string | null;
  setRootNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  mindId: string;
  mindTitle?: string;
}

export function NodeEditor({ nodes, setNodes, rootNodeId, setRootNodeId, mindId, mindTitle = "" }: NodeEditorProps) {
  const { toast } = useToast();
  const [activeNodeId, setActiveNodeId] = useState<string | null>(
    nodes.length > 0 ? nodes[0].id : null
  );
  // Stores the last deleted node + the exact branches that pointed to it,
  // so undo can restore both the node and its incoming links.
  const [lastDeleted, setLastDeleted] = useState<{
    node: Node;
    links: Array<{ fromId: string; branch: "if_true_node_id" | "if_false_node_id" }>;
  } | null>(null);
  const [showIssues, setShowIssues] = useState(false);

  const activeNode = nodes.find(n => n.id === activeNodeId);

  // ── Part 2 Task 3/7: @Skill mention picker state ───────────────────
  const { skills } = useSkills();
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [skillPickerQuery, setSkillPickerQuery] = useState("");
  const skillPickerRef = useRef<HTMLDivElement>(null);

  // ── Part 2 Task 4: @Habit mention picker state ─────────────────────
  const { habits, habitsByTopic } = useHabits();
  const [habitPickerOpen, setHabitPickerOpen] = useState(false);
  const habitPickerRef = useRef<HTMLDivElement>(null);
  // The mind's topic = its title. @habit scans this for matching habits.
  const mindTopic = mindTitle || "";
  const matchingHabits = useMemo(() => {
    if (!mindTopic) return habits;
    return habitsByTopic(mindTopic);
  }, [habits, habitsByTopic, mindTopic]);

  // Task 7: context-aware filtering. Skills are filtered by what's already
  // in the node's question_text + the typed query.
  const contextAwareSkills = useMemo(() => {
    if (!activeNode) return [];
    const nodeContext = (activeNode.question_text || "").toLowerCase();
    const q = skillPickerQuery.toLowerCase();
    return skills.filter((s) => {
      if (s.status === "in_review") return false;
      const text = `${s.title} ${s.domain} ${s.make ?? ""} ${s.model ?? ""} ${s.steps.map(st => st.action).join(" ")}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (!nodeContext) return true;
      const skillWords = text.split(/\s+/);
      return skillWords.some((w) => w.length > 3 && nodeContext.includes(w));
    }).slice(0, 8);
  }, [skills, skillPickerQuery, activeNode]);

  useEffect(() => {
    if (!skillPickerOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (skillPickerRef.current && !skillPickerRef.current.contains(e.target as Element)) {
        setSkillPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [skillPickerOpen]);

  // Task 4: close habit picker on outside click.
  useEffect(() => {
    if (!habitPickerOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (habitPickerRef.current && !habitPickerRef.current.contains(e.target as Element)) {
        setHabitPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [habitPickerOpen]);

  const handleQuestionTextChange = (value: string) => {
    if (!activeNode) return;
    updateNode(activeNode.id, { question_text: value });

    // Task 4: detect "@habit" — opens the habit-loop template picker.
    if (value.toLowerCase().includes("@habit")) {
      setHabitPickerOpen(true);
      setSkillPickerOpen(false);
      return;
    }

    // Task 3: detect "@" — opens the skill picker.
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(" ") && textAfterAt.length <= 30) {
        setSkillPickerOpen(true);
        setSkillPickerQuery(textAfterAt);
        setHabitPickerOpen(false);
        return;
      }
    }
    setSkillPickerOpen(false);
    setHabitPickerOpen(false);
  };

  // Task 4: insert a habit reference. Stores ONLY a lightweight HabitNote on
  // the node (read-only summary). The real habit record lives in IDB, attached
  // to a Milestone — never inside the node (so mind edits can't overwrite it).
  const handleInsertHabit = (habit: { id: string; newRoutine: string; anchorHabit: string; timing: "before" | "after"; reward: string; }) => {
    if (!activeNode) return;
    const summary = `I always ${habit.newRoutine} ${habit.timing} ${habit.anchorHabit}, then ${habit.reward}`;
    const habitNote: HabitNote = { habitId: habit.id, summary };
    updateNode(activeNode.id, { habitNote, question_text: summary });
    setHabitPickerOpen(false);
    toast({ title: "Habit note added", description: "The habit is tracked in its Milestone — this is a read-only reference." });
  };

  // Task 4: create a new habit from the fill-in-the-blank template + attach.
  const [habitTemplate, setHabitTemplate] = useState({ newRoutine: "", anchorHabit: "", timing: "after" as "before" | "after", reward: "" });
  const handleCreateHabitFromTemplate = () => {
    if (!habitTemplate.newRoutine.trim() || !habitTemplate.anchorHabit.trim() || !habitTemplate.reward.trim()) {
      toast({ title: "Fill in all blanks", description: "Complete the habit-loop template.", variant: "destructive" });
      return;
    }
    const newHabit = {
      id: crypto.randomUUID(),
      newRoutine: habitTemplate.newRoutine.trim(),
      anchorHabit: habitTemplate.anchorHabit.trim(),
      timing: habitTemplate.timing,
      reward: habitTemplate.reward.trim(),
      topic: mindTopic,
      completionLog: [],
      targetStreak: 7,
      // eslint-disable-next-line react-hooks/purity -- Date.now() inside an event handler (handleCreateHabitFromTemplate); fires only on user click, never during render.
      createdAt: Date.now(),
    };
    // Persist the real habit record to IDB (separate from the node).
    void idb.put("habits", newHabit);
    handleInsertHabit(newHabit);
    setHabitTemplate({ newRoutine: "", anchorHabit: "", timing: "after", reward: "" });
  };

  const handleInsertSkill = (skill: SkillEntry) => {
    if (!activeNode) return;
    const skillRef: NodeSkillReference = {
      skillId: skill.id,
      version: skill.version,
      title: skill.title,
      steps: skill.steps,
      // eslint-disable-next-line react-hooks/purity -- Date.now() inside an event handler (handleInsertSkill); fires only on user click, never during render.
      insertedAt: Date.now(),
    };
    const firstStep = skill.steps[0];
    const keywords = firstStep?.keywords ?? [];
    const autoText = firstStep
      ? `${firstStep.action}${firstStep.tool ? ` (Tool: ${firstStep.tool})` : ""}${keywords.length > 0 ? ` [${keywords.join(", ")}]` : ""}`
      : skill.title;
    updateNode(activeNode.id, { question_text: autoText, skillRef });
    setSkillPickerOpen(false);
    toast({ title: "Skill inserted", description: `Built with Skill: ${skill.title} (${skill.version})` });
  };

  const handleUpdateSkill = async () => {
    if (!activeNode?.skillRef) return;
    const latest = await idb.get<SkillEntry>("skills", activeNode.skillRef.skillId);
    if (!latest) {
      toast({ title: "Skill not found", description: "The source skill may have been deleted.", variant: "destructive" });
      return;
    }
    if (latest.version === activeNode.skillRef.version) {
      toast({ title: "Already up to date", description: `v${activeNode.skillRef.version} is the latest.` });
      return;
    }
    const updated: NodeSkillReference = {
      ...activeNode.skillRef,
      version: latest.version,
      title: latest.title,
      steps: latest.steps,
      // eslint-disable-next-line react-hooks/purity -- Date.now() inside an async event handler (handleUpdateSkill); fires only on user click, never during render.
      insertedAt: Date.now(),
    };
    updateNode(activeNode.id, { skillRef: updated });
    toast({ title: "Updated", description: `Updated to ${latest.title} (${latest.version})` });
  };

  // Run topology validation live so creators see problems before running.
  const issues: MindIssue[] = useMemo(
    () => validateMind(
      { id: mindId, title: mindTitle, category: "", description: "", root_node_id: rootNodeId, created_at: 0 } as Mind,
      nodes,
    ),
    [mindId, mindTitle, rootNodeId, nodes],
  );
  const errorCount = issues.filter(i => i.level === "error").length;
  const warningCount = issues.filter(i => i.level === "warning").length;

  const makeNewNode = (type: "question" | "outcome"): Node => ({
    id: crypto.randomUUID(),
    mind_id: mindId,
    node_type: type,
    question_text: type === "question" ? "" : undefined,
    if_true_node_id: null,
    if_false_node_id: null,
    result_text: type === "outcome" ? "" : undefined,
    next_steps: type === "outcome" ? "" : undefined,
  });

  const addNode = () => {
    const n = makeNewNode("question");
    setNodes(prev => [...prev, n]);
    if (!rootNodeId) setRootNodeId(n.id);
    setActiveNodeId(n.id);
  };

  const updateNode = (id: string, updates: Partial<Node>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const deleteNode = (id: string) => {
    // Capture the exact incoming branches so undo can restore them.
    const links: Array<{ fromId: string; branch: "if_true_node_id" | "if_false_node_id" }> = [];
    for (const n of nodes) {
      if (n.if_true_node_id === id) links.push({ fromId: n.id, branch: "if_true_node_id" });
      if (n.if_false_node_id === id) links.push({ fromId: n.id, branch: "if_false_node_id" });
    }
    const nodeToDelete = nodes.find(n => n.id === id);

    // Compute the next state OUTSIDE the setNodes updater. Calling
    // setRootNodeId / setActiveNodeId from inside another setter's updater
    // is a React anti-pattern that can produce stale-state warnings and
    // out-of-order batching bugs.
    const next = nodes
      .filter(n => n.id !== id)
      .map(n => ({
        ...n,
        if_true_node_id: n.if_true_node_id === id ? null : n.if_true_node_id,
        if_false_node_id: n.if_false_node_id === id ? null : n.if_false_node_id,
      }));

    setNodes(next);
    if (rootNodeId === id) setRootNodeId(next.length > 0 ? next[0].id : null);
    setActiveNodeId(next.length > 0 ? (next[0]?.id ?? null) : null);

    if (nodeToDelete) {
      setLastDeleted({ node: nodeToDelete, links });
      toast({
        title: "Node deleted",
        description: "Tap undo to restore it.",
        action: <Button size="sm" variant="outline" onClick={undoDelete} className="gap-1"><Undo2 className="w-3 h-3" /> Undo</Button>,
        duration: 6000,
      });
    }
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    const { node, links } = lastDeleted;
    setNodes(prev => {
      // Restore the node and re-link the exact incoming branches.
      const restored = prev.map(n => {
        const match = links.find(l => l.fromId === n.id);
        if (!match) return n;
        return { ...n, [match.branch]: node.id };
      });
      return [...restored, node];
    });
    // If there was no root at all (the canvas was emptied by the delete),
    // restore this node as the root. Otherwise keep the current root to
    // avoid an unexpected jump.
    setRootNodeId((currentRoot) => currentRoot ?? node.id);
    setActiveNodeId(node.id);
    setLastDeleted(null);
    toast({ title: "Node restored" });
  };

  /**
   * Handle YES / NO branch changes.
   * Sentinel values: NONE → null, NEW_Q / NEW_O → create & link new node
   */
  const handleBranchChange = (
    prop: "if_true_node_id" | "if_false_node_id",
    val: string
  ) => {
    if (!activeNodeId) return;

    if (val === NONE) {
      updateNode(activeNodeId, { [prop]: null });
      return;
    }

    if (val === NEW_Q || val === NEW_O) {
      const newNode = makeNewNode(val === NEW_Q ? "question" : "outcome");
      setNodes(prev => {
        const updated = prev.map(n =>
          n.id === activeNodeId ? { ...n, [prop]: newNode.id } : n
        );
        return [...updated, newNode];
      });
      setActiveNodeId(newNode.id);
      return;
    }

    updateNode(activeNodeId, { [prop]: val });
  };

  /* Build the option list for a branch dropdown */
  const branchOptions = (excludeId: string) => [
    { value: NONE,  label: "— none —" },
    { value: NEW_Q, label: "+ Link to a New Question" },
    { value: NEW_O, label: "+ Link to a New Outcome" },
    ...nodes
      .filter(n => n.id !== excludeId)
      .map(n => ({
        value: n.id,
        label: `${n.node_type === "question" ? "Q" : "↳"}: ${
          (n.node_type === "question" ? n.question_text : n.result_text) || "Untitled"
        }`.slice(0, 55),
      })),
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "html" | "pdf") => {
    const file = e.target.files?.[0];
    if (!file || !activeNodeId) return undefined;

    if (type === "image" && file.size > 1024 * 1024) {
      toast({ title: "Validation Error", description: "Image must be < 1MB", variant: "destructive" });
      return;
    }
    if (type === "html" && file.size > 100 * 1024) {
      toast({ title: "Validation Error", description: "HTML must be < 100KB", variant: "destructive" });
      return;
    }
    if (type === "pdf" && file.size > 100 * 1024) {
      toast({ title: "Validation Error", description: "PDF must be < 100KB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as string;
      const newAtt = { type, name: file.name, data, size: file.size };
      const activeNode = nodes.find(n => n.id === activeNodeId);
      if (activeNode) {
        const updatedAttachments = [...(activeNode.attachments || []), newAtt];
        updateNode(activeNodeId, { attachments: updatedAttachments });
      }
    };
    if (type === "html") reader.readAsText(file);
    else reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    if (!activeNodeId) return;
    const activeNode = nodes.find(n => n.id === activeNodeId);
    if (activeNode && activeNode.attachments) {
      const updatedAttachments = [...activeNode.attachments];
      updatedAttachments.splice(idx, 1);
      updateNode(activeNodeId, { attachments: updatedAttachments });
    }
  };

  return (
    <div className="flex h-[520px] border border-border/50 rounded-[16px] overflow-hidden bg-background">

      {/* ── Left: Node List ── */}
      <div className="w-[220px] shrink-0 border-r border-border/50 flex flex-col bg-card/50">
        <div className="p-3 border-b border-border/50 flex justify-between items-center bg-card">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Nodes ({nodes.length})
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={addNode}
            aria-label="Add a question node"
            className="h-7 px-2"
            data-testid="button-add-node"
            title="Add Logic Node"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {nodes.map((node, idx) => (
              <button
                key={node.id}
                onClick={() => setActiveNodeId(node.id)}
                data-testid={`node-item-${node.id}`}
                className={`w-full text-left p-2 rounded-md flex items-start gap-2 text-sm transition-colors ${
                  activeNodeId === node.id
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <span className="mt-0.5 shrink-0 font-bold text-xs">
                  {node.node_type === "question" ? "Q" : "↳"}&nbsp;{idx + 1}
                </span>
                <span className="truncate leading-snug">
                  {node.node_type === "question"
                    ? (node.question_text || "Untitled question")
                    : (node.result_text || "Untitled outcome")}
                </span>
                {rootNodeId === node.id && (
                  <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    Root
                  </span>
                )}
              </button>
            ))}
            {nodes.length === 0 && (
              <p className="text-center p-4 text-xs text-muted-foreground">
                No nodes yet. Click&nbsp;+ to add one.
              </p>
            )}
          </div>
        </ScrollArea>

        <p className="p-2 text-[11px] text-muted-foreground border-t border-border/50 leading-snug">
          Self-referencing binary tree. First node becomes the root.
        </p>
      </div>

      {/* ── Right: Editor ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topology validation bar */}
        <div className="px-3 py-2 border-b border-border/50 bg-card/40 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => setShowIssues(s => !s)}
            className="flex items-center gap-2 text-xs font-medium"
            aria-expanded={showIssues}
          >
            {errorCount === 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                {warningCount === 0 ? "No problems found" : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                {errorCount} error{errorCount === 1 ? "" : "s"}
                {warningCount > 0 && ` · ${warningCount} warning${warningCount === 1 ? "" : "s"}`}
              </span>
            )}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowIssues(s => !s)}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Check for problems
          </Button>
        </div>

        {showIssues && (
          <div className="max-h-36 overflow-y-auto border-b border-border/50 bg-background/60 px-3 py-2 space-y-1 shrink-0">
            {issues.length === 0 ? (
              <p className="text-xs text-muted-foreground">This mind is ready to run. Every question leads to an outcome.</p>
            ) : (
              issues.map((issue, i) => (
                <button
                  key={i}
                  onClick={() => issue.nodeId && setActiveNodeId(issue.nodeId)}
                  className={`w-full text-left text-xs flex items-start gap-2 px-2 py-1 rounded ${
                    issue.nodeId ? "hover:bg-muted cursor-pointer" : ""
                  } ${issue.level === "error" ? "text-destructive" : "text-amber-500"}`}
                >
                  {issue.level === "error" ? <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> : <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />}
                  <span>{issue.message}{issue.nodeId ? " — tap to jump" : ""}</span>
                </button>
              ))
            )}
          </div>
        )}

        {activeNode ? (
          <>
            {/* Header row: node type selector + delete */}
            <div className="p-3 border-b border-border/50 flex justify-between items-center gap-2 bg-card/30 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Node</span>
                <Select
                  value={activeNode.node_type}
                  onValueChange={(val: "question" | "outcome") =>
                    updateNode(activeNode.id, { node_type: val })
                  }
                >
                  <SelectTrigger className="w-[150px] h-8 text-xs font-mono" data-testid="select-node-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="question">question</SelectItem>
                    <SelectItem value="outcome">outcome</SelectItem>
                  </SelectContent>
                </Select>

                {rootNodeId !== activeNode.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRootNodeId(activeNode.id)}
                aria-label={`Set ${activeNode.node_type === "question" ? "question" : "outcome"} as the starting node`}
                className="h-8 text-xs font-mono"
                data-testid="button-set-root"
              >
                    Set as Root
                  </Button>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteNode(activeNode.id)}
                aria-label="Delete this node"
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                data-testid="button-delete-node"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">

                {/* ── QUESTION node ── */}
                {activeNode.node_type === "question" && (
                  <>
                    <div className="space-y-2 relative">
                      <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        Question Text <span className="text-muted-foreground/60 normal-case">(type @ to insert a Skill)</span>
                      </Label>
                      <Input
                        value={activeNode.question_text || ""}
                        onChange={e => handleQuestionTextChange(e.target.value)}
                        placeholder="e.g., Is the roof angle greater than 30 degrees? (type @ for skills)"
                        data-testid="input-question-text"
                      />

                      {/* Part 2 Task 3/7: @Skill mention picker */}
                      {skillPickerOpen && (
                        <div
                          ref={skillPickerRef}
                          className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto"
                        >
                          <div className="p-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border/50">
                            {contextAwareSkills.length > 0 ? "Suggested skills (context-aware)" : "No skills match — create one in the Skill Store first"}
                          </div>
                          {contextAwareSkills.map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => handleInsertSkill(skill)}
                              className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-start gap-2 border-b border-border/30 last:border-0"
                            >
                              <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{skill.title}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{skill.id} · {skill.steps.length} steps</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Part 2 Task 3: "Built with Skill" badge + update action */}
                    {activeNode.skillRef && (
                      <div className="flex items-center justify-between gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-primary">Built with Skill: {activeNode.skillRef.title} ({activeNode.skillRef.version})</p>
                            <p className="text-[10px] text-muted-foreground">Snapshot copied — mind works standalone.</p>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => void handleUpdateSkill()}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Update
                        </Button>
                      </div>
                    )}

                    {/* Part 2 Task 4: @habit picker — habit-loop template */}
                    {habitPickerOpen && (
                      <div
                        ref={habitPickerRef}
                        className="relative z-50 bg-popover border border-border rounded-lg shadow-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Habit Loop Template</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setHabitPickerOpen(false)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Existing matching habits (click to insert) */}
                        {matchingHabits.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">Existing habits matching "{mindTopic}":</p>
                            {matchingHabits.slice(0, 5).map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => handleInsertHabit(h)}
                                className="w-full text-left px-2 py-1.5 hover:bg-accent/50 rounded text-xs border border-border/30"
                              >
                                I always {h.newRoutine} {h.timing} {h.anchorHabit}, then {h.reward}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Fill-in-the-blank template for a new habit */}
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <p className="text-[10px] text-muted-foreground">Or create a new habit:</p>
                          <div className="text-sm text-foreground/90 leading-relaxed">
                            I always
                            <Input
                              className="inline-flex h-7 mx-1 w-40 text-xs"
                              placeholder="new routine"
                              value={habitTemplate.newRoutine}
                              onChange={(e) => setHabitTemplate({ ...habitTemplate, newRoutine: e.target.value })}
                            />
                            <Select
                              value={habitTemplate.timing}
                              onValueChange={(v: "before" | "after") => setHabitTemplate({ ...habitTemplate, timing: v })}
                            >
                              <SelectTrigger className="inline-flex h-7 mx-1 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="before">before</SelectItem>
                                <SelectItem value="after">after</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              className="inline-flex h-7 mx-1 w-40 text-xs"
                              placeholder="anchor habit"
                              value={habitTemplate.anchorHabit}
                              onChange={(e) => setHabitTemplate({ ...habitTemplate, anchorHabit: e.target.value })}
                            />
                            , then
                            <Input
                              className="inline-flex h-7 mx-1 w-32 text-xs"
                              placeholder="reward"
                              value={habitTemplate.reward}
                              onChange={(e) => setHabitTemplate({ ...habitTemplate, reward: e.target.value })}
                            />
                          </div>
                          <Button type="button" size="sm" className="w-full" onClick={handleCreateHabitFromTemplate}>
                            Create habit + attach
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Part 2 Task 4: Habit Note — lightweight read-only reference */}
                    {activeNode.habitNote && (
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                        <Target className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Habit Note</p>
                          <p className="text-[11px] text-muted-foreground italic">{activeNode.habitNote.summary}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">Read-only — edit the habit in its Milestone.</p>
                        </div>
                      </div>
                    )}

                    {/* YES branch */}
                    <BranchCard
                      label="YES →"
                      prop="if_true_node_id"
                      currentValue={activeNode.if_true_node_id ?? NONE}
                      options={branchOptions(activeNode.id)}
                      onChange={val => handleBranchChange("if_true_node_id", val)}
                      onGo={() => activeNode.if_true_node_id && setActiveNodeId(activeNode.if_true_node_id)}
                      canGo={!!activeNode.if_true_node_id}
                      accent="yes"
                    />

                    {/* NO branch */}
                    <BranchCard
                      label="NO →"
                      prop="if_false_node_id"
                      currentValue={activeNode.if_false_node_id ?? NONE}
                      options={branchOptions(activeNode.id)}
                      onChange={val => handleBranchChange("if_false_node_id", val)}
                      onGo={() => activeNode.if_false_node_id && setActiveNodeId(activeNode.if_false_node_id)}
                      canGo={!!activeNode.if_false_node_id}
                      accent="no"
                    />
                  </>
                )}

                {/* ── OUTCOME node ── */}
                {activeNode.node_type === "outcome" && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        Result Text
                      </Label>
                      <Input
                        value={activeNode.result_text || ""}
                        onChange={e => updateNode(activeNode.id, { result_text: e.target.value })}
                        placeholder="e.g., Recommendation: Use Fixed Tilt Brackets"
                        data-testid="input-result-text"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        Next Steps
                      </Label>
                      <Textarea
                        value={activeNode.next_steps || ""}
                        onChange={e => updateNode(activeNode.id, { next_steps: e.target.value })}
                        placeholder="Detailed action plan for the user"
                        className="min-h-[160px]"
                        data-testid="textarea-next-steps"
                      />
                    </div>
                  </>
                )}

                {/* ── Attachments ── */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Node Attachments (optional)
                  </Label>
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <div className="h-8 border border-border/50 rounded flex items-center justify-center bg-card hover:bg-muted transition-colors text-xs font-medium text-foreground gap-2">
                        <ImageIcon className="w-3 h-3 text-muted-foreground" /> Image
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, "image")} />
                    </label>
                    <label className="flex-1 cursor-pointer">
                      <div className="h-8 border border-border/50 rounded flex items-center justify-center bg-card hover:bg-muted transition-colors text-xs font-medium text-foreground gap-2">
                        <FileCode2 className="w-3 h-3 text-muted-foreground" /> HTML
                      </div>
                      <input type="file" accept="text/html,.html" className="hidden" onChange={e => handleFileUpload(e, "html")} />
                    </label>
                    <label className="flex-1 cursor-pointer">
                      <div className="h-8 border border-border/50 rounded flex items-center justify-center bg-card hover:bg-muted transition-colors text-xs font-medium text-foreground gap-2">
                        <FileText className="w-3 h-3 text-muted-foreground" /> PDF
                      </div>
                      <input type="file" accept="application/pdf" className="hidden" onChange={e => handleFileUpload(e, "pdf")} />
                    </label>
                  </div>
                  
                  {activeNode.attachments && activeNode.attachments.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {activeNode.attachments.map((att, idx) => (
                        <div key={idx} className="relative border border-border/50 bg-card rounded p-2 flex items-center gap-2 group">
                          {att.type === "image" && (
                            <div className="w-8 h-8 shrink-0 bg-muted rounded overflow-hidden">
                              <img src={att.data} alt={att.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            </div>
                          )}
                          {(att.type === "html" || att.type === "pdf") && (
                            <div className="w-8 h-8 shrink-0 bg-muted rounded flex items-center justify-center">
                              {att.type === "html" ? <FileCode2 className="w-4 h-4 text-muted-foreground" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" title={att.name}>{att.name}</p>
                            <p className="text-[10px] text-muted-foreground">{(att.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            onClick={() => removeAttachment(idx)}
                            aria-label="Remove attachment"
                            className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow-sm"
                          >
                            <X className="w-3 h-3" aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a node to edit. First node will become root.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Branch Card sub-component ── */
interface BranchCardProps {
  label: string;
  prop: string;
  currentValue: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  onGo: () => void;
  canGo: boolean;
  accent: "yes" | "no";
}

function BranchCard({ label, currentValue, options, onChange, onGo, canGo, accent }: BranchCardProps) {
  const accentClass = accent === "yes"
    ? "border-emerald-500/30 bg-emerald-500/5"
    : "border-red-500/30 bg-red-500/5";
  const labelClass = accent === "yes" ? "text-emerald-400" : "text-red-400";
  const pillClass  = accent === "yes"
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : "bg-red-500/10 text-red-400 border-red-500/30";

  return (
    <div className={`rounded-[16px] border p-4 space-y-3 ${accentClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${pillClass}`}>
            {accent === "yes" ? "if_true" : "if_false"}
          </span>
          <span className={`text-sm font-bold ${labelClass}`}>{label}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onGo}
          disabled={!canGo}
          aria-label="Jump to linked node"
          className="h-7 px-2 text-xs font-mono"
          data-testid={`button-go-${accent}`}
          title="Jump to linked node"
        >
          Go <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      <Select value={currentValue} onValueChange={onChange}>
        <SelectTrigger data-testid={`select-branch-${accent}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
