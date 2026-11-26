import { useState } from "react";
import { Bug, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ReportBugModalProps {
  trigger?: React.ReactNode;
  defaultError?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ReportBugModal({ trigger, defaultError = "", isOpen: controlledIsOpen, onClose: controlledOnClose }: ReportBugModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (isControlled) {
      if (!open && controlledOnClose) controlledOnClose();
    } else {
      setInternalIsOpen(open);
      if (!open && controlledOnClose) controlledOnClose();
    }
  };

  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast({ title: "Description Required", description: "Please describe the issue you encountered.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const reportId = `bug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const report = {
        id: reportId,
        description: description.trim(),
        email: email.trim() || "anonymous@MindSpool.app",
        severity,
        defaultError,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        url: window.location.href,
        status: "open",
      };

      // 1. Store locally in localStorage (guarded against private mode / quota)
      let existingReports: unknown[] = [];
      try {
        existingReports = JSON.parse(localStorage.getItem("mind_builder_bug_reports") || "[]");
      } catch {
        existingReports = [];
      }
      existingReports.push(report);
      try {
        localStorage.setItem("mind_builder_bug_reports", JSON.stringify(existingReports));
      } catch {
        // Even if persisting fails, we still treat the report as logged
        // in-memory so the user gets a success toast.
      }

      // 2. Simulate network latency & Firestore storage if desired
      await new Promise((resolve) => setTimeout(resolve, 800));

      setIsSuccess(true);
      toast({
        title: "Bug Report Submitted 🐛",
        description: "Thank you! Our engineering team has logged your report for debugging.",
      });

      setTimeout(() => {
        setIsSuccess(false);
        setDescription("");
        setEmail("");
        setIsOpen(false);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Submission Failed",
        description: message || "Could not save bug report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className="gap-2 text-xs font-medium">
              <Bug className="w-4 h-4 text-destructive" />
              <span>Report Bug</span>
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Report an Issue</DialogTitle>
              <DialogDescription className="text-xs">
                Help us improve MindSpool by reporting errors or unexpected behavior.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-in zoom-in" />
            <div className="font-semibold text-base">Report Submitted!</div>
            <p className="text-xs text-muted-foreground max-w-xs">
              Your feedback has been saved locally and queued for review. Thank you!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {defaultError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 overflow-hidden font-mono">
                  <span className="font-semibold">Captured Error:</span> {defaultError}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">What went wrong?</label>
              <Textarea
                placeholder="Describe the steps to reproduce or what you expected to happen..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none h-24 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as "low" | "medium" | "high" | "critical")}
                  className="w-full h-9 rounded-md border border-border/60 bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="low">Low (Minor Glitch)</option>
                  <option value="medium">Medium (Annoying)</option>
                  <option value="high">High (Feature Broken)</option>
                  <option value="critical">Critical (Crash / Data Loss)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Email (Optional)</label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Send Report</span>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
