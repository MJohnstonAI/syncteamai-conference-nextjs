"use client";

import { Suspense } from "react";
import IndexPage from "@/views/Index";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <IndexPage />
    </Suspense>
  );
}
