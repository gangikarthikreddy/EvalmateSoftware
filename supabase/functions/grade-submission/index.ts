import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submissionId } = await req.json();
    if (!submissionId) throw new Error("submissionId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Update status to grading
    await supabase.from("submissions").update({ status: "grading" }).eq("id", submissionId);

    // Get submission with assignment
    const { data: submission, error: subErr } = await supabase
      .from("submissions").select("*, assignments(*)").eq("id", submissionId).single();
    if (subErr || !submission) throw new Error("Submission not found");

    // Get rubrics
    const { data: rubrics } = await supabase
      .from("rubrics").select("*").eq("assignment_id", submission.assignment_id).order("sort_order");
    if (!rubrics?.length) throw new Error("No rubrics found");

    const assignment = submission.assignments;
    let codeOutput = "";
    let codeSuccess = false;

    // For code assignments, try to execute the code
    if (assignment.type === "code" && submission.code_content) {
      try {
        const execResp = await fetch(`${supabaseUrl}/functions/v1/execute-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            code: submission.code_content,
            language: assignment.programming_language || "python",
          }),
        });
        const execResult = await execResp.json();
        codeOutput = execResult.output || execResult.error || "";
        codeSuccess = execResult.success ?? false;
      } catch (e) {
        codeOutput = `Execution error: ${e.message}`;
        codeSuccess = false;
      }
    }

    // Build grading prompt
    const rubricText = rubrics.map((r, i) =>
      `${i + 1}. "${r.criterion}" (max ${r.max_points} points): ${r.description || "No description"}`
    ).join("\n");

    let submissionContent = "";
    if (assignment.type === "text") submissionContent = submission.text_content || "";
    else if (assignment.type === "code") {
      submissionContent = `Code:\n\`\`\`\n${submission.code_content}\n\`\`\`\n\nCode Output:\n${codeOutput}\nExecution Success: ${codeSuccess}`;
    } else if (assignment.type === "file") {
      submissionContent = `File submitted at: ${submission.file_url}`;
    }

    const prompt = `You are an AI grading assistant. Grade the following student submission based on the rubric criteria.

Assignment: ${assignment.title}
Description: ${assignment.description || "N/A"}
Type: ${assignment.type}
${assignment.programming_language ? `Language: ${assignment.programming_language}` : ""}

Rubric Criteria:
${rubricText}

Student Submission:
${submissionContent}

IMPORTANT: For code assignments, evaluate the LOGIC and ALGORITHM, not just syntax. The student can use any valid approach (while loop, for loop, recursion, etc.) as long as the algorithm is correct.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "grades": [
    {
      "criterion_index": 0,
      "score": <number>,
      "feedback": "<specific feedback for this criterion>"
    }
  ],
  "overall_feedback": "<overall feedback for the student>"
}

Grade each criterion independently. criterion_index is 0-based.`;

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
            parts: [{ text: "You are an expert grading assistant. Be fair, thorough, and constructive. Always respond with valid JSON only." }],
          },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      if (geminiResp.status === 429) throw new Error("Rate limited. Please try again later.");
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini did not return grading results");

    const gradingResult = JSON.parse(rawText);

    // Insert grades
    let totalScore = 0;
    let maxPossible = 0;
    for (const g of gradingResult.grades) {
      const rubric = rubrics[g.criterion_index];
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
      status: "graded",
      total_score: totalScore,
      max_possible_score: maxPossible,
      ai_feedback: gradingResult.overall_feedback,
      code_output: codeOutput || null,
      code_execution_success: assignment.type === "code" ? codeSuccess : null,
      graded_at: new Date().toISOString(),
    }).eq("id", submissionId);

    return new Response(JSON.stringify({ success: true, totalScore, maxPossible }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("grade-submission error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
