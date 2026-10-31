import { describe, expect, it } from "vitest";
import { closingResolver } from "./closing-path";
const closing = { id: "final", name: "ختامي مخصص", nature: "closing", parent_id: null, closing_account_id: null, closing_type: null, is_group: false };
const leaf = { ...closing, id: "expense", nature: "expenses", closing_account_id: "final" };
describe("closing report links", () => {
  it("resolves a closing account without legacy closing_type", () => {
    expect(closingResolver([closing, leaf]).closingOf(leaf)).toEqual({ type: "profit_loss", closingId: "final" });
  });
  it("uses the selected balance sheet link", () => {
    expect(closingResolver([closing, leaf], { balance_sheet: "final" }).closingOf(leaf)).toEqual({ type: "balance_sheet", closingId: "final" });
  });
  it("inherits a closing classification through its parent", () => {
    const parent = { ...closing, id: "parent", is_group: true, closing_type: "trading" };
    expect(closingResolver([parent, { ...closing, parent_id: "parent" }]).typeOf({ ...closing, parent_id: "parent" })).toBe("trading");
  });
});