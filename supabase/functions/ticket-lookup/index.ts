import { corsHeaders, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {admin} = await requireStaff(req,["admin","event_admin","scanner"]);
    const {ticket_number} = await req.json();
    const number = String(ticket_number||"").trim().toUpperCase();
    if (!number) return json(req,{found:false,message:"Ticket number required"},400);
    const {data:t,error} = await admin.from("tickets")
      .select("ticket_number,holder_name,status,registration_id,checked_in_at,checked_in_gate")
      .eq("ticket_number",number).single();
    if (error || !t) return json(req,{found:false,message:"Ticket not found"},404);
    const {data:r} = await admin.from("registrations")
      .select("first_name,middle_name,last_name,course,year_level,section").eq("id",t.registration_id).single();
    return json(req,{
      found:true,...t,
      purchaser_name:[r?.first_name,r?.middle_name,r?.last_name].filter(Boolean).join(" "),
      course:r?.course,year_level:r?.year_level,section:r?.section
    });
  } catch(err) {
    return json(req,{found:false,message:err instanceof Error?err.message:String(err)},403);
  }
});
