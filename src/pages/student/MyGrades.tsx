import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type SubmissionWithDetails = Tables<"submissions"> & {
  assignments: { title: string; type: string } | null;
  grades: (Tables<"grades"> & { rubrics: { criterion: string; max_points: number } | null })[];
};

export default function MyGrades() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [appealReason, setAppealReason] = useState("");
  const [appealingId, setAppealingId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("submissions")
      .select("*, assignments(title, type), grades(*, rubrics(criterion, max_points))")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false });
    setSubmissions((data as any) || []);
  };

  useEffect(() => { load(); }, [user]);

  const requestReverification = async (sub: SubmissionWithDetails) => {
    if (!user || !appealReason.trim()) return;
    const { error } = await supabase.from("re_verification_requests").insert({
      submission_id: sub.id,
      student_id: user.id,
      reason: appealReason,
      previous_score: sub.total_score,
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from("submissions").update({ status: "re_verification_requested" }).eq("id", sub.id);
    toast.success("Re-verification requested!");
    setAppealingId(null);
    setAppealReason("");
    load();
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      submitted: "bg-yellow-100 text-yellow-800",
      grading: "bg-blue-100 text-blue-800",
      graded: "bg-green-100 text-green-800",
      re_verification_requested: "bg-orange-100 text-orange-800",
      re_graded: "bg-purple-100 text-purple-800",
    };
    return map[s] || "bg-secondary";
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">My Grades</h1>
      <div className="space-y-4">
        {submissions.map(s => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{s.assignments?.title || "Assignment"}</CardTitle>
                <span className={`text-xs px-2 py-1 rounded ${statusColor(s.status)}`}>
                  {s.status.replace(/_/g, " ")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.total_score != null && (
                <div className="text-2xl font-bold">
                  {s.total_score} / {s.max_possible_score}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({Math.round((s.total_score / (s.max_possible_score || 1)) * 100)}%)
                  </span>
                </div>
              )}

              {s.grades && s.grades.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Score Breakdown:</div>
                  {s.grades.map((g: any) => (
                    <div key={g.id} className="flex justify-between items-start p-2 bg-muted rounded">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{g.rubrics?.criterion}</div>
                        {g.feedback && <div className="text-xs text-muted-foreground mt-1">{g.feedback}</div>}
                      </div>
                      <Badge variant="outline">{g.score}/{g.rubrics?.max_points}</Badge>
                    </div>
                  ))}
                </div>
              )}

              {s.ai_feedback && (
                <div className="p-3 bg-muted rounded-md">
                  <div className="text-sm font-medium mb-1">AI Feedback:</div>
                  <p className="text-sm whitespace-pre-wrap">{s.ai_feedback}</p>
                </div>
              )}

              {s.status === "graded" && (
                <Dialog open={appealingId === s.id} onOpenChange={(open) => { setAppealingId(open ? s.id : null); setAppealReason(""); }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">Request Re-verification</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Request Re-verification</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Explain why you believe the grading should be reviewed. The AI will re-evaluate your submission with your context.
                      </p>
                      <Textarea
                        placeholder="Explain your concern..."
                        value={appealReason}
                        onChange={e => setAppealReason(e.target.value)}
                        rows={4}
                      />
                      <Button onClick={() => requestReverification(s)} disabled={!appealReason.trim()} className="w-full">
                        Submit Appeal
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        ))}
        {submissions.length === 0 && <p className="text-muted-foreground text-center py-12">No submissions yet.</p>}
      </div>
    </div>
  );
}
