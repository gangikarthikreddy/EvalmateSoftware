import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Row = Tables<"submissions"> & {
  assignmentTitle: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  studentEmail: string;
};

export default function Submissions() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [courses, setCourses] = useState<Tables<"courses">[]>([]);
  const [grading, setGrading] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState("all");

  const load = async () => {
    if (!user) return;

    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("instructor_id", user.id)
      .order("title");

    if (courseError) {
      console.error("Error loading courses:", courseError);
      toast.error("Failed to load courses");
      return;
    }

    setCourses(courseData || []);
    const courseIds = (courseData || []).map((c) => c.id);

    if (!courseIds.length) {
      setRows([]);
      return;
    }

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, title, course_id")
      .in("course_id", courseIds);

    if (assignmentError) {
      console.error("Error loading assignments:", assignmentError);
      toast.error("Failed to load assignments");
      return;
    }

    const assignmentIds = assignmentData?.map((a) => a.id) || [];

    if (!assignmentIds.length) {
      setRows([]);
      return;
    }

    const { data: submissionData, error: submissionError } = await supabase
      .from("submissions")
      .select("*")
      .in("assignment_id", assignmentIds)
      .order("submitted_at", { ascending: false });

    if (submissionError) {
      console.error("Error loading submissions:", submissionError);
      toast.error("Failed to load submissions");
      return;
    }

    const studentIds = [...new Set((submissionData || []).map((s) => s.student_id))];

    const { data: profiles, error: profilesError } = studentIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", studentIds)
      : { data: [], error: null as any };

    if (profilesError) {
      console.error("Error loading student profiles:", profilesError);
      toast.error("Failed to load student details");
      return;
    }

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));
    const assignmentMap = Object.fromEntries((assignmentData || []).map((a: any) => [a.id, a]));
    const courseMap = Object.fromEntries((courseData || []).map((c: any) => [c.id, c]));

    setRows(
      ((submissionData || []) as Tables<"submissions">[]).map((s) => ({
        ...s,
        assignmentTitle: assignmentMap[s.assignment_id]?.title || "Assignment",
        courseId: assignmentMap[s.assignment_id]?.course_id || "",
        courseTitle: courseMap[assignmentMap[s.assignment_id]?.course_id]?.title || "Course",
        studentName: profileMap[s.student_id]?.full_name || s.student_id.slice(0, 8),
        studentEmail: profileMap[s.student_id]?.email || "",
      }))
    );
  };

  useEffect(() => {
    load();
  }, [user]);

  const filteredRows = useMemo(() => {
    return selectedCourse === "all"
      ? rows
      : rows.filter((r) => r.courseId === selectedCourse);
  }, [rows, selectedCourse]);

  const grade = async (id: string) => {
    setGrading(id);

    try {
      const { data, error } = await supabase.functions.invoke("grade-submission", {
        body: { submissionId: id },
      });

      console.log("grade response:", data);

      if (error) {
        throw error;
      }

      if (data?.success === false) {
        toast.error(data.error || "Grading could not be completed.");
        await load();
        return;
      }

      toast.success("Graded successfully");
      await load();
    } catch (err: any) {
      console.error("Grading error:", err);
      toast.error(err.message || "Grading failed");
    } finally {
      setGrading(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Submissions by Course</h1>

        <div className="w-64">
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger>
              <SelectValue placeholder="Select course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredRows.map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{s.assignmentTitle}</CardTitle>
              <div className="text-sm text-muted-foreground">{s.courseTitle}</div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{s.studentName}</div>
                  <div className="text-sm text-muted-foreground">{s.studentEmail}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(s.submitted_at).toLocaleString()}
                  </div>

                  {s.status && (
                    <div className="mt-1 text-sm">
                      <span className="font-medium">Status:</span> {s.status}
                    </div>
                  )}

                  {s.total_score != null && (
                    <div className="mt-1 text-sm font-semibold">
                      {s.total_score}/{s.max_possible_score}
                    </div>
                  )}
                </div>

                {s.status === "submitted" && (
                  <Button
                    size="sm"
                    onClick={() => grade(s.id)}
                    disabled={grading === s.id}
                  >
                    {grading === s.id ? "Grading..." : "Grade"}
                  </Button>
                )}
              </div>

              {s.ai_feedback && (
                <div className="rounded-md border p-3">
                  <div className="mb-1 text-sm font-medium">AI Feedback</div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {s.ai_feedback}
                  </div>
                </div>
              )}

              {s.code_output && (
                <div>
                  <div className="mb-1 text-sm font-medium">Program Output</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                    {s.code_output}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {filteredRows.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            No submissions for this course yet.
          </p>
        )}
      </div>
    </div>
  );
}