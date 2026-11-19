import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export function facultyAuth(app, read, save) {
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const cookie = (req) =>
    String(req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("fieldtrip_session="))
      ?.slice(18);
  function current(req) {
    const token = cookie(req);
    if (!token) return null;
    const session = read("session:" + hash(token));
    return session?.expires > Date.now() ? session : null;
  }
  function login(res, name) {
    const token = randomBytes(32).toString("hex");
    save("session:" + hash(token), {
      name,
      expires: Date.now() + 12 * 3600000,
    });
    res.cookie("fieldtrip_session", token, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: 12 * 3600000,
      path: "/",
    });
    res.json({ name, authenticated: true });
  }
  const failures = new Map();
  app.get("/api/faculty/session", (req, res) =>
    res.json({
      configured: !!read("faculty-account"),
      authenticated: !!current(req),
      name: current(req)?.name,
    }),
  );
  app.post("/api/faculty/setup", (req, res) => {
    if (read("faculty-account"))
      return res
        .status(409)
        .json({ error: "A faculty account already exists. Sign in." });
    const { name, password } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof password !== "string" ||
      password.length < 8
    )
      return res
        .status(400)
        .json({
          error: "Enter your name and a password of at least 8 characters.",
        });
    const salt = randomBytes(16).toString("hex");
    save("faculty-account", {
      name: name.trim(),
      salt,
      password: scryptSync(password, salt, 32).toString("hex"),
    });
    login(res, name.trim());
  });
  app.post("/api/faculty/login", (req, res) => {
    const record = failures.get(req.ip);
    if (record && record.until > Date.now() && record.count >= 5)
      return res
        .status(429)
        .json({ error: "Too many attempts. Try again in five minutes." });
    const account = read("faculty-account");
    const valid =
      account &&
      typeof req.body.password === "string" &&
      timingSafeEqual(
        Buffer.from(account.password, "hex"),
        scryptSync(req.body.password, account.salt, 32),
      );
    if (!valid) {
      failures.set(req.ip, {
        count: (record?.until > Date.now() ? record.count : 0) + 1,
        until: Date.now() + 300000,
      });
      return res.status(403).json({ error: "Incorrect password." });
    }
    failures.delete(req.ip);
    login(res, account.name);
  });
  app.post("/api/faculty/logout", (req, res) => {
    const token = cookie(req);
    if (token) save("session:" + hash(token), { expires: 0 });
    res.clearCookie("fieldtrip_session", { path: "/" });
    res.json({ authenticated: false });
  });
  return current;
}
