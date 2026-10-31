import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readBackupXlsx } from "./backup";

describe("backup import", () => {
  it("restores json columns as objects, not text", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["id", "charges"], ["a", '[{"kind":"add","amount":5}]']]), "documents");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = { arrayBuffer: async () => buf } as unknown as File;
    const data = await readBackupXlsx(file);
    expect(data["documents"]![0]!["charges"]).toEqual([{ kind: "add", amount: 5 }]);
  });
});
