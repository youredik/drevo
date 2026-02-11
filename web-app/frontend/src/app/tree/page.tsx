"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  GitFork,
  ChevronDown,
  ChevronRight,
  Download,
  List,
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";
import { PersonSearchSelect } from "@/components/person-search-select";
import { SafeImage } from "@/components/safe-image";
import {
  type TreeNode,
  type PositionedNode,
  type Edge,
  NODE_W,
  NODE_H,
  layoutAncestors,
  layoutDescendants,
  collectEdges,
  getBounds,
} from "@/lib/tree-layout";

// ─── Graph node component ────────────────────────────────

function GraphNodeCard({ positioned }: { positioned: PositionedNode }) {
  const { node, x, y } = positioned;
  const router = useRouter();

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/person?id=${node.id}`)}
        onKeyDown={(e) => { if (e.key === "Enter") router.push(`/person?id=${node.id}`); }}
        className="absolute flex flex-col items-center gap-1 group cursor-pointer"
        style={{
          left: x,
          top: y,
          width: NODE_W,
          height: NODE_H,
        }}
      >
        <SafeImage
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
      </div>
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

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const zoomRef = useRef(1);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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

  // Scroll to center root node on load / tree change / fullscreen toggle
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      const rootCenterX = (positioned.x + NODE_W / 2) * zoomRef.current;
      const rootCenterY = (positioned.y + NODE_H / 2) * zoomRef.current;
      container.scrollLeft = rootCenterX - container.clientWidth / 2;
      container.scrollTop = rootCenterY - container.clientHeight / 2;
    });
  }, [positioned, fullscreen]);

  // Ctrl/Cmd + wheel zoom (keeps point under cursor stable)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const oldZoom = zoomRef.current;
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(oldZoom + delta).toFixed(2)));
        if (newZoom === oldZoom) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const canvasX = (container.scrollLeft + mouseX) / oldZoom;
        const canvasY = (container.scrollTop + mouseY) / oldZoom;

        zoomRef.current = newZoom;
        setZoom(newZoom);

        requestAnimationFrame(() => {
          container.scrollLeft = canvasX * newZoom - mouseX;
          container.scrollTop = canvasY * newZoom - mouseY;
        });
      }
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, []);

  // Pinch-to-zoom on touch devices
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let lastDist = 0;
    let pinching = false;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true;
        lastDist = getDistance(e.touches[0], e.touches[1]);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const delta = (dist - lastDist) * 0.005;
      lastDist = dist;

      const oldZoom = zoomRef.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(oldZoom + delta).toFixed(2)));
      if (newZoom === oldZoom) return;

      const rect = container.getBoundingClientRect();
      const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
      const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
      const canvasX = (container.scrollLeft + cx) / oldZoom;
      const canvasY = (container.scrollTop + cy) / oldZoom;

      zoomRef.current = newZoom;
      setZoom(newZoom);

      requestAnimationFrame(() => {
        container.scrollLeft = canvasX * newZoom - cx;
        container.scrollTop = canvasY * newZoom - cy;
      });
    };

    const onTouchEnd = () => { pinching = false; };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Escape to exit fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [fullscreen]);

  // Lock body scroll in fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [fullscreen]);

  const changeZoom = useCallback((delta: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const oldZoom = zoomRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(oldZoom + delta).toFixed(2)));
    if (newZoom === oldZoom) return;

    const centerX = container.scrollLeft + container.clientWidth / 2;
    const centerY = container.scrollTop + container.clientHeight / 2;
    const canvasX = centerX / oldZoom;
    const canvasY = centerY / oldZoom;

    zoomRef.current = newZoom;
    setZoom(newZoom);

    requestAnimationFrame(() => {
      container.scrollLeft = canvasX * newZoom - container.clientWidth / 2;
      container.scrollTop = canvasY * newZoom - container.clientHeight / 2;
    });
  }, []);

  const resetZoom = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const rootCenterX = positioned.x + NODE_W / 2;
      const rootCenterY = positioned.y + NODE_H / 2;
      container.scrollLeft = rootCenterX - container.clientWidth / 2;
      container.scrollTop = rootCenterY - container.clientHeight / 2;
    });
  }, [positioned]);

  const scaledW = canvasWidth * zoom;
  const scaledH = canvasHeight * zoom;

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-background flex flex-col" : "relative"}>
      <div
        ref={scrollRef}
        className={`overflow-auto bg-muted/20 ${
          fullscreen ? "flex-1" : "border rounded-xl max-h-[70vh]"
        }`}
      >
        <div style={{ width: scaledW, height: scaledH, minWidth: "100%", minHeight: fullscreen ? "100%" : 300 }}>
          <div
            ref={treeRef}
            className="relative"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
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
      </div>

      {/* Zoom & fullscreen controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border bg-card/90 backdrop-blur-sm p-1 shadow-lg z-10">
        <button
          onClick={() => changeZoom(-ZOOM_STEP)}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          title="Уменьшить"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={resetZoom}
          className="h-8 min-w-[3rem] flex items-center justify-center rounded-md hover:bg-muted transition-colors text-xs font-medium"
          title="Сбросить масштаб"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => changeZoom(ZOOM_STEP)}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          title="Увеличить"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          title={fullscreen ? "Свернуть" : "На весь экран"}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
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
          <SafeImage
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

  const handlePersonSelect = (id: number | undefined) => {
    if (id && id > 0) setPersonId(id);
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
        <div className="w-64">
          <PersonSearchSelect
            value={personId}
            onChange={handlePersonSelect}
            placeholder="Найти человека..."
          />
        </div>
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
