"use client";

import { Suspense } from "react";
import AuthPage from "@/views/Auth";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
