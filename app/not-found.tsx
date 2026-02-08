"use client";

import { Suspense } from "react";
import NotFoundPage from "@/views/NotFound";

export default function NotFound() {
  return (
    <Suspense fallback={null}>
      <NotFoundPage />
    </Suspense>
  );
}
