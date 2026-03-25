import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type ReVerification = Tables<"re_verification_requests">;

export default function Reverifications() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ReVerification[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: courses } = await supabase.from("courses").select("id").eq("instructor_id", user.id);
    const cIds = courses?.map(c => c.id) || [];
    if (!cIds.length) return;
    const { data: assignments } = await supabase.from("assignments").select("id").in("course_id", cIds);
    const aIds = assignments?.map(a => a.id) || [];
    if (!aIds.length) return;
    const { data: subs } = await supabase.from("submissions").select("id").in("assignment_id", aIds);
    const sIds = subs?.map(s => s.id) || [];
    if (!sIds.length) return;
    const { data } = await supabase.from("re_verification_requests").select("*").in("submission_id", sIds).order("created_at", { ascending: false });
    setRequests(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const handleReGrade = async (req: ReVerification) => {
    setProcessing(req.id);
    try {
      const { error } = await supabase.functions.invoke("re-verify", {
        body: { submissionId: req.submission_id, requestId: req.id, reason: req.reason, instructorNotes: notes[req.id] || "" },
      });
      if (error) throw error;
      toast.success("Re-verification complete!");
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (req: ReVerification) => {
    await supabase.from("re_verification_requests").update({ status: "rejected", instructor_notes: notes[req.id] || "Rejected" }).eq("id", req.id);
    toast.success("Request rejected");
    load();
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Re-verification Queue</h1>
      <div className="space-y-4">
        {requests.map(r => (
          <Card key={r.id}>
            <CardContent className="py-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">Submission: {r.submission_id.slice(0, 8)}...</div>
                  <div className="text-sm text-muted-foreground capitalize">Status: {r.status}</div>
                  <div className="text-sm mt-1"><strong>Reason:</strong> {r.reason}</div>
                  {r.previous_score != null && <div className="text-sm">Previous: {r.previous_score} → New: {r.new_score ?? "pending"}</div>}
                </div>
              </div>
              {r.status === "pending" && (
                <>
                  <Textarea
                    placeholder="Instructor notes..."
                    value={notes[r.id] || ""}
                    onChange={e => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleReGrade(r)} disabled={processing === r.id}>
                      {processing === r.id ? "Re-grading..." : "Re-grade with AI"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(r)}>Reject</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
        {requests.length === 0 && <p className="text-muted-foreground text-center py-12">No re-verification requests.</p>}
      </div>
    </div>
  );
}
