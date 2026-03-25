import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type SubmissionWithAssignment = Tables<"submissions"> & { assignments?: { title: string; type: string } | null };

export default function Submissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionWithAssignment[]>([]);
  const [grading, setGrading] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: courses } = await supabase.from("courses").select("id").eq("instructor_id", user.id);
    const courseIds = courses?.map(c => c.id) || [];
    if (!courseIds.length) return;
    const { data: assignmentData } = await supabase.from("assignments").select("id, title, type, course_id").in("course_id", courseIds);
    const assignmentIds = assignmentData?.map(a => a.id) || [];
    if (!assignmentIds.length) return;
    const { data } = await supabase.from("submissions").select("*").in("assignment_id", assignmentIds).order("submitted_at", { ascending: false });
    const mapped = (data || []).map(s => ({
      ...s,
      assignments: assignmentData?.find(a => a.id === s.assignment_id) ? { title: assignmentData.find(a => a.id === s.assignment_id)!.title, type: assignmentData.find(a => a.id === s.assignment_id)!.type } : null,
    }));
    setSubmissions(mapped);
  };

  useEffect(() => { load(); }, [user]);

  const grade = async (id: string) => {
    setGrading(id);
    try {
      const { error } = await supabase.functions.invoke("grade-submission", { body: { submissionId: id } });
      if (error) throw error;
      toast.success("Graded!");
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGrading(null);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">All Submissions</h1>
      <div className="space-y-3">
        {submissions.map(s => (
          <Card key={s.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.assignments?.title || "Unknown"}</div>
                <div className="text-sm text-muted-foreground">
                  {s.status.replace(/_/g, " ")} · {new Date(s.submitted_at).toLocaleDateString()}
                  {s.total_score != null && ` · ${s.total_score}/${s.max_possible_score}`}
                </div>
              </div>
              {s.status === "submitted" && (
                <Button size="sm" onClick={() => grade(s.id)} disabled={grading === s.id}>
                  {grading === s.id ? "Grading..." : "Grade"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {submissions.length === 0 && <p className="text-muted-foreground text-center py-12">No submissions yet.</p>}
      </div>
    </div>
  );
}
