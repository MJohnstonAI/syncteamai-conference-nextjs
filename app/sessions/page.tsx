"use client";

import { Suspense } from "react";
import SessionsPage from "@/views/Sessions";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SessionsPage />
    </Suspense>
  );
}
