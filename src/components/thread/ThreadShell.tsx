import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function ThreadShell({
  iconRail,
  priorityCard,
  leftSidebar,
  centerColumn,
  rightSidebar,
}: {
  iconRail?: React.ReactNode;
  priorityCard?: React.ReactNode;
  leftSidebar: React.ReactNode;
  centerColumn: React.ReactNode;
  rightSidebar: React.ReactNode;
}) {
  const desktopGridColumns = iconRail
    ? "lg:grid-cols-[64px_280px_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[280px_minmax(0,1fr)_320px]";

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <PanelLeftOpen className="h-4 w-4" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] p-0 sm:max-w-md">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Conference Controls</SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100%-56px)] overflow-y-auto p-4">{leftSidebar}</div>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <PanelRightOpen className="h-4 w-4" />
              Context
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[88vw] p-0 sm:max-w-md">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Message Context</SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100%-56px)] overflow-y-auto p-4">{rightSidebar}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className={`min-h-0 flex-1 lg:grid ${desktopGridColumns}`}>
        {iconRail ? (
          <aside className="hidden min-h-0 border-r lg:block">{iconRail}</aside>
        ) : null}

        <aside className="hidden min-h-0 border-r bg-muted/20 lg:block">
          <div className="h-full overflow-y-auto p-4">{leftSidebar}</div>
        </aside>

        <main className="min-h-0 flex flex-col">
          {priorityCard ? (
            <div className="border-b bg-background/95 px-4 py-3 backdrop-blur">{priorityCard}</div>
          ) : null}
          <div className="min-h-0 flex-1">{centerColumn}</div>
        </main>

        <aside className="hidden min-h-0 border-l bg-muted/20 lg:block">
          <div className="h-full overflow-y-auto p-4">{rightSidebar}</div>
        </aside>
      </div>
    </div>
  );
}
