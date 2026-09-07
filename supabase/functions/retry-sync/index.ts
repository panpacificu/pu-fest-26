import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { profile, admin } = await requireStaff(req, ["admin", "finance", "event_admin"]);
    const { registration_id } = await req.json();

    if (!registration_id) throw new Error("Registration ID required");

    const { data: registration, error: findError } = await admin
      .from("registrations")
      .select("id,transaction_number")
      .eq("id", registration_id)
      .single();

    if (findError || !registration) throw new Error("Registration not found");

    const { error } = await admin
      .from("registrations")
      .update({
        sheet_sync_status: "pending",
        sheet_sync_error: null
      })
      .eq("id", registration.id);

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "QUEUE_SHEET_SYNC",
      entity_type: "registration",
      entity_id: registration.id,
      new_values: {
        transaction_number: registration.transaction_number,
        queued: true
      }
    });

    return json(req, { success: true, queued: true });
  } catch (err) {
    return json(req, {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    }, 400);
  }
});
