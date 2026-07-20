import { Dashboard } from "@/components/pages/Dashboard";

// No per-page title on the home URL: a cold open always lands here first, then the
// client-side auth guard redirects a signed-out visitor to /login. A static "Dashboard"
// title would flash in the tab during that hop, so the home URL inherits the app-name
// default ("Inventive Helpdesk") and the Dashboard sets its own tab title once it renders.
export default function Page() {
  return <Dashboard />;
}
