// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButton, ActionForm, AutoSwitch, SubmitButton, type ActionState } from "@/components/forms";
import { BarList, ColumnChart } from "@/components/charts";
import { FaqList } from "@/components/faq";
import { Avatar, DemoBadge, EmptyState, Meter, PageHeader, SimulatedBadge, timeAgo } from "@/components/ui";

afterEach(cleanup);

describe("design system primitives", () => {
  it("renders a page header with one h1", () => {
    render(<PageHeader eyebrow="Discover" title="People worth meeting" description="Why" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("People worth meeting");
  });

  it("labels fictional members and simulated AI explicitly", () => {
    render(
      <>
        <DemoBadge />
        <SimulatedBadge />
      </>,
    );
    expect(screen.getByText("Fictional demo member")).toBeInTheDocument();
    expect(screen.getByText("Simulated AI")).toBeInTheDocument();
  });

  it("exposes meters accessibly and clamps their value", () => {
    render(<Meter label="Shared interests" value={1.7} tone="lavender" />);
    const meter = screen.getByRole("meter", { name: "Shared interests" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
  });

  it("draws a decorative avatar from the member's initial", () => {
    const { container } = render(<Avatar name="priya" hue={150} />);
    expect(container.firstChild).toHaveTextContent("P");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders empty states with their call to action", () => {
    render(<EmptyState title="No connections yet" body="Soon" action={<a href="/discover">Discover</a>} />);
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
  });

  it("formats relative time", () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("3 hours ago");
    expect(timeAgo(new Date(Date.now() + 2 * 86400_000).toISOString())).toMatch(/in 2 days|the day after tomorrow/);
  });

  it("lists frequently asked questions as disclosure widgets", () => {
    const { container } = render(<FaqList />);
    expect(container.querySelectorAll("details").length).toBeGreaterThan(5);
  });
});

describe("charts", () => {
  const data = [
    { day: "2026-11-01", n: 2 },
    { day: "2026-11-02", n: 0 },
    { day: "2026-11-03", n: 5 },
  ];

  it("gives column charts a text alternative, hover titles and a table view", () => {
    const { container } = render(<ColumnChart title="New members" data={data} unit="sign-ups" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/New members: 7 sign-ups/);
    expect(container.querySelectorAll("svg title").length).toBe(3);
    expect(container.querySelectorAll("tbody tr").length).toBe(3);
    expect(container.querySelectorAll("svg path").length).toBe(2); // zero days draw no bar
  });

  it("renders bar lists with direct labels and an empty state", () => {
    render(<BarList title="Journey" data={[{ label: "Joined", n: 10 }, { label: "Connected", n: 4 }]} showShare />);
    expect(screen.getByText("40%")).toBeInTheDocument();
    cleanup();
    render(<BarList title="Empty" data={[]} />);
    expect(screen.getByText("No data yet.")).toBeInTheDocument();
  });
});

describe("forms wired to server actions", () => {
  it("shows the action's error to the member", async () => {
    const action = vi.fn(async (): Promise<ActionState> => ({ error: "That email and password don't match." }));
    render(
      <ActionForm action={action}>
        <input name="email" aria-label="Email" defaultValue="a@b.c" />
        <SubmitButton>Sign in</SubmitButton>
      </ActionForm>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
    expect((action.mock.calls[0] as unknown as [ActionState, FormData])[1].get("email")).toBe("a@b.c");
  });

  it("shows success messages and submits hidden fields from action buttons", async () => {
    const action = vi.fn(async (_: ActionState, f: FormData): Promise<ActionState> => ({ ok: true, message: `Done ${f.get("id")}` }));
    render(
      <ActionButton action={action} fields={{ id: "42" }}>
        Run
      </ActionButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Done 42");
  });

  it("asks for confirmation before destructive actions", async () => {
    const action = vi.fn(async (): Promise<ActionState> => ({ ok: true }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ActionButton action={action} confirm="Really?">
        Delete
      </ActionButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Really?");
    expect(action).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("submits a consent switch with its new value", async () => {
    const action = vi.fn(async (): Promise<ActionState> => ({ ok: true }));
    render(<AutoSwitch action={action} fields={{ key: "matching_enabled" }} checked={false} label="Let my companion look for connections" />);
    const sw = screen.getByRole("switch", { name: "Let my companion look for connections" });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = (action.mock.calls[0] as unknown as [ActionState, FormData])[1];
    expect(fd.get("key")).toBe("matching_enabled");
    expect(fd.get("value")).toBe("true");
  });
});
