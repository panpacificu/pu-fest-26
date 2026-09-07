import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, sha256 } from "../_shared/supabase.ts";

Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  try {
    const {token} = await req.json();
    if (!token || String(token).length<20) return json(req,{valid:false,message:"Invalid ticket token"},400);
    const admin = adminClient();
    const hash = await sha256(String(token));
    const {data:t,error} = await admin.from("tickets")
      .select("id,ticket_number,holder_name,status,registration_id,event_id")
      .eq("token_hash",hash).single();
    if (error || !t) return json(req,{valid:false,message:"Ticket not found"},404);
    const [{data:r},{data:e}] = await Promise.all([
      admin.from("registrations").select("first_name,middle_name,last_name,course,year_level,section").eq("id",t.registration_id).single(),
      admin.from("events").select("name,event_date,start_time,end_time,venue").eq("id",t.event_id).single()
    ]);
    return json(req,{
      valid:true,ticket_number:t.ticket_number,holder_name:t.holder_name,status:t.status,
      purchaser_name:[r?.first_name,r?.middle_name,r?.last_name].filter(Boolean).join(" "),
      course:r?.course,year_level:r?.year_level,section:r?.section,event:e
    });
  } catch(err) {
    return json(req,{valid:false,message:err instanceof Error?err.message:String(err)},400);
  }
});
