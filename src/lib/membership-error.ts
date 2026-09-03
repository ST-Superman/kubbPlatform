import { toast } from "sonner";

/**
 * Detects the `membership_required` exception raised by the paywall-enforcement triggers
 * (supabase/migrations/20260903144559_paywall_enforcement.sql) and shows a friendly toast
 * whose action navigates to the membership page. Returns true when it handled the error,
 * so the caller can skip its generic error toast.
 *
 * Pass a navigate callback (e.g. () => router.push("/membership")) so navigation goes
 * through the Next router. Wire into every gated-RPC error branch (match create / play /
 * challenge). Inert during Beta — is_entitled() is true for everyone, so it never raises.
 */
export function handleMembershipError(
  message: string | undefined,
  goToMembership: () => void,
): boolean {
  if (!message || !message.includes("membership_required")) return false;
  toast.error("An active membership is required to play virtual matches.", {
    action: { label: "Get membership", onClick: goToMembership },
  });
  return true;
}
