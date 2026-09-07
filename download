import { createClient } from "npm:@supabase/supabase-js@2";

function parseKeySet(name: string): string | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj.default || Object.values(obj)[0] as string || null;
  } catch { return raw; }
}

export function projectUrl() {
  return Deno.env.get("SUPABASE_URL")!;
}

export function publishableKey() {
  return parseKeySet("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY")!;
}

export function secretKey() {
  return parseKeySet("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

export function adminClient() {
  return createClient(projectUrl(), secretKey(), {auth:{persistSession:false,autoRefreshToken:false}});
}

export async function requireStaff(req: Request, allowed: string[]) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.slice(7);

  const userClient = createClient(projectUrl(), publishableKey(), {auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error} = await userClient.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  const admin = adminClient();
  const {data:profile,error:profileError} = await admin
    .from("profiles").select("id,email,full_name,role,active").eq("id",user.id).single();

  if (profileError || !profile?.active || !allowed.includes(profile.role)) throw new Error("Forbidden");
  return {user,profile,admin};
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
