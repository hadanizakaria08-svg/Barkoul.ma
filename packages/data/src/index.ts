import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildCargoInsertPayload, canPublishCargo, type Cargo, type CargoDraft, type ProfileRole } from "@barkoul/domain";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
    });
  }
  return client;
}

export async function listOpenCargos(): Promise<Cargo[]> {
  const db = getSupabase();
  if (!db) throw new Error("لم يتم إعداد اتصال قاعدة البيانات بعد.");
  const { data, error } = await db.from("cargos")
    .select("id,title,origin_city,destination_city,goods_type,weight_text,truck_type,loading_date,offered_price_mad,notes,status,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Cargo[];
}

export async function getCurrentProfileRole(expectedUserId?: string): Promise<ProfileRole | null> {
  const db = getSupabase();
  if (!db) throw new Error("لم يتم إعداد اتصال قاعدة البيانات بعد.");

  // Resolve identity from Supabase Auth; never trust a caller-supplied role or user ID.
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return null;
  if (expectedUserId && authData.user.id !== expectedUserId) {
    throw new Error("The authenticated session changed during profile authorization.");
  }

  const { data, error } = await db.from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error) throw error;

  // Re-check the session after the profile read so a mid-request account switch
  // cannot leave a role result associated with a different authenticated user.
  const { data: verifiedAuthData, error: verifiedAuthError } = await db.auth.getUser();
  if (verifiedAuthError) throw verifiedAuthError;
  if (!verifiedAuthData.user || verifiedAuthData.user.id !== authData.user.id) {
    throw new Error("The authenticated session changed during profile authorization.");
  }

  // Fail closed for missing, malformed, or unknown role values.
  const role: unknown = data?.role;
  return role === "user" || role === "driver" || role === "owner" || role === "admin"
    ? role
    : null;
}

export async function publishCargo(draft: CargoDraft): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error("لم يتم إعداد اتصال قاعدة البيانات بعد.");

  // Resolve the owner from the verified Supabase session, never from a caller-supplied ID.
  const { data, error: authError } = await db.auth.getUser();
  if (authError || !data.user) {
    throw new Error("يجب تسجيل الدخول قبل نشر الشحنة.");
  }

  const { data: profile, error: profileError } = await db.from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!canPublishCargo(profile?.role)) {
    throw new Error("حسابك مسجل، لكن دورك الحالي لا يسمح بنشر الشحنات. يلزم تفعيل دور صاحب البضاعة من الإدارة.");
  }

  // Re-verify identity after the profile read and immediately before writing.
  // This fails closed if the user signed out or switched accounts mid-request.
  const { data: verifiedAuthData, error: verificationError } = await db.auth.getUser();
  if (verificationError) throw verificationError;
  if (!verifiedAuthData.user || verifiedAuthData.user.id !== data.user.id) {
    throw new Error("The authenticated session changed before cargo publication.");
  }

  const { error } = await db.from("cargos").insert(
    buildCargoInsertPayload(draft, data.user.id)
  );
  if (error) throw error;
}