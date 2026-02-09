import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/views/Templates", () => ({
  default: () => <div data-testid="templates-mock-view">Browse Templates</div>,
}));

import Page from "./page";

describe("/templates route", () => {
  it("renders the templates page component", () => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain("Browse Templates");
    expect(html).not.toContain("404");
  });
});

