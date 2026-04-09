// ─── Types ───────────────────────────────────────────

export interface TreeNode {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  isAlive: boolean;
  photo: string;
  birthDay: string;
  deathDay: string;
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

export const NODE_W = 60;
export const NODE_H = 72;
// Photo (circle avatar) sits at the top of each card; its vertical center is
// used as the anchor for horizontal connector lines so they don't run through
// the name/age text below.
export const PHOTO_CENTER_Y = 20;

export const ANCESTOR_COL_GAP = 100;
export const ANCESTOR_ROW_GAP = 10;

export const DESCENDANT_COL_GAP = 2;
export const DESCENDANT_ROW_GAP = 97;

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
 * Maximum depth of the tree (root is depth 0).
 */
export function getTreeDepth(node: TreeNode, depth: number = 0): number {
  if (!node.children.length) return depth;
  return Math.max(...node.children.map((c) => getTreeDepth(c, depth + 1)));
}

/**
 * Ancestors layout: vertical, root (the person) at the BOTTOM,
 * parents and further ancestors stacked above.
 * Mirrors layoutDescendants but flips Y so deeper ancestors appear higher.
 */
export function layoutAncestorsVertical(
  node: TreeNode,
  depth: number,
  xOffset: number,
  maxDepth: number
): { positioned: PositionedNode; width: number } {
  const y = (maxDepth - depth) * DESCENDANT_ROW_GAP + 40;

  if (node.children.length === 0) {
    return {
      positioned: { node, x: xOffset, y, children: [] },
      width: NODE_W + DESCENDANT_COL_GAP,
    };
  }

  let currentX = xOffset;
  const childPositions: PositionedNode[] = [];
  let totalWidth = 0;

  for (const child of node.children) {
    const result = layoutAncestorsVertical(child, depth + 1, currentX, maxDepth);
    childPositions.push(result.positioned);
    currentX += result.width;
    totalWidth += result.width;
  }

  const firstChildX = childPositions[0].x;
  const lastChildX = childPositions[childPositions.length - 1].x;
  const x = (firstChildX + lastChildX) / 2;

  return {
    positioned: { node, x, y, children: childPositions },
    width: totalWidth,
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

export type EdgeDirection = "horizontal" | "vertical" | "vertical-up";

export function collectEdges(
  positioned: PositionedNode,
  direction: EdgeDirection
): Edge[] {
  const edges: Edge[] = [];
  const halfW = NODE_W / 2;

  for (const child of positioned.children) {
    if (direction === "horizontal") {
      // parent right edge -> child left edge, anchored at photo center
      edges.push({
        x1: positioned.x + halfW,
        y1: positioned.y + PHOTO_CENTER_Y,
        x2: child.x,
        y2: child.y + PHOTO_CENTER_Y,
      });
    } else if (direction === "vertical") {
      // parent bottom edge -> child top edge (descendants tree)
      edges.push({
        x1: positioned.x + halfW,
        y1: positioned.y + NODE_H,
        x2: child.x + halfW,
        y2: child.y,
      });
    } else {
      // vertical-up: visual parent (descendant) at bottom, visual child (ancestor) above
      edges.push({
        x1: positioned.x + halfW,
        y1: positioned.y,
        x2: child.x + halfW,
        y2: child.y + NODE_H,
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

/** Top-left corner of the positioned subtree. */
export function getMinBounds(positioned: PositionedNode): {
  minX: number;
  minY: number;
} {
  let minX = positioned.x;
  let minY = positioned.y;
  for (const child of positioned.children) {
    const cb = getMinBounds(child);
    if (cb.minX < minX) minX = cb.minX;
    if (cb.minY < minY) minY = cb.minY;
  }
  return { minX, minY };
}

/** Translate the positioned subtree in place. */
export function shiftPositioned(
  positioned: PositionedNode,
  dx: number,
  dy: number
): void {
  positioned.x += dx;
  positioned.y += dy;
  for (const child of positioned.children) shiftPositioned(child, dx, dy);
}
