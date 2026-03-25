import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export default function SubmitAssignment() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Tables<"assignments"> | null>(null);
  const [rubrics, setRubrics] = useState<Tables<"rubrics">[]>([]);
  const [existingSubmission, setExistingSubmission] = useState<Tables<"submissions"> | null>(null);

  const [textContent, setTextContent] = useState("");
  const [codeContent, setCodeContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!assignmentId || !user) return;
    const load = async () => {
      const { data: a } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
      setAssignment(a);
      const { data: r } = await supabase.from("rubrics").select("*").eq("assignment_id", assignmentId).order("sort_order");
      setRubrics(r || []);
      const { data: s } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId).eq("student_id", user.id).maybeSingle();
      setExistingSubmission(s);
    };
    load();
  }, [assignmentId, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !assignment) return;
    setSubmitting(true);
    try {
      let fileUrl = null;
      if (file) {
        const path = `${user.id}/${assignmentId}/${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;
        fileUrl = path;
      }

      const payload: any = {
        assignment_id: assignmentId,
        student_id: user.id,
        status: "submitted" as const,
      };
      if (assignment.type === "text") payload.text_content = textContent;
      if (assignment.type === "code") payload.code_content = codeContent;
      if (assignment.type === "file" && fileUrl) payload.file_url = fileUrl;

      const { error } = await supabase.from("submissions").insert(payload);
      if (error) throw error;

      toast.success("Submitted! AI grading will begin shortly.");
      
      // Trigger auto-grading
      const { data: sub } = await supabase.from("submissions").select("id").eq("assignment_id", assignmentId).eq("student_id", user.id).order("created_at", { ascending: false }).limit(1).single();
      if (sub) {
        supabase.functions.invoke("grade-submission", { body: { submissionId: sub.id } }).catch(console.error);
      }
      
      navigate("/my-grades");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!assignment) return <div className="p-6">Loading...</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">{assignment.title}</h1>
      <div className="text-sm text-muted-foreground mb-4">
        {assignment.type} · Max {assignment.max_score} pts
        {assignment.due_date && ` · Due ${new Date(assignment.due_date).toLocaleDateString()}`}
      </div>
      {assignment.description && <p className="mb-6 text-muted-foreground">{assignment.description}</p>}

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Rubric Criteria</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rubrics.map(r => (
            <div key={r.id} className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium">{r.criterion}</div>
                {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
              </div>
              <Badge variant="secondary">{r.max_points} pts</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {existingSubmission ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-muted-foreground">You've already submitted this assignment.</p>
            <p className="text-center text-sm mt-1">Status: <span className="capitalize font-medium">{existingSubmission.status.replace(/_/g, " ")}</span></p>
            {existingSubmission.total_score != null && (
              <p className="text-center text-lg font-bold mt-2">{existingSubmission.total_score}/{existingSubmission.max_possible_score}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {assignment.type === "text" && (
            <div className="space-y-2">
              <Label>Your Answer</Label>
              <Textarea value={textContent} onChange={e => setTextContent(e.target.value)} rows={10} required placeholder="Write your answer here..." />
            </div>
          )}
          {assignment.type === "code" && (
            <div className="space-y-2">
              <Label>Your Code {assignment.programming_language && `(${assignment.programming_language})`}</Label>
              <Textarea
                value={codeContent}
                onChange={e => setCodeContent(e.target.value)}
                rows={15}
                required
                placeholder="Write your code here..."
                className="font-mono text-sm"
              />
            </div>
          )}
          {assignment.type === "file" && (
            <div className="space-y-2">
              <Label>Upload File</Label>
              <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} required />
            </div>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting..." : "Submit Assignment"}
          </Button>
        </form>
      )}
    </div>
  );
}
