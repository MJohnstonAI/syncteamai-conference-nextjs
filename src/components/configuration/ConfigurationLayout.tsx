import type { ReactNode } from "react";

type ConfigurationLayoutProps = {
  children: ReactNode;
  sidebar: ReactNode;
};

export default function ConfigurationLayout({
  children,
  sidebar,
}: ConfigurationLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[1420px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 xl:px-10">
      <div className="grid gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-8">{children}</div>
        <aside className="min-w-0">{sidebar}</aside>
      </div>
    </div>
  );
}

