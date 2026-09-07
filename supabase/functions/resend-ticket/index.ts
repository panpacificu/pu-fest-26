import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";
import { sendTicketEmail, logEmailFailure } from "../_shared/email.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {profile,admin} = await requireStaff(req,["admin","finance","event_admin"]);
    const {registration_id} = await req.json();
    const {data:r,error} = await admin.from("registrations").select("id,email").eq("id",registration_id).single();
    if (error || !r) throw new Error("Registration not found");
    try {
      const response = await sendTicketEmail(admin,r.id);
      await admin.from("audit_logs").insert({actor_id:profile.id,action:"RESEND_TICKET_EMAIL",entity_type:"registration",entity_id:r.id,new_values:{provider_message_id:response.id||null}});
      return json(req,{success:true,provider_message_id:response.id||null});
    } catch(e) {
      await logEmailFailure(admin,r.id,r.email,e);
      throw e;
    }
  } catch(err) {
    return json(req,{success:false,message:err instanceof Error?err.message:String(err)},400);
  }
});
