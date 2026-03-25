import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Analytics() {
  const { user } = useAuth();
  const [gradeDistribution, setGradeDistribution] = useState<{ range: string; count: number }[]>([]);
  const [criterionScores, setCriterionScores] = useState<{ criterion: string; avg: number; max: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: courses } = await supabase.from("courses").select("id").eq("instructor_id", user.id);
      const courseIds = courses?.map(c => c.id) || [];
      if (!courseIds.length) return;
      const { data: assignments } = await supabase.from("assignments").select("id").in("course_id", courseIds);
      const aIds = assignments?.map(a => a.id) || [];
      if (!aIds.length) return;

      const { data: subs } = await supabase.from("submissions").select("total_score, max_possible_score").in("assignment_id", aIds).not("total_score", "is", null);
      
      const ranges = [
        { range: "0-20%", min: 0, max: 20, count: 0 },
        { range: "21-40%", min: 21, max: 40, count: 0 },
        { range: "41-60%", min: 41, max: 60, count: 0 },
        { range: "61-80%", min: 61, max: 80, count: 0 },
        { range: "81-100%", min: 81, max: 100, count: 0 },
      ];
      (subs || []).forEach(s => {
        const pct = (s.total_score! / (s.max_possible_score || 100)) * 100;
        const r = ranges.find(r => pct >= r.min && pct <= r.max);
        if (r) r.count++;
      });
      setGradeDistribution(ranges.map(r => ({ range: r.range, count: r.count })));

      const { data: grades } = await supabase.from("grades").select("score, rubric_id, rubrics(criterion, max_points)");
      const criterionMap: Record<string, { total: number; count: number; max: number }> = {};
      (grades || []).forEach((g: any) => {
        const name = g.rubrics?.criterion || "Unknown";
        if (!criterionMap[name]) criterionMap[name] = { total: 0, count: 0, max: g.rubrics?.max_points || 10 };
        criterionMap[name].total += g.score;
        criterionMap[name].count++;
      });
      setCriterionScores(Object.entries(criterionMap).map(([criterion, d]) => ({
        criterion,
        avg: Math.round((d.total / d.count) * 10) / 10,
        max: d.max,
      })));
    };
    load();
  }, [user]);

  const COLORS = ["hsl(var(--destructive))", "hsl(220, 70%, 50%)", "hsl(40, 80%, 50%)", "hsl(150, 60%, 40%)", "hsl(120, 60%, 40%)"];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Performance Analytics</h1>
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
                  <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Avg Score" />
                  <Bar dataKey="max" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} name="Max Points" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-12">No grades data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
