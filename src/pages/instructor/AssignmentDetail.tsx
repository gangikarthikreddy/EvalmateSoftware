import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type StudentProfile = { full_name: string; email: string | null };
type SubmissionWithProfile = Tables<"submissions"> & { profile?: StudentProfile | null };

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Tables<"assignments"> | null>(null);
  const [rubrics, setRubrics] = useState<Tables<"rubrics">[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionWithProfile[]>([]);
  const [grading, setGrading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});

  const getSignedUrl = async (path?: string | null) => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("instructor-docs").createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  };

  const load = async () => {
    if (!assignmentId) return;
    const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
    setAssignment(a as any);

    const { data: r } = await supabase.from("rubrics").select("*").eq("assignment_id", assignmentId).order("sort_order");
    setRubrics((r as any) || []);

    const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId).order("submitted_at", { ascending: false });
    const baseSubs = (s || []) as Tables<"submissions">[];

    const studentIds = [...new Set(baseSubs.map(item => item.student_id))];
    let profileMap: Record<string, StudentProfile> = {};
    if (studentIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", studentIds);
      profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, { full_name: p.full_name, email: p.email }]));
    }

    setSubmissions(baseSubs.map(su => ({ ...su, profile: profileMap[su.student_id] || null })));

    const urls: Record<string, string> = {};
    if ((a as any)?.problem_file_path) {
      const url = await getSignedUrl((a as any).problem_file_path);
      if (url) urls.problem = url;
    }
    if ((a as any)?.criteria_file_path) {
      const url = await getSignedUrl((a as any).criteria_file_path);
      if (url) urls.criteria = url;
    }
    for (const rubric of r || []) {
      if ((rubric as any).criteria_file_path) {
        const url = await getSignedUrl((rubric as any).criteria_file_path);
        if (url) urls[rubric.id] = url;
      }
    }
    setDocUrls(urls);
  };

  useEffect(() => { load(); }, [assignmentId]);

  const gradeSubmission = async (submissionId: string) => {
    setGrading(submissionId);
    try {
      const { error } = await supabase.functions.invoke("grade-submission", { body: { submissionId } });
      if (error) throw error;
      toast.success("Grading complete");
      load();
    } catch (err: any) {
      toast.error(err.message || "Grading failed");
    } finally {
      setGrading(null);
    }
  };

  const deleteAssignment = async () => {
    if (!assignment || !window.confirm(`Delete assignment ${assignment.title}?`)) return;
    setDeleting(true);
    const { error } = await supabase.from("assignments").delete().eq("id", assignment.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Assignment deleted");
    navigate(`/courses/${assignment.course_id}`);
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

  if (!assignment) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">{assignment.title}</h1>
          <div className="text-sm text-muted-foreground">
            {assignment.type} · Max {assignment.max_score} pts
            {assignment.due_date && ` · Due ${new Date(assignment.due_date).toLocaleDateString()}`}
          </div>
        </div>
        <Button variant="destructive" onClick={deleteAssignment} disabled={deleting}>
          <Trash2 className="h-4 w-4 mr-2" />
          {deleting ? "Deleting..." : "Delete Assignment"}
        </Button>
      </div>

      {assignment.description && <p className="mb-6 text-muted-foreground whitespace-pre-wrap">{assignment.description}</p>}

      {(docUrls.problem || docUrls.criteria) && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Instructor Documents</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {docUrls.problem && <a href={docUrls.problem} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Open Assignment Problem</Button></a>}
            {docUrls.criteria && <a href={docUrls.criteria} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Open Criteria Document</Button></a>}
          </CardContent>
        </Card>
      )}

      <h2 className="text-xl font-semibold mb-3">Rubric</h2>
      <div className="grid gap-2 mb-8">
        {rubrics.map(r => (
          <Card key={r.id}>
            <CardContent className="py-3 flex justify-between items-start gap-4">
              <div>
                <div className="font-medium">{r.criterion}</div>
                {r.description && <div className="text-sm text-muted-foreground mt-1">{r.description}</div>}
                {docUrls[r.id] && <a href={docUrls[r.id]} target="_blank" rel="noreferrer" className="text-sm text-primary underline mt-2 inline-block">Open criterion file</a>}
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
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{s.profile?.full_name || "Student"}</div>
                  <div className="text-xs text-muted-foreground">{s.profile?.email || s.student_id}</div>
                  <div className="text-xs text-muted-foreground">Submitted {new Date(s.submitted_at).toLocaleString()}</div>
                  {s.total_score != null && (
                    <div className="text-sm font-semibold mt-1">Score: {s.total_score}/{s.max_possible_score}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${statusColor(s.status)}`}>{s.status.replace(/_/g, " ")}</span>
                  {s.status === "submitted" && (
                    <Button size="sm" onClick={() => gradeSubmission(s.id)} disabled={grading === s.id}>
                      {grading === s.id ? "Grading..." : "Grade with AI"}
                    </Button>
                  )}
                </div>
              </div>

              {s.ai_feedback && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  <div className="font-medium mb-1">AI Feedback</div>
                  <p className="whitespace-pre-wrap">{s.ai_feedback}</p>
                </div>
              )}

              {s.code_content && (
                <details>
                  <summary className="text-sm text-muted-foreground cursor-pointer">View submitted code</summary>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto whitespace-pre-wrap">{s.code_content}</pre>
                </details>
              )}
              {s.code_output && (
                <details open>
                  <summary className="text-sm text-muted-foreground cursor-pointer">Program output shown in browser</summary>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto whitespace-pre-wrap">{s.code_output}</pre>
                </details>
              )}
              {s.text_content && (
                <details>
                  <summary className="text-sm text-muted-foreground cursor-pointer">View written answer</summary>
                  <p className="mt-2 p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">{s.text_content}</p>
                </details>
              )}
              {s.file_url && (
                <div>
                  <Button variant="outline" size="sm" onClick={async () => {
                    const { data } = await supabase.storage.from("submissions").createSignedUrl(s.file_url!, 3600);
                    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                  }}>Open submitted file</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {submissions.length === 0 && <p className="text-muted-foreground text-center py-8">No submissions yet.</p>}
      </div>
    </div>
  );
}
