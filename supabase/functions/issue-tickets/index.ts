import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff, randomToken, sha256 } from "../_shared/supabase.ts";
import { syncIssueToAppsScript } from "../_shared/apps-script.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, message: "Method not allowed" }, 405);

  try {
    const { profile, admin } = await requireStaff(req, ["admin", "finance", "event_admin"]);
    const body = await req.json();
    const p = body.purchaser || {};
    const pay = body.payment || {};
    const quantity = Number(pay.ticket_quantity);

    const required = [
      "student_number", "campus", "first_name", "last_name",
      "email", "course", "year_level", "section"
    ];

    for (const key of required) {
      if (!String(p[key] || "").trim()) {
        throw new Error(`Missing ${key.replaceAll("_", " ")}`);
      }
    }

    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Invalid ticket quantity");
    if (!Number.isFinite(Number(pay.amount_paid)) || Number(pay.amount_paid) < 0) {
      throw new Error("Invalid amount paid");
    }

    const holders = Array.isArray(body.ticket_holders) ? body.ticket_holders : [];
    const purchaserName = [p.first_name, p.middle_name, p.last_name]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const tokens = [];

    for (let i = 0; i < quantity; i++) {
      const qr_token = randomToken();
      tokens.push({
        qr_token,
        token_hash: await sha256(qr_token),
        holder_name: String(holders[i] || purchaserName).trim()
      });
    }

    const { data: created, error: createError } = await admin.rpc(
      "create_registration_and_tickets",
      {
        p_registration: {
          event_slug: body.event_slug || "pu-fest-2026",
          ...p,
          ticket_quantity: quantity,
          amount_paid: Number(pay.amount_paid),
          or_number: pay.or_number || "",
          payment_date: pay.payment_date,
          payment_method: pay.payment_method,
          notes: pay.notes || "",
          created_by: profile.id
        },
        p_tokens: tokens
      }
    );

    if (createError) throw createError;

    const registrationId = created.registration_id;
    let sheetSynced = false;
    let emailSent = false;
    let sheetError: string | null = null;
    let emailError: string | null = null;

    try {
      const bridge = await syncIssueToAppsScript(admin, registrationId, "issue");
      sheetSynced = !!bridge?.sheet_synced;
      emailSent = !!bridge?.email_sent;
      sheetError = bridge?.sheet_error || null;
      emailError = bridge?.email_error || null;
    } catch (bridgeError) {
      const msg = bridgeError instanceof Error ? bridgeError.message : String(bridgeError);
      sheetError = msg;
      emailError = msg;
    }

    await admin.from("registrations").update({
      sheet_sync_status: sheetSynced ? "synced" : "failed",
      sheet_synced_at: sheetSynced ? new Date().toISOString() : null,
      sheet_sync_error: sheetError,
      email_status: emailSent ? "sent" : "failed",
      email_sent_at: emailSent ? new Date().toISOString() : null,
      email_error: emailError
    }).eq("id", registrationId);

    await admin.from("email_logs").insert({
      registration_id: registrationId,
      recipient: p.email,
      status: emailSent ? "sent" : "failed",
      provider: "google-apps-script",
      error_message: emailError
    });

    return json(req, {
      success: true,
      registration_id: registrationId,
      transaction_number: created.transaction_number,
      tickets: created.tickets,
      sheet_synced: sheetSynced,
      email_sent: emailSent,
      sheet_error: sheetError,
      email_error: emailError
    });

  } catch (err) {
    return json(req, {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    }, 400);
  }
});
