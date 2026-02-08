"use client";

import { Suspense } from "react";
import SubscribePage from "@/views/Subscribe";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SubscribePage />
    </Suspense>
  );
}
