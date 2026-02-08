"use client";

import { Suspense } from "react";
import ResetPasswordPage from "@/views/ResetPassword";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}
