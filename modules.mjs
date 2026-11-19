import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { facultyAuth } from "./auth.mjs";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
export const statuses = [
  "Not Verified",
  "Verification in Progress",
  "Partially Verified",
  "Verified",
  "Recheck Required",
];
export function tripModules(app, db, read, save, runtime) {
  const password =
    process.env.FACULTY_KEY ||
    (existsSync(runtime + "/faculty-key.txt")
      ? readFileSync(runtime + "/faculty-key.txt", "utf8")
      : randomBytes(18).toString("base64url"));
  if (!process.env.FACULTY_KEY)
    writeFileSync(runtime + "/faculty-key.txt", password, { mode: 0o600 });
  const digest = (s) =>
    createHash("sha256")
      .update(String(s || ""))
      .digest();
  const current = facultyAuth(app, read, save);
  const faculty = (req, res, next) =>
    current(req) ||
    timingSafeEqual(digest(req.get("x-faculty-key")), digest(password))
      ? next()
      : res
          .status(403)
          .json({ error: "Enter the faculty key from the local server." });
  app.get("/api/trip/:id", (req, res) =>
    res.json(read("trip:" + req.params.id) || {}),
  );
  app.post("/api/trip/:id", (req, res) => {
    if (
      !/^[a-f0-9]{64}$/.test(req.params.id) ||
      !Array.isArray(req.body.planned)
    )
      return res.status(400).json({ error: "Invalid trip data" });
    save("trip:" + req.params.id, req.body);
    res.json({ saved: true });
  });
  app.get("/api/reviews", (req, res) =>
    res.json(
      db
        .prepare(
          "select * from verification where id in (select max(id) from verification group by facility)",
        )
        .all(),
    ),
  );
  app.get("/api/history", (req, res) =>
    res.json(
      db
        .prepare("select * from verification where facility=? order by id desc")
        .all(req.query.id || ""),
    ),
  );
  app.post("/api/reviews", faculty, (req, res) => {
    const { facility, status, evidence, notes, department } = req.body;
    if (
      !/^(node|way|relation)\/\d+$/.test(facility) ||
      !statuses.includes(status) ||
      typeof evidence !== "string" ||
      !evidence.trim() ||
      !["Unknown", "Confirmed operating", "Reported unavailable"].includes(
        department,
      ) ||
      typeof notes !== "string"
    )
      return res
        .status(400)
        .json({ error: "Provide a valid status and confirmation method." });
    db.prepare(
      "insert into verification(facility,status,evidence,notes,department) values(?,?,?,?,?)",
    ).run(facility, status, evidence, notes, department);
    res.json({ saved: true });
  });
}
