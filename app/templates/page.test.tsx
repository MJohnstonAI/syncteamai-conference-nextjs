import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/views/Templates", () => ({
  default: () => (
    <div data-testid="templates-mock-view">
      <h1>Browse Templates</h1>
      <p>Choose a template to configure your AI panel</p>
    </div>
  ),
}));

import Page from "./page";

describe("/templates route", () => {
  it("renders the templates page component", () => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain("Browse Templates");
    expect(html).toContain("Choose a template to configure your AI panel");
    expect(html).not.toContain("404");
  });
});
