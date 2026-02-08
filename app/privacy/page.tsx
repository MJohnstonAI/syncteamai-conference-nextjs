"use client";

import { Suspense } from "react";
import PrivacyPage from "@/views/Privacy";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PrivacyPage />
    </Suspense>
  );
}
