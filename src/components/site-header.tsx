import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/profiles";
import { HeaderNav } from "@/components/header-nav";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await getMyProfile() : null;

  return <HeaderNav authed={!!user} handle={profile?.handle ?? null} />;
}
