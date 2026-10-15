import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

function randomSubmission() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `PUF26-ONL-${hex}`;
}

function decodeBase64(data: string) {
  const raw = atob(data);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, message: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const admin = adminClient();
    if (String(body.website || "").trim()) throw new Error("Invalid submission.");

    const required = ["first_name", "last_name", "email", "contact_number", "payment_method"];
    for (const key of required) {
      if (!String(body[key] || "").trim()) throw new Error(`Missing ${key.replaceAll("_", " ")}`);
    }

    const paidQty = Number(body.paid_ticket_quantity);
    if (!Number.isInteger(paidQty) || paidQty < 1 || paidQty > 50) {
      throw new Error("Ticket quantity must be between 1 and 50");
    }

    const proof = body.proof || {};
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!proof.data || !allowed.includes(String(proof.type || ""))) {
      throw new Error("A JPG, PNG, or WebP proof of payment is required.");
    }

    const bytes = decodeBase64(String(proof.data));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Proof of payment must be 5 MB or smaller.");

    const { data: event, error: eventError } = await admin.from("events")
      .select("id,ticket_price,max_tickets_per_transaction,sales_open")
      .eq("slug", body.event_slug || "pu-fest-2026")
      .single();

    if (eventError || !event?.sales_open) throw new Error("Online ticket sales are currently unavailable.");
    if (paidQty > Number(event.max_tickets_per_transaction || 50)) throw new Error("Ticket quantity exceeds the event limit.");

    const freeQty = Math.floor(paidQty / 10);
    const totalQty = paidQty + freeQty;
    const expectedTotal = Number(event.ticket_price) * paidQty;
    const id = crypto.randomUUID();
    const submissionNumber = randomSubmission();
    const ext = proof.type === "image/png" ? "png" : proof.type === "image/webp" ? "webp" : "jpg";
    const path = `${id}/proof.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("online-payment-proofs")
      .upload(path, bytes, { contentType: proof.type, upsert: false });
    if (uploadError) throw uploadError;

    const { error: insertError } = await admin.from("online_orders").insert({
      id,
      event_id: event.id,
      submission_number: submissionNumber,
      first_name: String(body.first_name).trim(),
      middle_name: String(body.middle_name || "").trim() || null,
      last_name: String(body.last_name).trim(),
      email: String(body.email).trim().toLowerCase(),
      contact_number: String(body.contact_number).trim(),
      organization: String(body.organization || "").trim() || null,
      paid_ticket_quantity: paidQty,
      free_ticket_quantity: freeQty,
      total_ticket_quantity: totalQty,
      ticket_price: event.ticket_price,
      expected_total: expectedTotal,
      payment_method: String(body.payment_method).trim(),
      payment_reference: String(body.payment_reference || "").trim() || null,
      receipt_path: path,
      notes: String(body.notes || "").trim() || null,
      status: "pending"
    });

    if (insertError) {
      await admin.storage.from("online-payment-proofs").remove([path]);
      throw insertError;
    }

    return json(req, {
      success: true,
      submission_number: submissionNumber,
      paid_ticket_quantity: paidQty,
      free_ticket_quantity: freeQty,
      total_ticket_quantity: totalQty,
      expected_total: expectedTotal,
      status: "pending"
    });
  } catch (err) {
    return json(req, { success: false, message: err instanceof Error ? err.message : String(err) }, 400);
  }
});
