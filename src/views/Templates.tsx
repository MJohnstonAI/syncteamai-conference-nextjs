import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "@/lib/router";
import { DemoBanner } from "@/components/DemoBanner";
import { Toolbar } from "@/components/Toolbar";
import { TemplateCard } from "@/components/TemplateCard";
import { Pagination } from "@/components/Pagination";
import { Footer } from "@/components/Footer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HomeIcon } from "@/components/HomeIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { TemplateDialog } from "@/components/TemplateDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useGroups } from "@/hooks/useGroups";
import { usePrompts } from "@/hooks/usePrompts";
import { useToast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 6;

const Templates = () => {
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const { data: groups, isLoading: groupsLoading } = useGroups();
  const { data: prompts, isLoading: promptsLoading } = usePrompts();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedGroup, setSelectedGroup] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscribed") === "true") {
      toast({
        title: "Welcome to Professional!",
        description: "Your subscription is active. Enjoy all premium features!",
      });
      window.history.replaceState({}, "", "/templates");
    }
  }, [toast]);

  const filteredPrompts = useMemo(() => {
    if (!prompts) return [];

    return prompts.filter((prompt) => {
      const matchesGroup = selectedGroup === "all" || prompt.group_id === selectedGroup;
      const matchesSearch =
        searchQuery === "" ||
        prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (prompt.description?.toLowerCase() || "").includes(searchQuery.toLowerCase());
      return matchesGroup && matchesSearch;
    });
  }, [prompts, selectedGroup, searchQuery]);

  const totalPages = Math.ceil(filteredPrompts.length / ITEMS_PER_PAGE);
  const paginatedPrompts = filteredPrompts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const allGroups = useMemo(() => groups ?? [], [groups]);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-6 left-6 z-50">
        <HomeIcon />
      </div>

      {user && (
        <div className="fixed top-6 right-6 z-50">
          {role === 'paid' || role === 'admin' || role === 'free' ? (
            <Button 
              variant="ghost" 
              size="sm"
              disabled={role === 'paid' || role === 'free'}
              onClick={() => {
                if (role === 'admin') {
                  // Admin can test PayPal flow
                  navigate('/subscribe');
                } else {
                  toast({
                    title: "Already Subscribed",
                    description: role === 'free'
                      ? "You're on a complimentary SyncTeamAI plan."
                      : "You're already on the paid plan.",
                  });
                }
              }}
              className={cn((role === 'paid' || role === 'free') && "opacity-50")}
            >
              Subscribed
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth?action=subscribe")}>
              Upgrade to Pro $20/mo
            </Button>
          )}
        </div>
      )}

      <div className="flex h-screen">
        <aside className="w-64 border-r bg-muted/30">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-lg">Groups</h2>
          </div>
          <ScrollArea className="h-[calc(100vh-73px)]">
            <div className="p-2">
              <button
                onClick={() => {
                  setSelectedGroup("all");
                  setCurrentPage(1);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                  selectedGroup === "all"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-muted"
                )}
              >
                All Groups
              </button>
              {groupsLoading ? (
                <>
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full mb-2" />
                  ))}
                </>
              ) : (
                allGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      setSelectedGroup(group.id);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      selectedGroup === group.id
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-muted"
                    )}
                  >
                    {group.name}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-6 py-8">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-2">Templates</h1>
              <p className="text-muted-foreground">Choose a template to start your AI conference</p>
            </div>

            {!user && <DemoBanner />}

              <Toolbar
                selectedGroup={selectedGroup}
                onGroupChange={(group) => {
                  setSelectedGroup(group);
                  setCurrentPage(1);
                }}
                searchQuery={searchQuery}
                onSearchChange={(query) => {
                  setSearchQuery(query);
                  setCurrentPage(1);
                }}
                groups={allGroups}
                userRole={role}
                onCreateClick={() => setCreateDialogOpen(true)}
              />

            <TemplateDialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
              groups={allGroups}
              userRole={role}
            />

            {promptsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedPrompts.map((prompt) => (
                    <TemplateCard 
                      key={prompt.id} 
                      prompt={prompt} 
                      userRole={role}
                      groups={allGroups}
                    />
                  ))}
                </div>

                {filteredPrompts.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No templates found matching your criteria.</p>
                  </div>
                )}
              </>
            )}

            {totalPages > 1 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            )}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
};

export default Templates;

