import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, message: "Method not allowed" }, 405);

  try {
    const { profile, admin } = await requireStaff(req, ["admin", "finance", "event_admin"]);
    const body = await req.json();
    const registrationId = String(body.registration_id || "");
    const reason = String(body.reason || "Archived by staff").trim().slice(0, 500);

    if (!registrationId) throw new Error("Registration ID is required.");

    const { data: registration, error: regError } = await admin.from("registrations")
      .select("*")
      .eq("id", registrationId)
      .single();
    if (regError || !registration) throw new Error("Transaction not found.");
    if (registration.archived_at) throw new Error("Transaction is already archived.");

    const { data: tickets, error: ticketError } = await admin.from("tickets")
      .select("*")
      .eq("registration_id", registrationId)
      .order("created_at");
    if (ticketError) throw ticketError;

    const archivedAt = new Date().toISOString();

    const { error: archiveError } = await admin.from("transaction_archives").upsert({
      registration_id: registration.id,
      transaction_number: registration.transaction_number,
      registration_snapshot: registration,
      tickets_snapshot: tickets || [],
      archived_by: profile.id,
      archive_reason: reason,
      archived_at: archivedAt
    }, { onConflict: "registration_id" });
    if (archiveError) throw archiveError;

    // Check-in history remains in checkin_logs and the archive snapshot. All archived tickets become void.
    const { error: voidError } = await admin.from("tickets")
      .update({ status: "void" })
      .eq("registration_id", registrationId);
    if (voidError) throw voidError;

    const nextEmailStatus = registration.email_status === "sent" ? "sent" : "cancelled";
    const { error: updateError } = await admin.from("registrations").update({
      status: "cancelled",
      archived_at: archivedAt,
      archived_by: profile.id,
      archive_reason: reason,
      email_status: nextEmailStatus,
      email_error: null,
      sheet_sync_status: "pending",
      sheet_sync_error: null,
      updated_by: profile.id
    }).eq("id", registrationId);
    if (updateError) throw updateError;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "ARCHIVE_TRANSACTION",
      entity_type: "registration",
      entity_id: registrationId,
      old_values: { status: registration.status, email_status: registration.email_status },
      new_values: { status: "cancelled", archived_at: archivedAt, reason }
    });

    return json(req, {
      success: true,
      transaction_number: registration.transaction_number,
      archived_at: archivedAt
    });
  } catch (err) {
    return json(req, { success: false, message: err instanceof Error ? err.message : String(err) }, 400);
  }
});
