import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";

interface RubricInput {
  criterion: string;
  description: string;
  max_points: number;
}

export default function CourseDetail() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState<Tables<"courses"> | null>(null);
  const [assignments, setAssignments] = useState<Tables<"assignments">[]>([]);
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Enums<"assignment_type">>("text");
  const [programmingLanguage, setProgrammingLanguage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [rubrics, setRubrics] = useState<RubricInput[]>([{ criterion: "", description: "", max_points: 10 }]);

  const load = async () => {
    if (!courseId) return;
    const { data: c } = await supabase.from("courses").select("*").eq("id", courseId).single();
    setCourse(c);
    const { data: a } = await supabase.from("assignments").select("*").eq("course_id", courseId).order("created_at", { ascending: false });
    setAssignments(a || []);
  };

  useEffect(() => { load(); }, [courseId]);

  const addRubric = () => setRubrics([...rubrics, { criterion: "", description: "", max_points: 10 }]);
  const removeRubric = (i: number) => setRubrics(rubrics.filter((_, idx) => idx !== i));
  const updateRubric = (i: number, field: keyof RubricInput, value: any) => {
    const updated = [...rubrics];
    (updated[i] as any)[field] = value;
    setRubrics(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) return;
    const validRubrics = rubrics.filter(r => r.criterion.trim());
    if (validRubrics.length === 0) { toast.error("Add at least one rubric criterion"); return; }

    const { data: assignment, error } = await supabase.from("assignments").insert({
      course_id: courseId,
      title,
      description,
      type,
      programming_language: type === "code" ? programmingLanguage : null,
      due_date: dueDate || null,
      max_score: maxScore,
    }).select().single();

    if (error) { toast.error(error.message); return; }

    const rubricInserts = validRubrics.map((r, i) => ({
      assignment_id: assignment.id,
      criterion: r.criterion,
      description: r.description,
      max_points: r.max_points,
      sort_order: i,
    }));
    const { error: rErr } = await supabase.from("rubrics").insert(rubricInserts);
    if (rErr) { toast.error(rErr.message); return; }

    toast.success("Assignment created with rubrics");
    setOpen(false);
    setTitle(""); setDescription(""); setType("text"); setProgrammingLanguage(""); setDueDate(""); setMaxScore(100);
    setRubrics([{ criterion: "", description: "", max_points: 10 }]);
    load();
  };

  if (!course) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <div className="text-sm text-muted-foreground font-mono">{course.code}</div>
        <h1 className="text-3xl font-bold">{course.title}</h1>
        <p className="text-muted-foreground mt-1">{course.description}</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Assignments</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Assignment</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v: Enums<"assignment_type">) => setType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="code">Code</SelectItem>
                      <SelectItem value="file">File Upload</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              {type === "code" && (
                <div className="space-y-2">
                  <Label>Programming Language</Label>
                  <Select value={programmingLanguage} onValueChange={setProgrammingLanguage}>
                    <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="java">Java</SelectItem>
                      <SelectItem value="c">C</SelectItem>
                      <SelectItem value="cpp">C++</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Score</Label>
                  <Input type="number" value={maxScore} onChange={e => setMaxScore(Number(e.target.value))} min={1} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Rubric Criteria</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addRubric}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                {rubrics.map((r, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex gap-2">
                        <Input placeholder="Criterion name" value={r.criterion} onChange={e => updateRubric(i, "criterion", e.target.value)} className="flex-1" />
                        <Input type="number" placeholder="Points" value={r.max_points} onChange={e => updateRubric(i, "max_points", Number(e.target.value))} className="w-20" min={1} />
                        {rubrics.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeRubric(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <Textarea placeholder="Description / expected algorithm (for code: describe the logic)" value={r.description} onChange={e => updateRubric(i, "description", e.target.value)} rows={2} />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button type="submit" className="w-full">Create Assignment</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {assignments.map(a => (
          <Link key={a.id} to={`/assignments/${a.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {a.type} · Max {a.max_score} pts
                    {a.due_date && ` · Due ${new Date(a.due_date).toLocaleDateString()}`}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-secondary capitalize">{a.type}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {assignments.length === 0 && <p className="text-muted-foreground text-center py-12">No assignments yet.</p>}
      </div>
    </div>
  );
}
