import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";
import { syncIssueToAppsScript } from "../_shared/apps-script.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { profile, admin } = await requireStaff(req, ["admin", "finance", "event_admin"]);
    const { registration_id } = await req.json();

    const { data: r, error } = await admin
      .from("registrations")
      .select("id,email")
      .eq("id", registration_id)
      .single();

    if (error || !r) throw new Error("Registration not found");

    let bridge;
    try {
      bridge = await syncIssueToAppsScript(admin, r.id, "resend");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      await admin.from("registrations").update({
        email_status: "failed",
        email_error: msg
      }).eq("id", r.id);

      await admin.from("email_logs").insert({
        registration_id: r.id,
        recipient: r.email,
        status: "failed",
        provider: "google-apps-script",
        error_message: msg
      });

      throw e;
    }

    const sent = !!bridge?.email_sent;
    const emailError = bridge?.email_error || null;

    await admin.from("registrations").update({
      email_status: sent ? "sent" : "failed",
      email_sent_at: sent ? new Date().toISOString() : null,
      email_error: emailError
    }).eq("id", r.id);

    await admin.from("email_logs").insert({
      registration_id: r.id,
      recipient: r.email,
      status: sent ? "sent" : "failed",
      provider: "google-apps-script",
      error_message: emailError
    });

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "RESEND_TICKET_EMAIL",
      entity_type: "registration",
      entity_id: r.id,
      new_values: { email_sent: sent }
    });

    return json(req, {
      success: sent,
      email_sent: sent,
      email_error: emailError
    });

  } catch (err) {
    return json(req, {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    }, 400);
  }
});
