import { SignIn } from "@/components/pages/SignIn";
import { DesktopOnly } from "@/components/layout/DesktopOnly";

export const metadata = { title: "Sign in" };

// Gated: signing in on a phone only deposits you at the gate on the very next route, so
// the honest place to say "use a computer" is before the password, not after it.
// /set-password is deliberately NOT gated — see components/layout/DesktopOnly.tsx.
export default function Page() {
  return (
    <DesktopOnly>
      <SignIn />
    </DesktopOnly>
  );
}
