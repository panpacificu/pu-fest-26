import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

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
      return json(req, { found:false, auth_error:true, message:"Scanner access expired. Enter the scanner password again." });
    }

    const admin = adminClient();
    const number = String(body.ticket_number || "").trim().toUpperCase();
    if (!number) return json(req, { found: false, message: "Ticket number required" }, 400);

    const { data: t, error } = await admin.from("tickets")
      .select("ticket_number,holder_name,status,is_free,registration_id,checked_in_at,checked_in_gate")
      .eq("ticket_number", number).single();
    if (error || !t) return json(req, { found: false, message: "Ticket not found" }, 404);

    const { data: r } = await admin.from("registrations")
      .select("first_name,middle_name,last_name,course,year_level,section,archived_at,status")
      .eq("id", t.registration_id).single();

    if (r?.archived_at || r?.status !== "active") {
      return json(req, {
        found: true,
        ...t,
        status: "void",
        message: "Transaction is archived or inactive",
        purchaser_name: [r?.first_name, r?.middle_name, r?.last_name].filter(Boolean).join(" "),
        course: r?.course, year_level: r?.year_level, section: r?.section
      });
    }

    return json(req, {
      found: true, ...t,
      purchaser_name: [r?.first_name, r?.middle_name, r?.last_name].filter(Boolean).join(" "),
      course: r?.course, year_level: r?.year_level, section: r?.section
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(req, { found: false, message: msg }, 400);
  }
});
