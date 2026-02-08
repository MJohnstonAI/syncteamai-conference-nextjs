"use client";

import { Suspense } from "react";
import SettingsPage from "@/views/Settings";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  );
}
