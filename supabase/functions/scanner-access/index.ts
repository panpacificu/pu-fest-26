import { corsHeaders, json } from "../_shared/cors.ts";

function validPassword(value: unknown) {
  const expected = Deno.env.get("SCANNER_ACCESS_PASSWORD");
  if (!expected) throw new Error("Scanner password is not configured.");
  return typeof value === "string" && value === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, message: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    if (!validPassword(body?.password)) {
      return json(req, { success: false, message: "Incorrect scanner password." });
    }
    return json(req, { success: true });
  } catch (err) {
    return json(req, { success: false, message: err instanceof Error ? err.message : String(err) }, 400);
  }
});
