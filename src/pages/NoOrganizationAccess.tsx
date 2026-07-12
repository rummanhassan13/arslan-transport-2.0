import { Building2 } from "lucide-react";

export function NoOrganizationAccess({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-center">
        <span className="auth-icon">
          <Building2 size={24} />
        </span>
        <p className="auth-eyebrow">Organization Access</p>
        <h1>No organization linked</h1>
        <p className="auth-note">
          Your account is active, but it is not linked to an organization yet.
        </p>
        <button className="btn-primary auth-submit" onClick={() => void onSignOut()}>
          Account / Logout
        </button>
      </section>
    </main>
  );
}
