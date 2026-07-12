import { useState, type FormEvent } from "react";
import { LockKeyhole, Mail } from "lucide-react";

export function LoginPage({
  onSignIn,
  loading,
  initialError,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  loading: boolean;
  initialError?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const disabled = loading || Boolean(initialError);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      await onSignIn(email, password);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    }
  };

  return (
    <main className="auth-shell auth-shell-login">
      <section className="auth-story" aria-label="TransportFlow overview">
        <div className="v2-brand">
          <span className="v2-brand-mark">TF</span>
          <span className="v2-brand-copy"><strong>TransportFlow</strong><small>Transport operations</small></span>
        </div>
        <div className="auth-story-copy">
          <span>One organized workspace</span>
          <h2>Keep every shipment, payment, and document in view.</h2>
          <p>Built for transport teams replacing scattered spreadsheets with a clear daily workflow.</p>
        </div>
        <div className="auth-story-points">
          <span>Shipment operations</span>
          <span>Driver settlements</span>
          <span>Client receivables</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">TF</span>
          <div>
            <p>Welcome back</p>
            <h1>Sign in to your workspace</h1>
          </div>
        </div>

        <p className="auth-note">
          Use the account provided by your organization administrator.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <div className="field-with-icon">
              <Mail size={15} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@company.com"
                disabled={disabled}
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="field-with-icon">
              <LockKeyhole size={15} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                disabled={disabled}
                required
              />
            </div>
          </label>

          {(initialError || error) && (
            <p className="form-error">
              {initialError || error}
            </p>
          )}

          <button className="btn-primary auth-submit" type="submit" disabled={disabled}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}
