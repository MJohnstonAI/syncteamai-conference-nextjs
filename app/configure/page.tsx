"use client";

import { Suspense } from "react";
import ConfigurePage from "@/views/Configure";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConfigurePage />
    </Suspense>
  );
}

