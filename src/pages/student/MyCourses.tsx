import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type EnrollmentRow = Tables<"course_enrollments"> & { courses: Tables<"courses"> };

export default function MyCourses() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Tables<"assignments">[]>>({});
  const [enrollCode, setEnrollCode] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: enr } = await supabase.from("course_enrollments").select("*, courses(*)").eq("student_id", user.id);
    setEnrollments((enr as any) || []);
    const courseIds = (enr || []).map((e: any) => e.course_id);
    if (!courseIds.length) {
      setAssignments({});
      return;
    }
    const { data: a } = await supabase.from("assignments").select("*").in("course_id", courseIds).order("due_date");
    const grouped: Record<string, Tables<"assignments">[]> = {};
    (a || []).forEach((assignment: any) => {
      if (!grouped[assignment.course_id]) grouped[assignment.course_id] = [];
      grouped[assignment.course_id].push(assignment);
    });
    setAssignments(grouped);
  };

  useEffect(() => { load(); }, [user]);

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { data: course } = await supabase.from("courses").select("id").eq("code", enrollCode).single();
    if (!course) { toast.error("Course not found"); return; }
    const { error } = await supabase.from("course_enrollments").insert({ course_id: course.id, student_id: user.id });
    if (error) { toast.error(error.message.includes("duplicate") ? "Already enrolled" : error.message); return; }
    toast.success("Enrolled");
    setOpen(false);
    setEnrollCode("");
    load();
  };

  const unenroll = async (enrollmentId: string, courseTitle: string) => {
    if (!window.confirm(`Unenroll from ${courseTitle}?`)) return;
    const { error } = await supabase.from("course_enrollments").delete().eq("id", enrollmentId);
    if (error) { toast.error(error.message); return; }
    toast.success("Unenrolled");
    load();
  };

  const sortedEnrollments = useMemo(() => [...enrollments].sort((a, b) => a.courses.title.localeCompare(b.courses.title)), [enrollments]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">My Courses</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Join Course</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Join a Course</DialogTitle></DialogHeader>
            <form onSubmit={enroll} className="space-y-4">
              <Input placeholder="Enter course code" value={enrollCode} onChange={e => setEnrollCode(e.target.value)} required />
              <Button type="submit" className="w-full">Enroll</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {sortedEnrollments.map((enr: any) => (
          <Card key={enr.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground font-mono">{enr.courses.code}</div>
                  <CardTitle>{enr.courses.title}</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => unenroll(enr.id, enr.courses.title)}>Unenroll</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(assignments[enr.course_id] || []).map(a => (
                  <Link key={a.id} to={`/submit/${a.id}`} className="block">
                    <div className="flex items-center justify-between p-2 rounded hover:bg-muted transition-colors">
                      <div>
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.type} · {a.max_score} pts
                          {a.due_date && ` · Due ${new Date(a.due_date).toLocaleDateString()}`}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">Open →</Button>
                    </div>
                  </Link>
                ))}
                {!assignments[enr.course_id]?.length && <p className="text-sm text-muted-foreground">No assignments yet.</p>}
              </div>
            </CardContent>
          </Card>
        ))}
        {sortedEnrollments.length === 0 && <p className="text-muted-foreground text-center py-12">Not enrolled in any courses. Join one using a course code.</p>}
      </div>
    </div>
  );
}
