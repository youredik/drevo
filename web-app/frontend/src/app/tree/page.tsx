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
  Printer,
  Scan,
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
import { useData } from "@/lib/data-context";
import { PersonSearchSelect } from "@/components/person-search-select";
import { SafeImage } from "@/components/safe-image";
import {
  type TreeNode,
  type PositionedNode,
  type Edge,
  type EdgeDirection,
  NODE_W,
  NODE_H,
  PHOTO_CENTER_Y,
  layoutAncestors,
  layoutAncestorsVertical,
  layoutDescendants,
  collectEdges,
  getBounds,
  getMinBounds,
  getTreeDepth,
  shiftPositioned,
} from "@/lib/tree-layout";

function countTreeNodes(node: TreeNode): number {
  let n = 1;
  for (const c of node.children) n += countTreeNodes(c);
  return n;
}

type TreeType = "ancestors" | "descendants" | "combined";

// ─── Age calculation ─────────────────────────────────────

function parseDate(s: string): Date | null {
  if (!s) return null;
  const parts = s.split(".");
  if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]);
  if (parts.length === 1 && /^\d{4}$/.test(s)) return new Date(+s, 0, 1);
  return null;
}

function calcAge(birthDay: string, deathDay: string, isAlive: boolean): string {
  const birth = parseDate(birthDay);
  if (!birth) return "";
  const end = isAlive ? new Date() : parseDate(deathDay);
  if (!end) return "";

  let years = end.getFullYear() - birth.getFullYear();
  let months = end.getMonth() - birth.getMonth();
  let days = end.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    const prev = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prev.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}${yearSuffix(years)}`);
  if (months > 0) parts.push(`${months}м`);
  if (days > 0) parts.push(`${days}д`);
  return parts.join(" ") || "0д";
}

function yearSuffix(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return "л";
  if (last >= 1 && last <= 4) return "г";
  return "л";
}

// ─── Graph node component ────────────────────────────────

function GraphNodeCard({
  positioned,
  treeType,
  compact,
  isDark,
  router,
}: {
  positioned: PositionedNode;
  treeType: TreeType;
  compact: boolean;
  isDark: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const { node, x, y } = positioned;
  const age = calcAge(node.birthDay, node.deathDay, node.isAlive);
  const nameLabel =
    compact || treeType !== "ancestors" ? node.firstName : `${node.lastName} ${node.firstName}`;
  const nameColor = isDark ? "#f5f5f5" : "#171717";
  const ageColor = node.isAlive
    ? isDark ? "#6ee7b7" : "#047857"
    : isDark ? "#fca5a5" : "#b91c1c";

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/person?id=${node.id}`)}
        onKeyDown={(e) => { if (e.key === "Enter") router.push(`/person?id=${node.id}`); }}
        className="absolute flex flex-col items-center gap-0.5 group cursor-pointer"
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
          className={`h-10 w-10 object-cover shrink-0 ring-2 transition-transform group-hover:scale-110 ${
            node.sex === 1 ? "rounded-md" : "rounded-full"
          } ${
            node.isAlive ? "ring-emerald-400" : "ring-red-400"
          }`}
        />
        <span
          className="text-[9px] font-medium leading-tight text-center max-w-[60px] truncate"
          style={{ color: nameColor }}
        >
          {nameLabel}
        </span>
        {age && (
          <span
            className="text-[8px] leading-tight text-center"
            style={{ color: ageColor }}
          >
            {age}
          </span>
        )}
      </div>
      {positioned.children.map((child) => (
        <GraphNodeCard key={child.node.id} positioned={child} treeType={treeType} compact={compact} isDark={isDark} router={router} />
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
  direction: EdgeDirection;
  width: number;
  height: number;
}) {
  const isVertical = direction === "vertical" || direction === "vertical-up";
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
          // Orthogonal "bracket" connecting generations with rounded corners.
          // Works for both downward (vertical) and upward (vertical-up) layouts
          // by using ydir = sign(dy).
          const dy = edge.y2 - edge.y1;
          const ydir = dy >= 0 ? 1 : -1;
          const cy = edge.y1 + dy * 0.45;
          const r = Math.min(10, Math.abs(edge.x2 - edge.x1) / 2, Math.abs(cy - edge.y1));
          if (edge.x1 === edge.x2 || r < 1) {
            d = `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`;
          } else {
            const xdir = edge.x2 > edge.x1 ? 1 : -1;
            d =
              `M ${edge.x1} ${edge.y1} ` +
              `L ${edge.x1} ${cy - ydir * r} ` +
              `Q ${edge.x1} ${cy} ${edge.x1 + xdir * r} ${cy} ` +
              `L ${edge.x2 - xdir * r} ${cy} ` +
              `Q ${edge.x2} ${cy} ${edge.x2} ${cy + ydir * r} ` +
              `L ${edge.x2} ${edge.y2}`;
          }
        }
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={isVertical ? 2.5 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
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
  combinedTree,
  treeType,
  ancestorsOrientation,
  descendantsOrientation,
  treeRef,
}: {
  tree: TreeNode | null;
  combinedTree: { ancestors: TreeNode; descendants: TreeNode } | null;
  treeType: TreeType;
  ancestorsOrientation: "horizontal" | "vertical";
  descendantsOrientation: "horizontal" | "vertical";
  treeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  const isAncestors = treeType === "ancestors";
  const isDescendants = treeType === "descendants";
  const isCombined = treeType === "combined";
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  // Combined view always uses vertical (descendant down, ancestor up).
  const direction: EdgeDirection = isCombined
    ? "vertical"
    : isAncestors
      ? ancestorsOrientation === "vertical"
        ? "vertical-up"
        : "horizontal"
      : isDescendants
        ? descendantsOrientation === "vertical"
          ? "vertical"
          : "horizontal"
        : "vertical";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const zoomRef = useRef(1);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const {
    positioned,
    descendantsExtra,
    canvasWidth,
    canvasHeight,
    edges,
    edgesUp,
    stats,
  } = useMemo(() => {
    let positioned: PositionedNode | null = null;
    let descendantsExtra: PositionedNode | null = null;
    let edges: Edge[] = [];
    let edgesUp: Edge[] = [];

    if (isCombined && combinedTree) {
      // Layout ancestors going up (root at the bottom of its block).
      const ancMaxDepth = getTreeDepth(combinedTree.ancestors);
      const ancResult = layoutAncestorsVertical(
        combinedTree.ancestors,
        0,
        40,
        ancMaxDepth
      );
      const ancRoot = ancResult.positioned;

      // Layout descendants going down (root at the top of its block).
      const descResult = layoutDescendants(combinedTree.descendants, 0, 40);
      const descRoot = descResult.positioned;

      // Align the descendants subtree so its root coincides with the
      // ancestors root (same x and y).
      shiftPositioned(
        descRoot,
        ancRoot.x - descRoot.x,
        ancRoot.y - descRoot.y
      );

      // Normalise everything to non-negative coordinates.
      const ancMin = getMinBounds(ancRoot);
      const descMin = getMinBounds(descRoot);
      const minX = Math.min(ancMin.minX, descMin.minX);
      const minY = Math.min(ancMin.minY, descMin.minY);
      const dx = 40 - minX;
      const dy = 40 - minY;
      shiftPositioned(ancRoot, dx, dy);
      shiftPositioned(descRoot, dx, dy);

      positioned = ancRoot;
      descendantsExtra = descRoot;
      edgesUp = collectEdges(ancRoot, "vertical-up");
      edges = collectEdges(descRoot, "vertical");
    } else if (tree) {
      if (isAncestors) {
        if (ancestorsOrientation === "vertical") {
          const maxDepth = getTreeDepth(tree);
          const result = layoutAncestorsVertical(tree, 0, 40, maxDepth);
          positioned = result.positioned;
        } else {
          const result = layoutAncestors(tree, 0, 40);
          positioned = result.positioned;
        }
      } else {
        // Descendants
        if (descendantsOrientation === "horizontal") {
          // Reuse ancestors horizontal layout (root left, children right)
          const result = layoutAncestors(tree, 0, 40);
          positioned = result.positioned;
        } else {
          const result = layoutDescendants(tree, 0, 40);
          positioned = result.positioned;
        }
      }
      edges = collectEdges(positioned, direction);
    }

    if (!positioned) {
      return {
        positioned: null,
        descendantsExtra: null,
        canvasWidth: 0,
        canvasHeight: 0,
        edges: [],
        edgesUp: [],
        stats: { generations: 0, ancestorsCount: 0, descendantsCount: 0 },
      };
    }

    const ancBounds = getBounds(positioned);
    const descBounds = descendantsExtra ? getBounds(descendantsExtra) : ancBounds;
    const canvasWidth = Math.max(ancBounds.maxX, descBounds.maxX) + 80;
    const canvasHeight = Math.max(ancBounds.maxY, descBounds.maxY) + 80;

    // Generation / persons counters
    let generations = 0;
    let ancestorsCount = 0;
    let descendantsCount = 0;
    if (isCombined && combinedTree) {
      const ancDepth = getTreeDepth(combinedTree.ancestors);
      const descDepth = getTreeDepth(combinedTree.descendants);
      generations = ancDepth + descDepth + 1;
      // Subtract 1 to exclude the root person itself from each side.
      ancestorsCount = Math.max(0, countTreeNodes(combinedTree.ancestors) - 1);
      descendantsCount = Math.max(0, countTreeNodes(combinedTree.descendants) - 1);
    } else if (tree) {
      generations = getTreeDepth(tree) + 1;
      const total = Math.max(0, countTreeNodes(tree) - 1);
      if (isAncestors) {
        ancestorsCount = total;
      } else {
        descendantsCount = total;
      }
    }

    return {
      positioned,
      descendantsExtra,
      canvasWidth,
      canvasHeight,
      edges,
      edgesUp,
      stats: { generations, ancestorsCount, descendantsCount },
    };
  }, [tree, combinedTree, isAncestors, isCombined, ancestorsOrientation, descendantsOrientation, direction]);

  // On load / tree change / fullscreen toggle:
  //   1) auto-zoom IN if the tree is smaller than the container (never shrink)
  //   2) scroll to center the root node
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !positioned) return;
    requestAnimationFrame(() => {
      const cw = container.clientWidth;
      // Fit by WIDTH only — vertical overflow is handled by scrolling.
      const fit = cw / canvasWidth;
      // Only zoom IN — never shrink. Cap at MAX_ZOOM.
      const newZoom = Math.min(MAX_ZOOM, Math.max(1, +fit.toFixed(2)));
      if (newZoom !== zoomRef.current) {
        zoomRef.current = newZoom;
        setZoom(newZoom);
      }
      // Re-run after the new zoom is applied so scroll uses the latest size
      requestAnimationFrame(() => {
        const rootCenterX = (positioned.x + NODE_W / 2) * zoomRef.current;
        const rootCenterY = (positioned.y + NODE_H / 2) * zoomRef.current;
        container.scrollLeft = rootCenterX - container.clientWidth / 2;
        container.scrollTop = rootCenterY - container.clientHeight / 2;
      });
    });
  }, [positioned, fullscreen, canvasWidth, canvasHeight]);

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
      if (!container || !positioned) return;
      const rootCenterX = positioned.x + NODE_W / 2;
      const rootCenterY = positioned.y + NODE_H / 2;
      container.scrollLeft = rootCenterX - container.clientWidth / 2;
      container.scrollTop = rootCenterY - container.clientHeight / 2;
    });
  }, [positioned]);

  const fitToView = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Fit both width and height into the visible area
    const fitZoom = Math.min(cw / canvasWidth, ch / canvasHeight);
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +fitZoom.toFixed(2)));
    zoomRef.current = newZoom;
    setZoom(newZoom);
    requestAnimationFrame(() => {
      // Center the canvas within the container
      const scaledW = canvasWidth * newZoom;
      const scaledH = canvasHeight * newZoom;
      container.scrollLeft = (scaledW - cw) / 2;
      container.scrollTop = (scaledH - ch) / 2;
    });
  }, [canvasWidth, canvasHeight]);

  if (!positioned) return null;

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
        <div
          className="mx-auto"
          style={{
            width: scaledW,
            height: scaledH,
            minHeight: fullscreen ? "100%" : 300,
          }}
        >
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
            {edgesUp.length > 0 && (
              <SvgEdges
                edges={edgesUp}
                direction="vertical-up"
                width={canvasWidth}
                height={canvasHeight}
              />
            )}
            <SvgEdges
              edges={edges}
              direction={direction}
              width={canvasWidth}
              height={canvasHeight}
            />
            <GraphNodeCard
              positioned={positioned}
              treeType={treeType}
              compact={isCombined || direction === "vertical" || direction === "vertical-up"}
              isDark={isDark}
              router={router}
            />
            {descendantsExtra &&
              descendantsExtra.children.map((child) => (
                <GraphNodeCard
                  key={`desc-${child.node.id}`}
                  positioned={child}
                  treeType={treeType}
                  compact
                  isDark={isDark}
                  router={router}
                />
              ))}
            {/* Stats badge: generations + total persons, anchored to the root */}
            {(stats.ancestorsCount > 0 || stats.descendantsCount > 0) && (
              <div
                data-stats-badge=""
                className="absolute pointer-events-none text-[10px] leading-tight rounded-md px-1.5 py-0.5 whitespace-nowrap border"
                style={{
                  left: positioned.x + NODE_W + 6,
                  top: positioned.y + PHOTO_CENTER_Y - 14,
                  color: "#f5f5f5",
                  background: "#000000",
                  borderColor: "#737373",
                }}
              >
                <div>Поколений: {stats.generations}</div>
                <div>Предков: {stats.ancestorsCount}</div>
                <div>Потомков: {stats.descendantsCount}</div>
              </div>
            )}
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
        <button
          onClick={fitToView}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          title="Вписать в окно"
        >
          <Scan className="h-4 w-4" />
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
  const age = calcAge(node.birthDay, node.deathDay, node.isAlive);

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
            {node.lastName} {node.firstName}{age && <>{" "}<span className={`text-xs ${node.isAlive ? "text-emerald-300" : "text-red-300"}`}>{age}</span></>}
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
  const [combinedTree, setCombinedTree] = useState<{
    ancestors: TreeNode;
    descendants: TreeNode;
  } | null>(null);
  const [treeType, setTreeType] = useState<TreeType>("combined");
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [loading, setLoading] = useState(true);
  const [ancestorsOrientation, setAncestorsOrientation] = useState<
    "horizontal" | "vertical"
  >("vertical");
  const [descendantsOrientation, setDescendantsOrientation] = useState<
    "horizontal" | "vertical"
  >("vertical");

  // Load persisted orientation preferences
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedAnc = localStorage.getItem("drevo-ancestors-orientation");
    if (savedAnc === "horizontal" || savedAnc === "vertical") {
      setAncestorsOrientation(savedAnc);
    }
    const savedDesc = localStorage.getItem("drevo-descendants-orientation");
    if (savedDesc === "horizontal" || savedDesc === "vertical") {
      setDescendantsOrientation(savedDesc);
    }
  }, []);

  const changeAncestorsOrientation = (v: "horizontal" | "vertical") => {
    setAncestorsOrientation(v);
    if (typeof window !== "undefined") {
      localStorage.setItem("drevo-ancestors-orientation", v);
    }
  };

  const changeDescendantsOrientation = (v: "horizontal" | "vertical") => {
    setDescendantsOrientation(v);
    if (typeof window !== "undefined") {
      localStorage.setItem("drevo-descendants-orientation", v);
    }
  };

  const treeRef = useRef<HTMLDivElement>(null);
  const { repo } = useData();

  useEffect(() => {
    setLoading(true);
    if (repo) {
      // Local computation — instant
      if (treeType === "combined") {
        const anc = repo.getAncestorTree(personId);
        const desc = repo.getDescendantTree(personId);
        if (anc && desc) { setCombinedTree({ ancestors: anc, descendants: desc }); setTree(null); }
      } else {
        const data = treeType === "descendants" ? repo.getDescendantTree(personId) : repo.getAncestorTree(personId);
        if (data) { setTree(data); setCombinedTree(null); }
      }
      setLoading(false);
      return;
    }
    // Fallback to API
    let cancelled = false;
    if (treeType === "combined") {
      Promise.all([
        api.getTree(personId, "ancestors"),
        api.getTree(personId, "descendants"),
      ])
        .then(([anc, desc]) => {
          if (cancelled) return;
          setCombinedTree({ ancestors: anc, descendants: desc });
          setTree(null);
        })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      api
        .getTree(personId, treeType)
        .then((data) => {
          if (cancelled) return;
          setTree(data);
          setCombinedTree(null);
        })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [personId, treeType, repo]);

  const handlePersonSelect = (id: number | undefined) => {
    if (id && id > 0) setPersonId(id);
  };

  const exportPng = useCallback(async () => {
    const el = treeRef.current;
    if (!el) return;
    // Temporarily clear the CSS transform so the image isn't clipped.
    const prevTransform = el.style.transform;
    const prevTransformOrigin = el.style.transformOrigin;
    el.style.transform = "none";
    el.style.transformOrigin = "0 0";
    // Force dark theme during export so names/labels are light on dark bg.
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    if (!hadDark) html.classList.add("dark");

    // Override the stats badge style directly so the dark variant is rendered
    // even before React's MutationObserver-driven re-render lands.
    const badge = el.querySelector<HTMLElement>("[data-stats-badge]");
    const prevBadgeStyle = badge?.getAttribute("style") ?? null;
    if (badge) {
      badge.style.background = "#000000";
      badge.style.color = "#f5f5f5";
      badge.style.borderColor = "#737373";
    }

    // Wait for the MutationObserver to fire, React to re-render, and the
    // browser to paint the new state. One RAF + a small delay is enough.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const { toJpeg } = await import("html-to-image");
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Choose pixel ratio so the resulting canvas stays under MAX_SIDE px on
      // the longer side. For small trees this gives 2-3x sharpness; for very
      // large trees we fall back to ratio < 1 (slight downscale) to keep the
      // canvas within browser GPU limits.
      const MAX_SIDE = 12000;
      const longest = Math.max(w, h);
      let ratio = MAX_SIDE / longest;
      ratio = Math.max(0.7, Math.min(3, +ratio.toFixed(2)));
      const dataUrl = await toJpeg(el, {
        backgroundColor: "#1f1f23",
        pixelRatio: ratio,
        cacheBust: true,
        width: w,
        height: h,
        canvasWidth: Math.round(w * ratio),
        canvasHeight: Math.round(h * ratio),
        quality: 0.9,
      });
      const link = document.createElement("a");
      link.download = `drevo-${personId}.jpg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Export PNG failed:", e);
      alert("Не удалось экспортировать PNG: " + (e as Error).message);
    } finally {
      el.style.transform = prevTransform;
      el.style.transformOrigin = prevTransformOrigin;
      if (!hadDark) html.classList.remove("dark");
      if (badge) {
        if (prevBadgeStyle !== null) badge.setAttribute("style", prevBadgeStyle);
        else badge.removeAttribute("style");
      }
    }
  }, [personId]);

  const printTree = useCallback(async () => {
    const el = treeRef.current;
    if (!el) return;
    // Temporarily clear the CSS transform
    const prevTransform = el.style.transform;
    const prevTransformOrigin = el.style.transformOrigin;
    el.style.transform = "none";
    el.style.transformOrigin = "0 0";
    // Force LIGHT theme for print (white background, dark text)
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    if (hadDark) html.classList.remove("dark");
    // Override badge for white background
    const badge = el.querySelector<HTMLElement>("[data-stats-badge]");
    const prevBadgeStyle = badge?.getAttribute("style") ?? null;
    if (badge) {
      badge.style.background = "#ffffff";
      badge.style.color = "#171717";
      badge.style.borderColor = "#d4d4d4";
    }
    // Override SVG stroke color for print (gray on white is hard to see → use darker)
    const paths = el.querySelectorAll<SVGPathElement>("svg path");
    paths.forEach((p) => { p.setAttribute("data-prev-stroke", p.getAttribute("stroke") || ""); p.setAttribute("stroke", "#555555"); });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const { toJpeg } = await import("html-to-image");
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const MAX_SIDE = 12000;
      const longest = Math.max(w, h);
      let ratio = MAX_SIDE / longest;
      ratio = Math.max(0.7, Math.min(3, +ratio.toFixed(2)));
      const dataUrl = await toJpeg(el, {
        backgroundColor: "#ffffff",
        pixelRatio: ratio,
        cacheBust: true,
        width: w,
        height: h,
        canvasWidth: Math.round(w * ratio),
        canvasHeight: Math.round(h * ratio),
        quality: 0.9,
      });
      // Determine orientation: landscape if wider than tall, portrait otherwise
      const isLandscape = w > h;
      // Open a print window with the generated image
      const printWin = window.open("", "_blank");
      if (!printWin) {
        alert("Браузер заблокировал всплывающее окно. Разрешите pop-up для этого сайта.");
        return;
      }
      printWin.document.write(`<!DOCTYPE html>
<html><head><title>Печать Графа</title>
<style>
  @page { size: ${isLandscape ? "landscape" : "portrait"}; margin: 5mm; }
  * { margin: 0; padding: 0; }
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
  img { max-width: 100%; max-height: 100vh; object-fit: contain; }
</style></head>
<body><img src="${dataUrl}" onload="setTimeout(()=>{window.print();window.close()},300)" /></body></html>`);
      printWin.document.close();
    } catch (e) {
      console.error("Print failed:", e);
      alert("Не удалось подготовить печать: " + (e as Error).message);
    } finally {
      el.style.transform = prevTransform;
      el.style.transformOrigin = prevTransformOrigin;
      // Restore theme
      if (hadDark) html.classList.add("dark");
      // Restore badge
      if (badge) {
        if (prevBadgeStyle !== null) badge.setAttribute("style", prevBadgeStyle);
        else badge.removeAttribute("style");
      }
      // Restore SVG strokes
      paths.forEach((p) => {
        const prev = p.getAttribute("data-prev-stroke") || "";
        if (prev) p.setAttribute("stroke", prev);
        p.removeAttribute("data-prev-stroke");
      });
    }
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
          onValueChange={(v) => setTreeType(v as TreeType)}
        >
          <TabsList>
            <TabsTrigger value="combined">Общий</TabsTrigger>
            <TabsTrigger value="ancestors">Предки</TabsTrigger>
            <TabsTrigger value="descendants">Потомки</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 flex-wrap">
          {(treeType === "ancestors" || treeType === "descendants") && viewMode === "graph" && (() => {
            const orient = treeType === "ancestors" ? ancestorsOrientation : descendantsOrientation;
            const change = treeType === "ancestors" ? changeAncestorsOrientation : changeDescendantsOrientation;
            return (
              <div
                className="inline-flex items-center rounded-lg border bg-card p-1 gap-1"
                title="Ориентация графа"
              >
                <button
                  onClick={() => change("vertical")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    orient === "vertical"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  Вертикально
                </button>
                <button
                  onClick={() => change("horizontal")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    orient === "horizontal"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  Горизонтально
                </button>
              </div>
            );
          })()}

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

          {viewMode === "graph" && (tree || combinedTree) && !loading && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={exportPng}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export JPG</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={printTree}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Печать</span>
              </Button>
            </>
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
      ) : !tree && !combinedTree ? (
        <Card className="glass">
          <CardContent className="py-16 text-center text-muted-foreground">
            <GitFork className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-1">Человек не найден</p>
            <p className="text-sm">Проверьте ID и попробуйте снова</p>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          {tree ? (
            <TreeNodeComponent node={tree} depth={0} />
          ) : combinedTree ? (
            <>
              <TreeNodeComponent node={combinedTree.ancestors} depth={0} />
              <TreeNodeComponent node={combinedTree.descendants} depth={0} />
            </>
          ) : null}
        </div>
      ) : (
        <GraphView
          tree={tree}
          combinedTree={combinedTree}
          treeType={treeType}
          ancestorsOrientation={ancestorsOrientation}
          descendantsOrientation={descendantsOrientation}
          treeRef={treeRef}
        />
      )}
    </div>
  );
}
