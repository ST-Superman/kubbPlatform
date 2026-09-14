import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/profiles";
import { getUnreadTotal, isPlatformAdmin } from "@/lib/supabase/messages";
import { HeaderNav } from "@/components/header-nav";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [profile, unread, admin] = user
    ? await Promise.all([getMyProfile(), getUnreadTotal(), isPlatformAdmin()])
    : [null, 0, false];

  return (
    <HeaderNav
      authed={!!user}
      handle={profile?.handle ?? null}
      unread={unread}
      isAdmin={admin}
    />
  );
}
