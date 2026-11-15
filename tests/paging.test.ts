import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { now, PAGE_SIZE, pageOf, pageParams, uid } from "@/lib/db";
import { introductionStats, listAudit, listUsers } from "@/lib/services/admin";
import { requestIntroduction, respondToIntroduction } from "@/lib/services/introductions";
import { getMessages, listConversations, markRead, sendMessage } from "@/lib/services/messaging";
import { listMatches, runNetwork } from "@/lib/services/network";
import { createCircle, joinCircle, getCircle } from "@/lib/services/circles";

describe("paging helpers", () => {
  it("fetch one extra row to know whether there's a next page", () => {
    expect(pageParams(1)).toEqual([PAGE_SIZE + 1, 0]);
    expect(pageParams(3)).toEqual([PAGE_SIZE + 1, 2 * PAGE_SIZE]);
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i);
    expect(pageOf(rows, 1)).toMatchObject({ page: 1, hasNext: true });
    expect(pageOf(rows, 1).rows).toHaveLength(PAGE_SIZE);
    expect(pageOf([1, 2], 2)).toEqual({ rows: [1, 2], page: 2, hasNext: false });
  });
});

describe("admin tables are paged", () => {
  it(
    "pages through the audit log without gaps or repeats",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      await db.run("DELETE FROM audit_log");
      const base = Date.now();
      for (let i = 0; i < 120; i++) {
        await db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, NULL, ?, NULL, NULL, '{}', ?)", [uid(), `test.${i}`, new Date(base - i * 1000).toISOString()]);
      }
      const seen: string[] = [];
      let page = 1;
      for (;;) {
        const p = await listAudit(admin, page);
        seen.push(...p.rows.map((r) => r.action));
        if (!p.hasNext) break;
        page++;
      }
      expect(page).toBe(3);
      expect(seen).toHaveLength(120);
      expect(new Set(seen).size).toBe(120);
      expect(seen[0]).toBe("test.0"); // newest first
    }),
  );

  it(
    "keeps the member search while paging, and counts introductions across all pages",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      await makeMember("Findme One");
      await makeMember("Someone Else");
      const found = await listUsers(admin, "findme");
      expect(found.rows.map((u) => u.name)).toEqual(["Findme One"]);
      expect(found.hasNext).toBe(false);
      expect(await introductionStats(admin)).toEqual({});
    }),
  );
});

describe("conversations", () => {
  it(
    "summarise last message and unread counts per conversation correctly",
    inDb(async () => {
      const opts = { interests: ["hiking", "coffee"], postcode: "BS3" };
      const me = await makeMember("Me", opts);
      const a = await makeMember("Aya", opts);
      const b = await makeMember("Bo", opts);
      await runNetwork();
      const convFor = async (other: string) => {
        const m = (await listMatches(me)).find((x) => x.member.id === other)!;
        return (await respondToIntroduction(other, await requestIntroduction(me, m.id), "approved")).conversationId!;
      };
      const ca = await convFor(a);
      const cb = await convFor(b);
      await sendMessage(a, ca, "one");
      await sendMessage(a, ca, "two");
      await sendMessage(b, cb, "hello");
      await markRead(me, cb);
      const circle = await createCircle(a, { name: "Walk", topic: "hiking", capacity: 4 });
      await joinCircle(me, circle);
      await new Promise((r) => setTimeout(r, 5)); // timestamps are millisecond-precise
      await sendMessage(a, (await getCircle(a, circle))!.conversationId!, "circle news");
      const list = await listConversations(me);
      const by = (id: string) => list.find((c) => c.id === id)!;
      expect(by(ca)).toMatchObject({ lastMessage: "two", unread: 2 });
      expect(by(cb)).toMatchObject({ lastMessage: "hello", unread: 0 });
      expect(list.find((c) => c.kind === "circle")).toMatchObject({ lastMessage: "circle news", unread: 1 });
      expect(list[0].lastMessage).toBe("circle news"); // most recent first
    }),
  );

  it(
    "load the most recent messages first and say when there are earlier ones",
    inDb(async (db) => {
      const opts = { interests: ["hiking", "coffee"], postcode: "BS3" };
      const me = await makeMember("Me", opts);
      const them = await makeMember("Them", opts);
      await runNetwork();
      const m = (await listMatches(me))[0];
      const conv = (await respondToIntroduction(them, await requestIntroduction(me, m.id), "approved")).conversationId!;
      const start = Date.now() - 200000;
      for (let i = 0; i < 130; i++) {
        await db.run("INSERT INTO messages (id, conversation_id, sender_id, content, simulated, created_at) VALUES (?, ?, ?, ?, 0, ?)", [uid(), conv, me, `m${i}`, new Date(start + i * 1000).toISOString()]);
      }
      const recent = await getMessages(me, conv);
      expect(recent.messages).toHaveLength(100);
      expect(recent.hasEarlier).toBe(true);
      expect(recent.messages[0].content).toBe("m30");
      expect(recent.messages.at(-1)!.content).toBe("m129");
      const all = await getMessages(me, conv, 200);
      expect(all.messages).toHaveLength(130);
      expect(all.hasEarlier).toBe(false);
      expect(now() > all.messages[0].createdAt).toBe(true);
    }),
  );
});
