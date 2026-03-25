import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, FileText, Award } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<(Tables<"course_enrollments"> & { courses: Tables<"courses"> })[]>([]);
  const [assignments, setAssignments] = useState<Tables<"assignments">[]>([]);
  const [enrollCode, setEnrollCode] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: enr } = await supabase.from("course_enrollments").select("*, courses(*)").eq("student_id", user.id);
    setEnrollments((enr as any) || []);
    const courseIds = (enr || []).map((e: any) => e.course_id);
    if (courseIds.length) {
      const { data: a } = await supabase.from("assignments").select("*").in("course_id", courseIds).order("due_date", { ascending: true });
      setAssignments(a || []);
    }
  };

  useEffect(() => { load(); }, [user]);

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { data: course } = await supabase.from("courses").select("id").eq("code", enrollCode).single();
    if (!course) { toast.error("Course not found"); return; }
    const { error } = await supabase.from("course_enrollments").insert({ course_id: course.id, student_id: user.id });
    if (error) { toast.error(error.message.includes("duplicate") ? "Already enrolled" : error.message); return; }
    toast.success("Enrolled!");
    setOpen(false);
    setEnrollCode("");
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Student Dashboard</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Join Course</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Join a Course</DialogTitle></DialogHeader>
            <form onSubmit={enroll} className="space-y-4">
              <Input placeholder="Enter course code (e.g. CS101)" value={enrollCode} onChange={e => setEnrollCode(e.target.value)} required />
              <Button type="submit" className="w-full">Enroll</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Enrolled Courses</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{enrollments.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Assignments</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{assignments.length}</div></CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-semibold mb-3">Upcoming Assignments</h2>
      <div className="space-y-3">
        {assignments.map(a => (
          <Link key={a.id} to={`/submit/${a.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-sm text-muted-foreground capitalize">
                    {a.type} · {a.max_score} pts
                    {a.due_date && ` · Due ${new Date(a.due_date).toLocaleDateString()}`}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-secondary capitalize">{a.type}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {assignments.length === 0 && <p className="text-muted-foreground text-center py-8">No assignments. Enroll in a course to see assignments.</p>}
      </div>
    </div>
  );
}
