import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {profile,admin} = await requireStaff(req,["admin","finance","event_admin"]);
    const body = await req.json();
    const id = String(body.registration_id||"");
    const u = body.updates || {};
    const allowed:any = {};
    for (const key of ["or_number","amount_paid","payment_date","payment_method","notes"]) {
      if (Object.prototype.hasOwnProperty.call(u,key)) allowed[key]=u[key];
    }
    if (!id || !Object.keys(allowed).length) throw new Error("No valid updates supplied");
    if ("amount_paid" in allowed && (!Number.isFinite(Number(allowed.amount_paid)) || Number(allowed.amount_paid)<0)) throw new Error("Invalid amount paid");

    const {data:old,error:oldError} = await admin.from("registrations").select("or_number,amount_paid,payment_date,payment_method,notes").eq("id",id).single();
    if (oldError || !old) throw new Error("Registration not found");

    allowed.updated_by = profile.id;
    const {error} = await admin.from("registrations").update(allowed).eq("id",id);
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id:profile.id,action:"UPDATE_PAYMENT_DETAILS",entity_type:"registration",entity_id:id,
      old_values:old,new_values:allowed
    });
    return json(req,{success:true});
  } catch(err) {
    return json(req,{success:false,message:err instanceof Error?err.message:String(err)},400);
  }
});
