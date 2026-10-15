import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, sha256 } from "../_shared/supabase.ts";

function scannerPasswordValid(value: unknown) {
  const expected = Deno.env.get("SCANNER_ACCESS_PASSWORD");
  if (!expected) throw new Error("Scanner password is not configured.");
  return typeof value === "string" && value === expected;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const body = await req.json();
    if (!scannerPasswordValid(body.scanner_password)) {
      return json(req, { result:"invalid", auth_error:true, message:"Scanner access expired. Enter the scanner password again." });
    }

    const admin = adminClient();
    const token = body.token ? String(body.token).trim() : null;
    const ticketNo = body.ticket_number ? String(body.ticket_number).trim().toUpperCase() : null;
    const gate = String(body.gate || "Main Entrance").slice(0, 100);
    const method = body.method === "manual" ? "manual" : "qr";
    const tokenHash = token ? await sha256(token) : null;

    const { data, error } = await admin.rpc("redeem_ticket", {
      p_token_hash: tokenHash,
      p_ticket_number: ticketNo,
      p_scanned_by: null,
      p_gate: gate,
      p_method: method
    });
    if (error) throw error;
    return json(req, data || { result: "invalid" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(req, { result: "invalid", message: msg }, 400);
  }
});
