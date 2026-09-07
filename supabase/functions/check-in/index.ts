import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff, sha256 } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {profile,admin} = await requireStaff(req,["admin","event_admin","scanner"]);
    const body = await req.json();
    const token = body.token ? String(body.token).trim() : null;
    const ticketNo = body.ticket_number ? String(body.ticket_number).trim().toUpperCase() : null;
    const gate = String(body.gate || "Main Entrance").slice(0,100);
    const method = body.method === "manual" ? "manual" : "qr";
    const tokenHash = token ? await sha256(token) : null;

    const {data,error} = await admin.rpc("redeem_ticket",{
      p_token_hash:tokenHash,
      p_ticket_number:ticketNo,
      p_scanned_by:profile.id,
      p_gate:gate,
      p_method:method
    });
    if (error) throw error;
    return json(req,data || {result:"invalid"});
  } catch(err) {
    const msg = err instanceof Error?err.message:String(err);
    return json(req,{result:"invalid",message:msg},msg==="Unauthorized"||msg==="Forbidden"?403:400);
  }
});
