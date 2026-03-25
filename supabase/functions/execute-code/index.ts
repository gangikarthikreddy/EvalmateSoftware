import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, language } = await req.json();
    if (!code) throw new Error("code is required");

    const lang = (language || "javascript").toLowerCase();
    let output = "";
    let success = false;

    if (lang === "javascript" || lang === "js") {
      // Execute JavaScript in a sandboxed way using Deno
      try {
        const tempFile = `/tmp/student_code_${Date.now()}.js`;
        await Deno.writeTextFile(tempFile, code);
        const process = new Deno.Command("deno", {
          args: ["run", "--no-prompt", "--allow-none", tempFile],
          stdout: "piped",
          stderr: "piped",
        });
        const result = await process.output();
        const stdout = new TextDecoder().decode(result.stdout);
        const stderr = new TextDecoder().decode(result.stderr);
        output = stdout + (stderr ? `\nStderr: ${stderr}` : "");
        success = result.code === 0;
        try { await Deno.remove(tempFile); } catch {}
      } catch (e) {
        output = `Execution error: ${e.message}`;
        success = false;
      }
    } else if (lang === "python") {
      try {
        const tempFile = `/tmp/student_code_${Date.now()}.py`;
        await Deno.writeTextFile(tempFile, code);
        const process = new Deno.Command("python3", {
          args: [tempFile],
          stdout: "piped",
          stderr: "piped",
        });
        const result = await process.output();
        const stdout = new TextDecoder().decode(result.stdout);
        const stderr = new TextDecoder().decode(result.stderr);
        output = stdout + (stderr ? `\nStderr: ${stderr}` : "");
        success = result.code === 0;
        try { await Deno.remove(tempFile); } catch {}
      } catch (e) {
        output = `Execution error: ${e.message}`;
        success = false;
      }
    } else {
      output = `Language "${lang}" execution is not supported. AI will review the code logic instead.`;
      success = false;
    }

    // Truncate output if too long
    if (output.length > 5000) {
      output = output.substring(0, 5000) + "\n... (output truncated)";
    }

    return new Response(JSON.stringify({ output, success, language: lang }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-code error:", e);
    return new Response(JSON.stringify({ error: e.message, output: "", success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
