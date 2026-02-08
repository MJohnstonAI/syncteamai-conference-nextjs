"use client";

import { Suspense } from "react";
import ConferencePage from "@/views/Conference";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConferencePage />
    </Suspense>
  );
}
