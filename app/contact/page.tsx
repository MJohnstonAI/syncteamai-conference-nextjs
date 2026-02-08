"use client";

import { Suspense } from "react";
import ContactPage from "@/views/Contact";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContactPage />
    </Suspense>
  );
}
