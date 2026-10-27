import { useEffect, useState } from "react";
import { supabase } from "./supabase";

type Meta = Record<string, unknown> | null | undefined;

/** First name from the Google profile that Supabase stores at sign-in. Never guessed from the email address. */
export function firstNameFromMeta(meta: Meta): string | null {
  if (!meta) return null;
  const pick = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string).trim() : "");
  const raw = pick("given_name") || pick("full_name") || pick("name");
  const first = raw.split(/\s+/)[0]?.replace(/[<>&"]/g, "") ?? "";
  if (!first || first.length > 30) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function useFirstName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setName(firstNameFromMeta(data.session?.user.user_metadata));
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setName(firstNameFromMeta(s?.user.user_metadata)),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return name;
}
