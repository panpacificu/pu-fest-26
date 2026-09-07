import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {profile,admin} = await requireStaff(req,["admin"]);
    const body = await req.json();
    const email=String(body.email||"").trim().toLowerCase();
    const fullName=String(body.full_name||"").trim();
    const password=String(body.password||"");
    const role=String(body.role||"");
    const roles=["admin","finance","event_admin","scanner","viewer"];
    if (!email || !fullName || password.length<8 || !roles.includes(role)) throw new Error("Invalid staff account details");

    const {data,error} = await admin.auth.admin.createUser({
      email,password,email_confirm:true,user_metadata:{full_name:fullName}
    });
    if (error || !data.user) throw error || new Error("User creation failed");

    const {error:profileError} = await admin.from("profiles").update({
      email,full_name:fullName,role,active:true
    }).eq("id",data.user.id);
    if (profileError) throw profileError;

    await admin.from("audit_logs").insert({
      actor_id:profile.id,action:"CREATE_STAFF_USER",entity_type:"profile",entity_id:data.user.id,
      new_values:{email,full_name:fullName,role}
    });
    return json(req,{success:true,user_id:data.user.id});
  } catch(err) {
    return json(req,{success:false,message:err instanceof Error?err.message:String(err)},400);
  }
});
