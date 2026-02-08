import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RootPost } from "@/lib/thread/types";

export function RootPostCard({
  post,
  commentCount,
}: {
  post: RootPost;
  commentCount: number;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">{post.title}</CardTitle>
          <Badge variant="secondary" className="shrink-0">
            Root Post
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {post.topic?.trim() || "No explicit prompt was stored for this conference."}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{new Date(post.createdAt).toLocaleString()}</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquareText className="h-3.5 w-3.5" />
            {commentCount} comments
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
