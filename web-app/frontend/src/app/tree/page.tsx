"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  GitFork,
  ChevronDown,
  ChevronRight,
  Download,
  List,
  Network,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────

interface TreeNode {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  isAlive: boolean;
  photo: string;
  children: TreeNode[];
}

interface PositionedNode {
  node: TreeNode;
  x: number;
  y: number;
  children: PositionedNode[];
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ─── Layout constants ────────────────────────────────────

const NODE_W = 80;
const NODE_H = 88;

const ANCESTOR_COL_GAP = 200;
const ANCESTOR_ROW_GAP = 100;

const DESCENDANT_COL_GAP = 120;
const DESCENDANT_ROW_GAP = 140;

// ─── Layout helpers ──────────────────────────────────────

/**
 * Ancestors layout: horizontal, root on the left, parents to the right.
 * Returns a PositionedNode tree and the total height consumed.
 */
function layoutAncestors(
  node: TreeNode,
  depth: number,
  yOffset: number
): { positioned: PositionedNode; height: number } {
  const x = depth * ANCESTOR_COL_GAP + 40;

  if (node.children.length === 0) {
    const y = yOffset;
    return {
      positioned: { node, x, y, children: [] },
      height: NODE_H + ANCESTOR_ROW_GAP,
    };
  }

  let currentY = yOffset;
  const childPositions: PositionedNode[] = [];
  let totalHeight = 0;

  for (const child of node.children) {
    const result = layoutAncestors(child, depth + 1, currentY);
    childPositions.push(result.positioned);
    currentY += result.height;
    totalHeight += result.height;
  }

  // Center parent vertically relative to children
  const firstChildY = childPositions[0].y;
  const lastChildY = childPositions[childPositions.length - 1].y;
  const y = (firstChildY + lastChildY) / 2;

  return {
    positioned: { node, x, y, children: childPositions },
    height: totalHeight,
  };
}

/**
 * Descendants layout: vertical, root on top, children below.
 * Returns a PositionedNode tree and the total width consumed.
 */
function layoutDescendants(
  node: TreeNode,
  depth: number,
  xOffset: number
): { positioned: PositionedNode; width: number } {
  const y = depth * DESCENDANT_ROW_GAP + 40;

  if (node.children.length === 0) {
    const x = xOffset;
    return {
      positioned: { node, x, y, children: [] },
      width: NODE_W + DESCENDANT_COL_GAP,
    };
  }

  let currentX = xOffset;
  const childPositions: PositionedNode[] = [];
  let totalWidth = 0;

  for (const child of node.children) {
    const result = layoutDescendants(child, depth + 1, currentX);
    childPositions.push(result.positioned);
    currentX += result.width;
    totalWidth += result.width;
  }

  // Center parent horizontally relative to children
  const firstChildX = childPositions[0].x;
  const lastChildX = childPositions[childPositions.length - 1].x;
  const x = (firstChildX + lastChildX) / 2;

  return {
    positioned: { node, x, y, children: childPositions },
    width: totalWidth,
  };
}

// ─── Edge collection ─────────────────────────────────────

function collectEdges(
  positioned: PositionedNode,
  direction: "horizontal" | "vertical"
): Edge[] {
  const edges: Edge[] = [];
  const halfW = NODE_W / 2;
  const halfH = NODE_H / 2;

  for (const child of positioned.children) {
    if (direction === "horizontal") {
      // parent right edge -> child left edge
      edges.push({
        x1: positioned.x + halfW,
        y1: positioned.y + halfH,
        x2: child.x,
        y2: child.y + halfH,
      });
    } else {
      // parent bottom edge -> child top edge
      edges.push({
        x1: positioned.x + halfW,
        y1: positioned.y + NODE_H,
        x2: child.x + halfW,
        y2: child.y,
      });
    }
    edges.push(...collectEdges(child, direction));
  }

  return edges;
}

// ─── Bounding box ────────────────────────────────────────

function getBounds(positioned: PositionedNode): {
  maxX: number;
  maxY: number;
} {
  let maxX = positioned.x + NODE_W;
  let maxY = positioned.y + NODE_H;

  for (const child of positioned.children) {
    const childBounds = getBounds(child);
    maxX = Math.max(maxX, childBounds.maxX);
    maxY = Math.max(maxY, childBounds.maxY);
  }

  return { maxX, maxY };
}

// ─── Graph node component ────────────────────────────────

function GraphNodeCard({ positioned }: { positioned: PositionedNode }) {
  const { node, x, y } = positioned;

  return (
    <>
      <Link
        href={`/person?id=${node.id}`}
        prefetch={false}
        className="absolute flex flex-col items-center gap-1 group"
        style={{
          left: x,
          top: y,
          width: NODE_W,
          height: NODE_H,
        }}
      >
        <img
          src={mediaUrl(node.photo)}
          alt={node.firstName + ' ' + node.lastName}
          loading="lazy"
          className={`h-12 w-12 rounded-full object-cover shrink-0 ring-2 transition-transform group-hover:scale-110 ${
            node.isAlive ? "ring-emerald-400" : "ring-red-400"
          }`}
        />
        <span className="text-[11px] font-medium leading-tight text-center max-w-[80px] truncate">
          {node.firstName}
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight text-center max-w-[80px] truncate">
          {node.lastName}
        </span>
      </Link>
      {positioned.children.map((child) => (
        <GraphNodeCard key={child.node.id} positioned={child} />
      ))}
    </>
  );
}

// ─── SVG edges ───────────────────────────────────────────

function SvgEdges({
  edges,
  direction,
  width,
  height,
}: {
  edges: Edge[];
  direction: "horizontal" | "vertical";
  width: number;
  height: number;
}) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
    >
      {edges.map((edge, i) => {
        let d: string;
        if (direction === "horizontal") {
          const cx = (edge.x1 + edge.x2) / 2;
          d = `M ${edge.x1} ${edge.y1} Q ${cx} ${edge.y1} ${cx} ${(edge.y1 + edge.y2) / 2} Q ${cx} ${edge.y2} ${edge.x2} ${edge.y2}`;
        } else {
          const cy = (edge.y1 + edge.y2) / 2;
          d = `M ${edge.x1} ${edge.y1} Q ${edge.x1} ${cy} ${(edge.x1 + edge.x2) / 2} ${cy} Q ${edge.x2} ${cy} ${edge.x2} ${edge.y2}`;
        }
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            className="text-border"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// ─── Visual graph view ───────────────────────────────────

function GraphView({
  tree,
  treeType,
  treeRef,
}: {
  tree: TreeNode;
  treeType: "ancestors" | "descendants";
  treeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isAncestors = treeType === "ancestors";
  const direction = isAncestors ? "horizontal" : "vertical";

  const { positioned, canvasWidth, canvasHeight, edges } = useMemo(() => {
    let positioned: PositionedNode;

    if (isAncestors) {
      const result = layoutAncestors(tree, 0, 40);
      positioned = result.positioned;
    } else {
      const result = layoutDescendants(tree, 0, 40);
      positioned = result.positioned;
    }

    const bounds = getBounds(positioned);
    const canvasWidth = bounds.maxX + 80;
    const canvasHeight = bounds.maxY + 80;
    const edges = collectEdges(positioned, direction);

    return { positioned, canvasWidth, canvasHeight, edges };
  }, [tree, isAncestors, direction]);

  return (
    <div className="border rounded-xl overflow-auto max-h-[70vh] bg-muted/20">
      <div
        ref={treeRef}
        className="relative"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          minWidth: "100%",
          minHeight: 300,
        }}
      >
        <SvgEdges
          edges={edges}
          direction={direction}
          width={canvasWidth}
          height={canvasHeight}
        />
        <GraphNodeCard positioned={positioned} />
      </div>
    </div>
  );
}

// ─── Text list node (existing) ───────────────────────────

function TreeNodeComponent({
  node,
  depth,
}: {
  node: TreeNode;
  depth: number;
}) {
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

        <Link
          href={`/person?id=${node.id}`}
          prefetch={false}
          className="flex items-center gap-2 hover:bg-muted/50 rounded-lg px-2 py-1 transition-colors"
        >
          <img
            src={mediaUrl(node.photo)}
            alt={node.firstName + ' ' + node.lastName}
            loading="lazy"
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

// ─── Main page content ───────────────────────────────────

export default function TreePage() {
  return (
    <Suspense>
      <TreeContent />
    </Suspense>
  );
}

function TreeContent() {
  const searchParams = useSearchParams();
  const initialId = Number(searchParams.get("id")) || 7;

  const [personId, setPersonId] = useState(initialId);
  const [inputId, setInputId] = useState(String(initialId));
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [treeType, setTreeType] = useState<"ancestors" | "descendants">(
    "ancestors"
  );
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [loading, setLoading] = useState(true);

  const treeRef = useRef<HTMLDivElement>(null);

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

  const exportPng = useCallback(async () => {
    if (!treeRef.current) return;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(treeRef.current, {
      backgroundColor: null,
      useCORS: true,
    });
    const link = document.createElement("a");
    link.download = `drevo-${personId}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, [personId]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
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
          <Button type="submit" variant="outline">
            Показать
          </Button>
        </form>
      </div>

      {/* Tabs: tree type + view mode toggle + export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <Tabs
          value={treeType}
          onValueChange={(v) => setTreeType(v as "ancestors" | "descendants")}
        >
          <TabsList>
            <TabsTrigger value="ancestors">Предки</TabsTrigger>
            <TabsTrigger value="descendants">Потомки</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border bg-card p-1 gap-1">
            <button
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <List className="h-4 w-4" />
              Список
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "graph"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Network className="h-4 w-4" />
              Граф
            </button>
          </div>

          {viewMode === "graph" && tree && !loading && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportPng}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export PNG</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : !tree ? (
        <Card className="glass">
          <CardContent className="py-16 text-center text-muted-foreground">
            <GitFork className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-1">Человек не найден</p>
            <p className="text-sm">Проверьте ID и попробуйте снова</p>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <TreeNodeComponent node={tree} depth={0} />
        </div>
      ) : (
        <GraphView tree={tree} treeType={treeType} treeRef={treeRef} />
      )}
    </div>
  );
}
