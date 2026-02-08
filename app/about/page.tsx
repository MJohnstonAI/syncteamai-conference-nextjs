"use client";

import { Suspense } from "react";
import AboutPage from "@/views/About";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AboutPage />
    </Suspense>
  );
}
