import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff, randomToken, sha256 } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, message: "Method not allowed" }, 405);

  try {
    const { profile, admin } = await requireStaff(req, ["admin", "finance", "event_admin"]);
    const body = await req.json();
    const orderId = String(body.order_id || "");
    const action = String(body.action || "").toLowerCase();
    const reviewNote = String(body.review_note || "").trim();

    if (!orderId) throw new Error("Online request ID is required.");
    if (!['approve','reject'].includes(action)) throw new Error("Invalid review action.");

    const { data: order, error: orderError } = await admin.from("online_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) throw new Error("Online request not found.");
    if (order.status !== "pending") throw new Error(`This request is already ${order.status}.`);

    if (action === "reject") {
      const { error } = await admin.from("online_orders").update({
        status: "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote || null
      }).eq("id", orderId).eq("status", "pending");
      if (error) throw error;

      await admin.from("audit_logs").insert({
        actor_id: profile.id,
        action: "REJECT_ONLINE_ORDER",
        entity_type: "online_order",
        entity_id: orderId,
        new_values: { submission_number: order.submission_number, review_note: reviewNote || null }
      });

      return json(req, { success: true, status: "rejected" });
    }

    const paidQty = Number(order.paid_ticket_quantity);
    const freeQty = Math.floor(paidQty / 10);
    const totalQty = paidQty + freeQty;
    const holderName = [order.first_name, order.middle_name, order.last_name]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const tokens = [];
    for (let i = 0; i < totalQty; i++) {
      const qr_token = randomToken();
      tokens.push({
        qr_token,
        token_hash: await sha256(qr_token),
        holder_name: holderName,
        is_free: i >= paidQty
      });
    }

    const paymentDate = new Date(order.created_at || Date.now()).toISOString().slice(0, 10);
    const { data: created, error: createError } = await admin.rpc("create_registration_and_tickets", {
      p_registration: {
        event_slug: "pu-fest-2026",
        purchase_source: "online",
        online_order_id: order.id,
        paid_ticket_quantity: paidQty,
        ticket_quantity: totalQty,
        student_number: `ONLINE-${String(order.submission_number).replace("PUF26-ONL-", "")}`,
        campus: "External",
        first_name: order.first_name,
        middle_name: order.middle_name || "",
        last_name: order.last_name,
        email: order.email,
        course: order.organization || "Guest / External",
        year_level: "Guest",
        section: "Online Registration",
        amount_paid: Number(order.expected_total),
        or_number: order.payment_reference || "",
        receipt_path: order.receipt_path,
        payment_date: paymentDate,
        payment_method: order.payment_method,
        notes: order.notes || "",
        review_note: reviewNote,
        created_by: profile.id
      },
      p_tokens: tokens
    });

    if (createError) throw createError;

    // Approval creates a real registration and immediately enters the existing email/Sheet queue.
    await admin.from("registrations").update({
      sheet_sync_status: "pending",
      sheet_sync_error: null,
      email_status: "pending",
      email_error: null
    }).eq("id", created.registration_id);

    return json(req, {
      success: true,
      status: "approved",
      registration_id: created.registration_id,
      transaction_number: created.transaction_number,
      paid_ticket_quantity: paidQty,
      free_ticket_quantity: freeQty,
      ticket_quantity: totalQty
    });
  } catch (err) {
    return json(req, { success: false, message: err instanceof Error ? err.message : String(err) }, 400);
  }
});
