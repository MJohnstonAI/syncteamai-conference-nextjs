import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/views/Configure", () => ({
  default: () => (
    <div data-testid="configure-mock-view">
      <h1>Configure AI Panel</h1>
      <p>Review challenge summary and launch conference</p>
    </div>
  ),
}));

import Page from "./page";

describe("/configure route", () => {
  it("renders the configure page component", () => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain("Configure AI Panel");
    expect(html).toContain("Review challenge summary and launch conference");
    expect(html).not.toContain("404");
  });
});

