/* Database maintenance: `tsx scripts/db.ts migrate|seed|reset`. */
import fs from "node:fs";
import { getDb } from "../src/lib/db";

async function main() {
  const cmd = process.argv[2];
  const file = process.env.DATABASE_FILE ?? "./data/belong.db";
  if (cmd === "reset") {
    if (process.env.DATABASE_URL) throw new Error("Refusing to reset a PostgreSQL database. Reset is for the local SQLite file only.");
    for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
    console.log(`Removed ${file}`);
  }
  if (cmd === "migrate") process.env.BELONG_DEMO_MODE = "false";
  if (!["migrate", "seed", "reset", "make-admin"].includes(cmd ?? "")) {
    console.log("Usage: tsx scripts/db.ts migrate|seed|reset|make-admin <email>");
    process.exit(1);
  }
  const db = await getDb(); // migrates, and seeds demo data when demo mode is on and the database is empty
  if (cmd === "make-admin") {
    const email = (process.argv[3] ?? "").trim().toLowerCase();
    const user = await db.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
    if (!user) throw new Error(`No account with email "${email}". Register it in the app first.`);
    await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
    console.log(`${email} is now an administrator.`);
  }
  const users = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  console.log(`Database ready (${db.dialect}). Users: ${Number(users?.n)}.`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
