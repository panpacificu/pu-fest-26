import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff, randomToken, sha256 } from "../_shared/supabase.ts";

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

    // Google Apps Script will pick this up automatically on its time trigger.
    await admin.from("registrations").update({
      sheet_sync_status: "pending",
      sheet_sync_error: null,
      email_status: "pending",
      email_error: null
    }).eq("id", created.registration_id);

    return json(req, {
      success: true,
      registration_id: created.registration_id,
      transaction_number: created.transaction_number,
      tickets: created.tickets,
      sheet_synced: false,
      email_sent: false,
      queued: true
    });

  } catch (err) {
    return json(req, {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    }, 400);
  }
});
