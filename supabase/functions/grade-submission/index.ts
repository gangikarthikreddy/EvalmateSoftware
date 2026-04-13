import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanText(text: string) {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .trim();
}

function truncate(text: string | null | undefined, max = 500) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGeminiResponse(rawText: string, rubrics: any[]) {
  const cleaned = cleanText(rawText);

  try {
    return JSON.parse(cleaned);
  } catch {
    console.log("JSON parse failed, attempting recovery");

    const gradeRegex =
      /"criterion_index"\s*:\s*(\d+)[\s\S]*?"score"\s*:\s*(\d+)[\s\S]*?"feedback"\s*:\s*"([\s\S]*?)"/g;

    const grades: any[] = [];
    let match: RegExpExecArray | null;

    while ((match = gradeRegex.exec(cleaned)) !== null) {
      const index = Number(match[1]);
      const score = Number(match[2]);
      const feedback = match[3].trim();

      if (index >= 0 && index < rubrics.length) {
        grades.push({
          criterion_index: index,
          score: Math.min(Math.max(score, 0), rubrics[index].max_points),
          feedback: feedback || "Feedback unavailable",
        });
      }
    }

    const unique = grades.filter(
      (g, i, arr) => arr.findIndex((x) => x.criterion_index === g.criterion_index) === i
    );

    let overall = "AI grading completed.";
    const overallMatch = cleaned.match(/"overall_feedback"\s*:\s*"([\s\S]*?)"/);
    if (overallMatch) {
      overall = overallMatch[1].trim();
    }

    if (unique.length === 0) {
      return {
        grades: rubrics.map((_: any, i: number) => ({
          criterion_index: i,
          score: 0,
          feedback: "AI response incomplete. Please retry grading.",
        })),
        overall_feedback: "AI response incomplete. Please retry grading.",
      };
    }

    return { grades: unique, overall_feedback: overall };
  }
}

async function callGemini(geminiKey: string, prompt: string) {
  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
              maxOutputTokens: 2200,
            },
            systemInstruction: {
              parts: [
                {
                  text: "You are an expert programming assignment grader. Return strict valid JSON only. Give detailed, specific, rubric-based feedback that identifies exact mistakes, missing parts, logic issues, edge-case issues, syntax issues, and how to improve them.",
                },
              ],
            },
          }),
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        console.log(`Gemini success with ${model}`);
        return { ok: true, data, model };
      }

      const errText = await resp.text();
      console.error(`${model} error attempt ${attempt + 1}:`, errText);

      if (resp.status === 503) {
        if (attempt < 2) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        break;
      }

      if (resp.status === 429) {
        return { ok: false, status: 429, errorText: errText, model };
      }

      if (resp.status === 404) {
        break;
      }

      return { ok: false, status: resp.status, errorText: errText, model };
    }
  }

  return {
    ok: false,
    status: 503,
    errorText: "All Gemini models temporarily unavailable.",
    model: null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let submissionId: string | null = null;
  let supabase: any = null;

  try {
    console.log("grade-submission called");

    const body = await req.json();
    submissionId = body.submissionId;

    if (!submissionId) {
      throw new Error("Missing submissionId");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      throw new Error("Missing Gemini API key");
    }

    supabase = createClient(supabaseUrl, serviceKey);

    await supabase
      .from("submissions")
      .update({ status: "grading" })
      .eq("id", submissionId);

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*, assignments(*)")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      throw new Error("Submission not found");
    }

    const { data: rubrics, error: rubricError } = await supabase
      .from("rubrics")
      .select("*")
      .eq("assignment_id", submission.assignment_id)
      .order("sort_order");

    if (rubricError || !rubrics?.length) {
      throw new Error("Rubrics not found");
    }

    const assignment = submission.assignments;

    const rubricText = rubrics
      .map((r: any, i: number) => {
        return `${i}. Criterion: ${r.criterion}
Max points: ${r.max_points}
Description: ${r.description || "No description provided"}`;
      })
      .join("\n\n");

    let submissionContent = "";

    if (assignment.type === "code") {
      submissionContent = `Student code:
${truncate(submission.code_content, 2500)}

Programming language: ${assignment.programming_language || "python"}

Important grading note:
- Identify exact mistakes in logic, syntax, missing edge cases, formatting, or incomplete implementation.
- Mention specific lines or code behavior when possible.
- Explain what the student should change to improve the solution.`;
    } else if (assignment.type === "text") {
      submissionContent = truncate(submission.text_content, 1800);
    } else {
      submissionContent = `Student submitted a file: ${submission.file_url || "No file URL available"}`;
    }

    const prompt = `You are grading a student submission using the rubric below.

Assignment Title:
${assignment.title || "Untitled Assignment"}

Assignment Description:
${assignment.description || "No description provided"}

Rubrics:
${rubricText}

Submission:
${submissionContent}

Instructions:
- Grade each rubric criterion independently.
- For each criterion, explain the student's exact mistake or what they did correctly.
- If something is missing, clearly say what is missing.
- For code submissions, mention incorrect logic, syntax problems, edge-case issues, wrong output formatting, or incomplete implementation.
- If the student did something correctly, explain exactly what is correct.
- Feedback must be specific and useful, not generic.
- Each criterion feedback should be 2 to 4 sentences.
- overall_feedback should be 3 to 5 sentences summarizing strengths, mistakes, and how to improve.
- Return ONLY valid JSON.
- Do not use markdown.
- Do not use code fences.

Format:
{
  "grades": [
    {
      "criterion_index": 0,
      "score": 0,
      "feedback": "Detailed feedback here"
    }
  ],
  "overall_feedback": "Detailed overall feedback here"
}`;

    const geminiResult = await callGemini(geminiKey, prompt);

    if (!geminiResult.ok) {
      if (geminiResult.status === 429) {
        await supabase
          .from("submissions")
          .update({
            status: "submitted",
            ai_feedback: "AI quota exceeded. Please try again later.",
          })
          .eq("id", submissionId);

        return new Response(
          JSON.stringify({ success: false, error: "Quota exceeded" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (geminiResult.status === 503) {
        await supabase
          .from("submissions")
          .update({
            status: "submitted",
            ai_feedback: "AI is temporarily busy. Please retry shortly.",
          })
          .eq("id", submissionId);

        return new Response(
          JSON.stringify({ success: false, error: "AI temporarily unavailable" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(geminiResult.errorText || "Gemini request failed");
    }

    const rawText = geminiResult.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error("Empty Gemini response");
    }

    const result = parseGeminiResponse(rawText, rubrics);

    await supabase.from("grades").delete().eq("submission_id", submissionId);

    let total = 0;
    let max = 0;

    for (const g of result.grades) {
      const rubric = rubrics[g.criterion_index];
      if (!rubric) continue;

      const score = Math.min(Math.max(Number(g.score) || 0, 0), rubric.max_points);
      total += score;
      max += rubric.max_points;

      await supabase.from("grades").insert({
        submission_id: submissionId,
        rubric_id: rubric.id,
        score,
        feedback: truncate(g.feedback, 1200),
      });
    }

    await supabase
      .from("submissions")
      .update({
        status: "graded",
        total_score: total,
        max_possible_score: max,
        ai_feedback: truncate(result.overall_feedback, 2000),
      })
      .eq("id", submissionId);

    return new Response(
      JSON.stringify({ success: true, total, max }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    console.error("Error:", e);

    if (supabase && submissionId) {
      await supabase
        .from("submissions")
        .update({
          status: "submitted",
          ai_feedback: "Grading could not be completed. Please retry.",
        })
        .eq("id", submissionId);
    }

    return new Response(
      JSON.stringify({ error: e.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});