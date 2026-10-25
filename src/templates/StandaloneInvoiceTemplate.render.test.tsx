// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandaloneInvoiceTemplate } from "./StandaloneInvoiceTemplate";

describe("StandaloneInvoiceTemplate", () => {
  it("renders resolved invoice data without wrapper controls", () => {
    render(
      <StandaloneInvoiceTemplate
        data={{
          invoiceNumber: "1234",
          invoiceDate: "15-SEP-26",
          clientName: "Example Logistics",
          rows: [
            { description: "TRIP FROM: DUBAI TO RIYADH\n\nDRIVER NAME: Ahmed", unitPrice: 1200, amount: 1200 },
            { description: "FASAH", unitPrice: 75, amount: 75 },
          ],
        }}
      />,
    );

    expect(screen.getByRole("article", { name: "Tax invoice 1234" })).toBeTruthy();
    expect(screen.getByText("MR/MS Example Logistics")).toBeTruthy();
    expect(screen.getByText("1,275.00/-")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
