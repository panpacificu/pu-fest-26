import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {profile,admin} = await requireStaff(req,["admin","event_admin"]);
    const {ticket_id} = await req.json();
    if (!ticket_id) throw new Error("Ticket ID required");
    const {data:old,error:oldError} = await admin.from("tickets").select("id,ticket_number,status").eq("id",ticket_id).single();
    if (oldError || !old) throw new Error("Ticket not found");
    if (old.status !== "unused") throw new Error(`Only unused tickets can be voided. Current status: ${old.status}`);
    const {error} = await admin.from("tickets").update({status:"void"}).eq("id",ticket_id).eq("status","unused");
    if (error) throw error;
    await admin.from("audit_logs").insert({
      actor_id:profile.id,action:"VOID_TICKET",entity_type:"ticket",entity_id:ticket_id,
      old_values:{status:"unused",ticket_number:old.ticket_number},new_values:{status:"void"}
    });
    return json(req,{success:true,ticket_number:old.ticket_number});
  } catch(err) {
    return json(req,{success:false,message:err instanceof Error?err.message:String(err)},400);
  }
});
