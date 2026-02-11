// ─── Types ───────────────────────────────────────────

export interface TreeNode {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  isAlive: boolean;
  photo: string;
  children: TreeNode[];
}

export interface PositionedNode {
  node: TreeNode;
  x: number;
  y: number;
  children: PositionedNode[];
}

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ─── Layout constants ────────────────────────────────

export const NODE_W = 80;
export const NODE_H = 88;

export const ANCESTOR_COL_GAP = 200;
export const ANCESTOR_ROW_GAP = 100;

export const DESCENDANT_COL_GAP = 120;
export const DESCENDANT_ROW_GAP = 140;

// ─── Layout helpers ──────────────────────────────────

/**
 * Ancestors layout: horizontal, root on the left, parents to the right.
 * Returns a PositionedNode tree and the total height consumed.
 */
export function layoutAncestors(
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
export function layoutDescendants(
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

// ─── Edge collection ─────────────────────────────────

export function collectEdges(
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

// ─── Bounding box ────────────────────────────────────

export function getBounds(positioned: PositionedNode): {
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
