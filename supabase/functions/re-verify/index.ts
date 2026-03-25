import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submissionId, requestId, reason, instructorNotes } = await req.json();
    if (!submissionId || !requestId) throw new Error("submissionId and requestId are required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Update request status
    await supabase.from("re_verification_requests").update({ status: "in_review" }).eq("id", requestId);
    await supabase.from("submissions").update({ status: "re_grading" }).eq("id", submissionId);

    // Get submission with assignment
    const { data: submission } = await supabase
      .from("submissions").select("*, assignments(*)").eq("id", submissionId).single();
    if (!submission) throw new Error("Submission not found");

    // Get rubrics
    const { data: rubrics } = await supabase
      .from("rubrics").select("*").eq("assignment_id", submission.assignment_id).order("sort_order");

    // Get previous grades
    const { data: prevGrades } = await supabase
      .from("grades").select("*, rubrics(criterion)").eq("submission_id", submissionId);

    const assignment = submission.assignments;
    const rubricText = (rubrics || []).map((r, i) =>
      `${i + 1}. "${r.criterion}" (max ${r.max_points} points): ${r.description || "N/A"}`
    ).join("\n");

    const prevGradeText = (prevGrades || []).map((g: any) =>
      `- ${g.rubrics?.criterion}: ${g.score} pts - ${g.feedback}`
    ).join("\n");

    const submissionContent = submission.text_content || submission.code_content || `File: ${submission.file_url}`;

    const prompt = `You are re-evaluating a student submission after an appeal.

Assignment: ${assignment.title}
Description: ${assignment.description || "N/A"}
Type: ${assignment.type}

Rubric:
${rubricText}

Student Submission:
${submissionContent}

Previous Grades:
${prevGradeText}

Student's Appeal Reason: ${reason}
${instructorNotes ? `Instructor Notes: ${instructorNotes}` : ""}

Re-evaluate this submission considering the student's appeal. Be fair and adjust scores if the appeal has merit. For code, accept any valid algorithmic approach.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "grades": [
    {
      "criterion_index": 0,
      "score": <number>,
      "feedback": "<specific feedback>"
    }
  ],
  "overall_feedback": "<overall feedback>"
}`;

    // Call Gemini API
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
          systemInstruction: {
            parts: [{ text: "You are an expert grading assistant performing a re-evaluation. Always respond with valid JSON only." }],
          },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      if (geminiResp.status === 429) throw new Error("Rate limited. Try again later.");
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini did not return results");

    const gradingResult = JSON.parse(rawText);

    // Delete old grades
    await supabase.from("grades").delete().eq("submission_id", submissionId);

    // Insert new grades
    let totalScore = 0;
    let maxPossible = 0;
    for (const g of gradingResult.grades) {
      const rubric = (rubrics || [])[g.criterion_index];
      if (!rubric) continue;
      const score = Math.min(Math.max(0, g.score), rubric.max_points);
      totalScore += score;
      maxPossible += rubric.max_points;
      await supabase.from("grades").insert({
        submission_id: submissionId,
        rubric_id: rubric.id,
        score,
        feedback: g.feedback,
      });
    }

    // Update submission
    await supabase.from("submissions").update({
      status: "re_graded",
      total_score: totalScore,
      max_possible_score: maxPossible,
      ai_feedback: `[Re-evaluated] ${gradingResult.overall_feedback}`,
      graded_at: new Date().toISOString(),
    }).eq("id", submissionId);

    // Update re-verification request
    await supabase.from("re_verification_requests").update({
      status: "completed",
      new_score: totalScore,
      instructor_notes: instructorNotes || null,
    }).eq("id", requestId);

    return new Response(JSON.stringify({ success: true, totalScore, maxPossible }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("re-verify error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
