import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Cargo, CargoDraft } from "@barkoul/domain";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
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

export async function publishCargo(draft: CargoDraft): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error("لم يتم إعداد اتصال قاعدة البيانات بعد.");

  // Resolve the owner from the verified Supabase session, never from a caller-supplied ID.
  const { data, error: authError } = await db.auth.getUser();
  if (authError || !data.user) {
    throw new Error("يجب تسجيل الدخول قبل نشر الشحنة.");
  }

  const { error } = await db.from("cargos").insert({
    owner_id: data.user.id,
    ...draft,
    status: "open"
  });
  if (error) throw error;
}