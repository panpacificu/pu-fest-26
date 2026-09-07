import QRCode from "npm:qrcode@1.5.4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"} as Record<string,string>)[c]);
}

function fullName(r:any) {
  return [r.first_name,r.middle_name,r.last_name].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}

export async function sendTicketEmail(admin: SupabaseClient, registrationId: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const {data:reg,error:regError} = await admin.from("registrations").select("*").eq("id",registrationId).single();
  if (regError || !reg) throw new Error("Registration not found.");

  const {data:tickets,error:ticketError} = await admin.from("tickets")
    .select("id,ticket_number,holder_name,status").eq("registration_id",registrationId).order("created_at");
  if (ticketError || !tickets?.length) throw new Error("Tickets not found.");

  const ids = tickets.map(t=>t.id);
  const {data:secrets,error:secretError} = await admin.from("ticket_secrets").select("ticket_id,qr_token").in("ticket_id",ids);
  if (secretError) throw secretError;
  const secretMap = new Map((secrets||[]).map(s=>[s.ticket_id,s.qr_token]));

  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/,"");
  if (!siteUrl) throw new Error("SITE_URL is not configured.");

  const attachments:any[] = [];
  const cards:string[] = [];

  for (let i=0;i<tickets.length;i++) {
    const t=tickets[i];
    const token=secretMap.get(t.id);
    if (!token) throw new Error(`Ticket secret missing for ${t.ticket_number}`);
    const url = `${siteUrl}/ticket.html?t=${encodeURIComponent(token)}`;
    const dataUrl = await QRCode.toDataURL(url,{width:360,margin:2,errorCorrectionLevel:"M"});
    const base64 = dataUrl.split(",")[1];
    const cid = `ticket-${i+1}`;
    attachments.push({content:base64,filename:`${t.ticket_number}.png`,content_id:cid,content_type:"image/png"});
    cards.push(`
      <tr><td style="padding:14px 0">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e3e8ef;border-radius:16px;background:#ffffff">
          <tr>
            <td align="center" style="padding:24px">
              <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;color:#174ea4">TICKET ${i+1} OF ${tickets.length}</div>
              <img src="cid:${cid}" width="230" alt="PU Fest ticket QR" style="display:block;width:230px;max-width:100%;margin:14px auto;border:0">
              <div style="font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#071a3d">${esc(t.holder_name)}</div>
              <div style="font-family:Arial,sans-serif;font-size:12px;color:#6e7a8d;margin-top:5px">${esc(reg.course)} • ${esc(reg.year_level)} • ${esc(reg.section)}</div>
              <div style="font-family:Arial,sans-serif;font-size:11px;color:#6e7a8d;margin-top:16px">TICKET NUMBER</div>
              <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:1px;color:#071a3d">${esc(t.ticket_number)}</div>
              <a href="${esc(url)}" style="display:inline-block;margin-top:18px;background:#071a3d;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:12px 18px;border-radius:9px">VIEW TICKET</a>
            </td>
          </tr>
        </table>
      </td></tr>`);
  }

  const html = `<!doctype html>
  <html><body style="margin:0;padding:0;background:#f2f5f9">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5f9;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden">
        <tr><td style="background:#071a3d;padding:34px 32px;text-align:center">
          <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#b8c8e0">PANPACIFIC UNIVERSITY</div>
          <div style="font-family:Arial,sans-serif;font-size:42px;font-weight:800;letter-spacing:-2px;color:#ffffff;margin-top:7px">PU Fest <span style="color:#f3c84b">2026</span></div>
          <div style="font-family:Arial,sans-serif;font-size:13px;color:#d7e1ef;margin-top:6px">Official Event Ticket Confirmation</div>
        </td></tr>
        <tr><td style="padding:32px">
          <div style="font-family:Arial,sans-serif;font-size:25px;font-weight:700;color:#071a3d">Payment confirmed.</div>
          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#536176;margin:10px 0 22px">
            Hi ${esc(reg.first_name)}, your PU Fest 2026 payment has been recorded and your ${tickets.length} ticket${tickets.length>1?"s are":" is"} ready.
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;border-radius:13px;padding:10px">
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">EVENT</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">PU Fest 2026</td></tr>
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">DATE</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">October 30, 2026</td></tr>
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">TIME</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">1:00 PM – 6:00 PM</td></tr>
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">VENUE</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">PanpacificU Events Center</td></tr>
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">TRANSACTION</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">${esc(reg.transaction_number)}</td></tr>
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">AMOUNT PAID</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">PHP ${Number(reg.amount_paid).toLocaleString("en-PH",{minimumFractionDigits:2})}</td></tr>
            <tr><td style="padding:8px 10px;font:11px Arial;color:#7a8798">OR / REF #</td><td style="padding:8px 10px;font:bold 12px Arial;color:#071a3d">${esc(reg.or_number || "To be updated by Finance")}</td></tr>
          </table>
          <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.6px;color:#174ea4;margin-top:28px">YOUR TICKET${tickets.length>1?"S":""}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cards.join("")}</table>
          <div style="background:#fff8df;border:1px solid #f3df96;border-radius:12px;padding:15px;margin-top:12px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#5d5127">
            <strong>Important:</strong> Each QR code may be successfully checked in only once. Do not publicly share your ticket QR.
          </div>
          <p style="font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#7a8798;margin-top:24px">
            If you have concerns about your payment or ticket, reply to this email or contact the event team through the official Panpacific University channels.
          </p>
        </td></tr>
        <tr><td style="background:#f6f8fb;padding:20px 32px;text-align:center;font-family:Arial,sans-serif;font-size:10px;color:#8a96a6">
          Panpacific University | PU Fest 2026<br>October 30, 2026 • PanpacificU Events Center
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const from = Deno.env.get("EMAIL_FROM") || "Panpacific University | PU Fest 2026 <marketing.staff@panpacificu.edu.ph>";
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") || "marketing.staff@panpacificu.edu.ph";

  const res = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${apiKey}`,
      "Content-Type":"application/json",
      "User-Agent":"PU-Fest-2026-Ticketing/1.0"
    },
    body:JSON.stringify({
      from,
      to:[reg.email],
      reply_to:replyTo,
      subject:`Your PU Fest 2026 Ticket${tickets.length>1?"s":""} | ${reg.transaction_number}`,
      html,
      attachments,
      tags:[{name:"event",value:"pu-fest-2026"},{name:"transaction",value:reg.transaction_number.replace(/[^A-Za-z0-9_-]/g,"-")}]
    })
  });

  const response = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(response?.message || `Email provider returned ${res.status}`);

  await admin.from("email_logs").insert({
    registration_id:registrationId,recipient:reg.email,status:"sent",provider_message_id:response.id || null
  });
  await admin.from("registrations").update({email_status:"sent"}).eq("id",registrationId);
  return response;
}

export async function logEmailFailure(admin: SupabaseClient, registrationId:string, recipient:string, error:unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  await admin.from("email_logs").insert({registration_id:registrationId,recipient,status:"failed",error_message:msg});
  await admin.from("registrations").update({email_status:"failed"}).eq("id",registrationId);
}
