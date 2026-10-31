import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));

afterEach(cleanup);

function Fixture() {
  const [open, setOpen] = React.useState(true);
  const [value, setValue] = React.useState("");
  const [count, setCount] = React.useState(0);
  return <>
    <button onClick={() => setCount((n) => n + 1)}>الخلفية {count}</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>بطاقة اختبار</DialogTitle>
        <DialogDescription>اختبار التفاعل</DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); setCount((n) => n + 1); }}>
          <input aria-label="الاسم" value={value} onChange={(event) => setValue(event.target.value)} />
          <button type="submit">حفظ</button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

describe("Dialog minimize and restore", () => {
  it("preserves input and allows interaction through repeated restore cycles", async () => {
    render(<Fixture />);
    const input = screen.getByRole("textbox", { name: "الاسم" });
    fireEvent.change(input, { target: { value: "مسودة محفوظة" } });
    for (let cycle = 0; cycle < 3; cycle++) {
      fireEvent.click(screen.getByRole("button", { name: "تصغير النافذة" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "استعادة" })).toHaveFocus());
      fireEvent.click(screen.getByRole("button", { name: `الخلفية ${cycle}` }));
      fireEvent.click(screen.getByRole("button", { name: "استعادة" }));
      await waitFor(() => expect(input).toHaveFocus());
      expect(input).toHaveValue("مسودة محفوظة");
    }
    fireEvent.change(input, { target: { value: "بعد الاستعادة" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    expect(screen.getByRole("button", { name: "الخلفية 4", hidden: true })).toBeInTheDocument();
    expect(input).toHaveValue("بعد الاستعادة");
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});