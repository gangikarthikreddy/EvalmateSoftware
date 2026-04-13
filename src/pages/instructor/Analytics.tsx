import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Tables } from "@/integrations/supabase/types";

export default function Analytics() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Tables<"courses">[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [gradeDistribution, setGradeDistribution] = useState<{ range: string; count: number }[]>([]);
  const [criterionScores, setCriterionScores] = useState<{ criterion: string; avg: number }[]>([]);
  const [studentScores, setStudentScores] = useState<{ student: string; average: number }[]>([]);
  const [summary, setSummary] = useState({ submissions: 0, graded: 0, averagePct: 0 });

  useEffect(() => {
    if (!user) return;
    supabase.from("courses").select("*").eq("instructor_id", user.id).order("title").then(({ data }) => setCourses(data || []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: courseData } = await supabase.from("courses").select("id").eq("instructor_id", user.id);
      const availableCourseIds = courseData?.map(c => c.id) || [];
      const filteredCourseIds = selectedCourse === "all" ? availableCourseIds : availableCourseIds.filter(id => id === selectedCourse);
      if (!filteredCourseIds.length) {
        setGradeDistribution([]); setCriterionScores([]); setStudentScores([]); setSummary({ submissions: 0, graded: 0, averagePct: 0 });
        return;
      }

      const { data: assignments } = await supabase.from("assignments").select("id, course_id, title").in("course_id", filteredCourseIds);
      const assignmentIds = assignments?.map(a => a.id) || [];
      if (!assignmentIds.length) {
        setGradeDistribution([]); setCriterionScores([]); setStudentScores([]); setSummary({ submissions: 0, graded: 0, averagePct: 0 });
        return;
      }

      const { data: subs } = await supabase.from("submissions").select("id, assignment_id, student_id, total_score, max_possible_score, status").in("assignment_id", assignmentIds);
      const submissions = subs || [];
      const gradedSubs = submissions.filter(s => s.total_score != null && s.max_possible_score != null);
      const percentages = gradedSubs.map(s => (Number(s.total_score) / Number(s.max_possible_score || 1)) * 100);
      setSummary({
        submissions: submissions.length,
        graded: gradedSubs.length,
        averagePct: percentages.length ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0,
      });

      const ranges = [
        { range: "0-20%", min: 0, max: 20, count: 0 },
        { range: "21-40%", min: 21, max: 40, count: 0 },
        { range: "41-60%", min: 41, max: 60, count: 0 },
        { range: "61-80%", min: 61, max: 80, count: 0 },
        { range: "81-100%", min: 81, max: 100, count: 0 },
      ];
      percentages.forEach(pct => {
        const bucket = ranges.find(r => pct >= r.min && pct <= r.max);
        if (bucket) bucket.count += 1;
      });
      setGradeDistribution(ranges.map(r => ({ range: r.range, count: r.count })));

      const subIds = submissions.map(s => s.id);
      if (subIds.length) {
        const { data: grades } = await supabase.from("grades").select("score, submission_id, rubrics(criterion)").in("submission_id", subIds);
        const criterionMap: Record<string, { total: number; count: number }> = {};
        (grades || []).forEach((g: any) => {
          const key = g.rubrics?.criterion || "Unknown";
          if (!criterionMap[key]) criterionMap[key] = { total: 0, count: 0 };
          criterionMap[key].total += Number(g.score || 0);
          criterionMap[key].count += 1;
        });
        setCriterionScores(Object.entries(criterionMap).map(([criterion, v]) => ({ criterion, avg: Number((v.total / v.count).toFixed(1)) })));
      } else {
        setCriterionScores([]);
      }

      const studentIds = [...new Set(submissions.map(s => s.student_id))];
      let profileMap: Record<string, string> = {};
      if (studentIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
        profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.full_name]));
      }
      const studentAgg: Record<string, { total: number; count: number }> = {};
      gradedSubs.forEach(s => {
        const pct = (Number(s.total_score) / Number(s.max_possible_score || 1)) * 100;
        if (!studentAgg[s.student_id]) studentAgg[s.student_id] = { total: 0, count: 0 };
        studentAgg[s.student_id].total += pct;
        studentAgg[s.student_id].count += 1;
      });
      setStudentScores(
        Object.entries(studentAgg)
          .map(([studentId, v]) => ({ student: profileMap[studentId] || studentId.slice(0, 8), average: Number((v.total / v.count).toFixed(1)) }))
          .sort((a, b) => b.average - a.average)
      );
    };
    load();
  }, [user, selectedCourse]);

  const selectedTitle = useMemo(() => selectedCourse === "all" ? "All Courses" : (courses.find(c => c.id === selectedCourse)?.title || "Course"), [selectedCourse, courses]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Performance Analytics</h1>
          <p className="text-muted-foreground">Analytics by course and student performance.</p>
        </div>
        <div className="w-64">
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map(course => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card><CardHeader><CardTitle className="text-sm">Scope</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{selectedTitle}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Submissions</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.submissions}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Average</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.averagePct}%</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Grade Distribution</CardTitle></CardHeader>
          <CardContent>
            {gradeDistribution.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={gradeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-12">No graded submissions yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Average Score by Criterion</CardTitle></CardHeader>
          <CardContent>
            {criterionScores.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={criterionScores} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="criterion" type="category" width={120} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-12">No rubric score data yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Student Performance by Course</CardTitle></CardHeader>
        <CardContent>
          {studentScores.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={studentScores} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="student" type="category" width={140} />
                <Tooltip />
                <Bar dataKey="average" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted-foreground text-center py-12">No student performance data yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
