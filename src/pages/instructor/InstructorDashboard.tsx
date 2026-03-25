import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BookOpen, FileText, AlertCircle, Users } from "lucide-react";

export default function InstructorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ courses: 0, assignments: 0, pendingSubmissions: 0, reverifications: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count: courses } = await supabase.from("courses").select("*", { count: "exact", head: true }).eq("instructor_id", user.id);
      const { data: courseIds } = await supabase.from("courses").select("id").eq("instructor_id", user.id);
      const ids = courseIds?.map(c => c.id) || [];
      let assignments = 0, pendingSubmissions = 0, reverifications = 0;
      if (ids.length) {
        const { count: ac } = await supabase.from("assignments").select("*", { count: "exact", head: true }).in("course_id", ids);
        assignments = ac || 0;
        const { data: assignmentIds } = await supabase.from("assignments").select("id").in("course_id", ids);
        const aIds = assignmentIds?.map(a => a.id) || [];
        if (aIds.length) {
          const { count: sc } = await supabase.from("submissions").select("*", { count: "exact", head: true }).in("assignment_id", aIds).eq("status", "submitted");
          pendingSubmissions = sc || 0;
          const { count: rc } = await supabase.from("re_verification_requests").select("*", { count: "exact", head: true }).in("submission_id", aIds).eq("status", "pending");
          reverifications = rc || 0;
        }
      }
      setStats({ courses: courses || 0, assignments, pendingSubmissions, reverifications });
    };
    load();
  }, [user]);

  const cards = [
    { title: "Courses", value: stats.courses, icon: BookOpen, color: "text-blue-500" },
    { title: "Assignments", value: stats.assignments, icon: FileText, color: "text-green-500" },
    { title: "Pending Submissions", value: stats.pendingSubmissions, icon: Users, color: "text-orange-500" },
    { title: "Re-verification Requests", value: stats.reverifications, icon: AlertCircle, color: "text-red-500" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Instructor Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
