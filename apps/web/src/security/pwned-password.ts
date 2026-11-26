/**
 * Client-side breach screening using HIBP Pwned Passwords k-anonymity.
 * The raw password and full SHA-1 hash never leave this browser.
 * This is an additional UI safeguard, not a server-side Supabase enforcement layer.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    method: "GET",
    headers: { "Add-Padding": "true" },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("تعذر الوصول إلى خدمة فحص كلمات المرور المسرّبة.");
  const matches = (await response.text()).split(/\r?\n/);
  return matches.some((line) => {
    const [candidate, count] = line.trim().split(":");
    return candidate?.toUpperCase() === suffix && Number(count) > 0;
  });
}

export function meetsBarkoulPasswordPolicy(password: string): boolean {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
