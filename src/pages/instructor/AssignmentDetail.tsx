import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const [assignment, setAssignment] = useState<Tables<"assignments"> | null>(null);
  const [rubrics, setRubrics] = useState<Tables<"rubrics">[]>([]);
  const [submissions, setSubmissions] = useState<(Tables<"submissions"> & { profiles?: { full_name: string } })[]>([]);
  const [grading, setGrading] = useState<string | null>(null);

  const load = async () => {
    if (!assignmentId) return;
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a);
    const { data: r } = await supabase.from("rubrics").select("*").eq("assignment_id", assignmentId).order("sort_order");
    setRubrics(r || []);
    const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId).order("submitted_at", { ascending: false });
    setSubmissions(s || []);
  };

  useEffect(() => { load(); }, [assignmentId]);

  const gradeSubmission = async (submissionId: string) => {
    setGrading(submissionId);
    try {
      const { data, error } = await supabase.functions.invoke("grade-submission", {
        body: { submissionId },
      });
      if (error) throw error;
      toast.success("Grading complete!");
      load();
    } catch (err: any) {
      toast.error(err.message || "Grading failed");
    } finally {
      setGrading(null);
    }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      submitted: "bg-yellow-100 text-yellow-800",
      grading: "bg-blue-100 text-blue-800",
      graded: "bg-green-100 text-green-800",
      re_verification_requested: "bg-orange-100 text-orange-800",
    };
    return map[s] || "bg-secondary";
  };

  if (!assignment) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">{assignment.title}</h1>
      <div className="text-sm text-muted-foreground mb-6">
        {assignment.type} · Max {assignment.max_score} pts
        {assignment.due_date && ` · Due ${new Date(assignment.due_date).toLocaleDateString()}`}
      </div>

      {assignment.description && <p className="mb-6 text-muted-foreground">{assignment.description}</p>}

      <h2 className="text-xl font-semibold mb-3">Rubric</h2>
      <div className="grid gap-2 mb-8">
        {rubrics.map(r => (
          <Card key={r.id}>
            <CardContent className="py-3 flex justify-between items-start">
              <div>
                <div className="font-medium">{r.criterion}</div>
                {r.description && <div className="text-sm text-muted-foreground mt-1">{r.description}</div>}
              </div>
              <Badge variant="secondary">{r.max_points} pts</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-3">Submissions ({submissions.length})</h2>
      <div className="space-y-3">
        {submissions.map(s => (
          <Card key={s.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Student ID: {s.student_id.slice(0, 8)}...</div>
                  <div className="text-xs text-muted-foreground">
                    Submitted {new Date(s.submitted_at).toLocaleString()}
                  </div>
                  {s.total_score != null && (
                    <div className="text-sm font-semibold mt-1">Score: {s.total_score}/{s.max_possible_score}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${statusColor(s.status)}`}>
                    {s.status.replace(/_/g, " ")}
                  </span>
                  {s.status === "submitted" && (
                    <Button size="sm" onClick={() => gradeSubmission(s.id)} disabled={grading === s.id}>
                      {grading === s.id ? "Grading..." : "Grade with AI"}
                    </Button>
                  )}
                </div>
              </div>
              {s.ai_feedback && (
                <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                  <div className="font-medium mb-1">AI Feedback:</div>
                  <p className="whitespace-pre-wrap">{s.ai_feedback}</p>
                </div>
              )}
              {s.code_content && (
                <details className="mt-2">
                  <summary className="text-sm text-muted-foreground cursor-pointer">View Code</summary>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto">{s.code_content}</pre>
                </details>
              )}
              {s.text_content && (
                <details className="mt-2">
                  <summary className="text-sm text-muted-foreground cursor-pointer">View Text</summary>
                  <p className="mt-2 p-3 bg-muted rounded-md text-sm">{s.text_content}</p>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
        {submissions.length === 0 && <p className="text-muted-foreground text-center py-8">No submissions yet.</p>}
      </div>
    </div>
  );
}
