import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import QRCode from "npm:qrcode@1.5.4";

function fullName(r: any) {
  return [r.first_name, r.middle_name, r.last_name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireBridgeSecret(body: any) {
  const expected = Deno.env.get("PU_FEST_SYNC_SECRET");
  if (!expected) throw new Error("PU_FEST_SYNC_SECRET is not configured.");
  if (!body?.secret || String(body.secret) !== String(expected)) {
    throw new Error("Unauthorized request.");
  }
}

async function ticketPayload(admin: any, registration: any, includeQr: boolean) {
  const { data: tickets, error: ticketError } = await admin
    .from("tickets")
    .select("id,ticket_number,holder_name,status,created_at")
    .eq("registration_id", registration.id)
    .order("created_at");

  if (ticketError) throw ticketError;

  let secretMap = new Map<string, string>();

  if (includeQr && tickets?.length) {
    const ids = tickets.map((t: any) => t.id);
    const { data: secrets, error: secretError } = await admin
      .from("ticket_secrets")
      .select("ticket_id,qr_token")
      .in("ticket_id", ids);

    if (secretError) throw secretError;
    secretMap = new Map((secrets || []).map((s: any) => [s.ticket_id, s.qr_token]));
  }

  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
  const out: any[] = [];

  for (const t of tickets || []) {
    const item: any = { ...t };

    if (includeQr) {
      const token = secretMap.get(t.id);
      if (!token) throw new Error(`Ticket secret missing for ${t.ticket_number}`);

      const ticketUrl = `${siteUrl}/ticket.html?t=${encodeURIComponent(token)}`;
      const dataUrl = await QRCode.toDataURL(ticketUrl, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M"
      });

      item.ticket_url = ticketUrl;
      item.qr_png_base64 = dataUrl.split(",")[1];
    }

    out.push(item);
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, message: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    requireBridgeSecret(body);

    const action = String(body.action || "").toLowerCase();
    const admin = adminClient();

    if (action === "fetch") {
      const limit = Math.max(1, Math.min(Number(body.limit || 10), 25));
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      // Jobs needing either a Sheet backup or an email.
      // "processing" jobs older than 10 minutes can be picked up again.
      const { data: regs, error } = await admin
        .from("registrations")
        .select("*")
        .or(
          `sheet_sync_status.in.(pending,failed),email_status.in.(pending,failed),` +
          `and(sheet_sync_status.eq.processing,updated_at.lt.${cutoff}),` +
          `and(email_status.eq.processing,updated_at.lt.${cutoff})`
        )
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) throw error;

      const jobs: any[] = [];

      for (const r of regs || []) {
        const needsSheet = ["pending", "failed", "processing"].includes(r.sheet_sync_status);
        const needsEmail = ["pending", "failed", "processing"].includes(r.email_status);

        await admin.from("registrations").update({
          sheet_sync_status: needsSheet ? "processing" : r.sheet_sync_status,
          email_status: needsEmail ? "processing" : r.email_status
        }).eq("id", r.id);

        const tickets = await ticketPayload(admin, r, needsEmail);

        jobs.push({
          registration: {
            ...r,
            registration_id: r.id,
            full_name: fullName(r)
          },
          tickets,
          needs_sheet: needsSheet,
          needs_email: needsEmail
        });
      }

      return json(req, { success: true, jobs });
    }

    if (action === "ack") {
      const registrationId = String(body.registration_id || "");
      if (!registrationId) throw new Error("registration_id is required.");

      const update: any = {
        sheet_sync_status: body.sheet_synced ? "synced" : (body.sheet_attempted ? "failed" : undefined),
        sheet_synced_at: body.sheet_synced ? new Date().toISOString() : undefined,
        sheet_sync_error: body.sheet_error || null,
        email_status: body.email_sent ? "sent" : (body.email_attempted ? "failed" : undefined),
        email_sent_at: body.email_sent ? new Date().toISOString() : undefined,
        email_error: body.email_error || null
      };

      for (const key of Object.keys(update)) {
        if (update[key] === undefined) delete update[key];
      }

      const { error } = await admin.from("registrations").update(update).eq("id", registrationId);
      if (error) throw error;

      if (body.email_attempted) {
        const { data: r } = await admin
          .from("registrations")
          .select("email")
          .eq("id", registrationId)
          .single();

        await admin.from("email_logs").insert({
          registration_id: registrationId,
          recipient: r?.email || "",
          status: body.email_sent ? "sent" : "failed",
          provider: "google-apps-script-pull",
          error_message: body.email_error || null
        });
      }

      return json(req, { success: true });
    }

    throw new Error("Invalid action.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(req, { success: false, message }, message === "Unauthorized request." ? 401 : 400);
  }
});
