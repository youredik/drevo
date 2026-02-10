"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { GitFork, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";

interface TreeNode {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  isAlive: boolean;
  photo: string;
  children: TreeNode[];
}

export default function TreePage() {
  return <Suspense><TreeContent /></Suspense>;
}

function TreeContent() {
  const searchParams = useSearchParams();
  const initialId = Number(searchParams.get("id")) || 7;
  const [personId, setPersonId] = useState(initialId);
  const [inputId, setInputId] = useState(String(initialId));
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [treeType, setTreeType] = useState<"ancestors" | "descendants">("ancestors");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getTree(personId, treeType)
      .then(setTree)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [personId, treeType]);

  const handleIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(inputId);
    if (id > 0) setPersonId(id);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Дерево поколений</h1>
        <form onSubmit={handleIdSubmit} className="flex gap-2">
          <Input
            type="number"
            placeholder="ID человека"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            className="w-32"
          />
          <Button type="submit" variant="outline">Показать</Button>
        </form>
      </div>

      <Tabs value={treeType} onValueChange={(v) => setTreeType(v as any)} className="mb-6">
        <TabsList>
          <TabsTrigger value="ancestors">Предки</TabsTrigger>
          <TabsTrigger value="descendants">Потомки</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !tree ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GitFork className="h-12 w-12 mx-auto mb-3 opacity-30" />
            Человек не найден
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <TreeNodeComponent node={tree} depth={0} />
        </div>
      )}
    </div>
  );
}

function TreeNodeComponent({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;

  return (
    <div className="ml-0" style={{ marginLeft: depth > 0 ? "1.5rem" : 0 }}>
      <div className="flex items-center gap-2 py-1">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="h-6 w-6 shrink-0" />
        )}

        <Link href={`/person?id=${node.id}`} className="flex items-center gap-2 hover:bg-muted/50 rounded-lg px-2 py-1 transition-colors">
          <img
            src={mediaUrl(node.photo)}
            alt=""
            className={`h-8 w-8 rounded-full object-cover shrink-0 ring-2 ${
              node.isAlive ? "ring-emerald-400" : "ring-red-400"
            }`}
          />
          <span className="text-sm font-medium whitespace-nowrap">
            {node.lastName} {node.firstName}
          </span>
          <span className="text-xs text-muted-foreground">#{node.id}</span>
        </Link>
      </div>

      {expanded && hasChildren && (
        <div className="border-l border-border/50 ml-3">
          {node.children.map((child) => (
            <TreeNodeComponent key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
