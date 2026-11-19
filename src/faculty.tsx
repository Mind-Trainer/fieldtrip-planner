import React, { useEffect, useState } from "react";
export function FacultyAccount({ api }) {
  const [session, setSession] = useState(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function reload() {
    setSession(await api("faculty/session"));
  }
  useEffect(() => {
    reload().catch((e) => setMessage(e.message));
  }, []);
  async function submit(path, body) {
    setBusy(true);
    try {
      await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await reload();
      setPassword("");
      setMessage(
        path.endsWith("logout") ? "Signed out" : "Faculty session active",
      );
      window.dispatchEvent(new Event("faculty-session-changed"));
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="faculty-account">
      {session?.authenticated ? (
        <div>
          <p>
            Signed in as <strong>{session.name}</strong>. Select a facility
            below to record verification.
          </p>
          <button onClick={() => submit("faculty/logout", {})} disabled={busy}>
            Sign out
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(session?.configured ? "faculty/login" : "faculty/setup", {
              name,
              password,
            });
          }}
        >
          <h3>
            {session?.configured
              ? "Faculty sign in"
              : "Create your local faculty account"}
          </h3>
          <p>This account stores verification evidence on this computer.</p>
          <div className="formgrid">
            {!session?.configured && (
              <label>
                Faculty name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              Faculty password
              <input
                required
                type="password"
                minLength={8}
                autoComplete={
                  session?.configured ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <button className="primary" disabled={busy || !session}>
            {session?.configured ? "Sign in" : "Create faculty account"}
          </button>
        </form>
      )}
      <p aria-live="polite">{message}</p>
    </div>
  );
}
