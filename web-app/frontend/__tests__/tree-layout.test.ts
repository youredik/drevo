import { describe, it, expect } from "vitest";
import {
  type TreeNode,
  NODE_W,
  NODE_H,
  ANCESTOR_COL_GAP,
  ANCESTOR_ROW_GAP,
  DESCENDANT_COL_GAP,
  DESCENDANT_ROW_GAP,
  layoutAncestors,
  layoutDescendants,
  collectEdges,
  getBounds,
} from "../src/lib/tree-layout";

// ─── Helpers ──────────────────────────────────────────────

function makeNode(id: number, children: TreeNode[] = []): TreeNode {
  return {
    id,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    sex: 1,
    isAlive: true,
    photo: "",
    children,
  };
}

// ─── layoutAncestors ─────────────────────────────────────

describe("layoutAncestors", () => {
  it("positions a single leaf node", () => {
    const node = makeNode(1);
    const { positioned, height } = layoutAncestors(node, 0, 40);

    expect(positioned.x).toBe(0 * ANCESTOR_COL_GAP + 40);
    expect(positioned.y).toBe(40);
    expect(positioned.children).toHaveLength(0);
    expect(height).toBe(NODE_H + ANCESTOR_ROW_GAP);
  });

  it("positions a node with 2 parents, centering vertically", () => {
    const father = makeNode(2);
    const mother = makeNode(3);
    const root = makeNode(1, [father, mother]);
    const { positioned } = layoutAncestors(root, 0, 0);

    // Father at depth=1, y=0
    // Mother at depth=1, y= NODE_H + ANCESTOR_ROW_GAP
    expect(positioned.children).toHaveLength(2);
    const fatherPos = positioned.children[0];
    const motherPos = positioned.children[1];

    expect(fatherPos.x).toBe(1 * ANCESTOR_COL_GAP + 40);
    expect(fatherPos.y).toBe(0);
    expect(motherPos.x).toBe(1 * ANCESTOR_COL_GAP + 40);
    expect(motherPos.y).toBe(NODE_H + ANCESTOR_ROW_GAP);

    // Root centered between father and mother
    expect(positioned.y).toBe((fatherPos.y + motherPos.y) / 2);
    expect(positioned.x).toBe(0 * ANCESTOR_COL_GAP + 40);
  });

  it("handles 3-generation ancestor tree", () => {
    // grandparents → parent → root
    const gp1 = makeNode(10);
    const gp2 = makeNode(11);
    const father = makeNode(2, [gp1, gp2]);
    const mother = makeNode(3);
    const root = makeNode(1, [father, mother]);

    const { positioned } = layoutAncestors(root, 0, 0);

    // depth 0 = root, depth 1 = father/mother, depth 2 = grandparents
    expect(positioned.x).toBe(40); // depth 0
    expect(positioned.children[0].x).toBe(ANCESTOR_COL_GAP + 40); // depth 1
    expect(positioned.children[0].children[0].x).toBe(2 * ANCESTOR_COL_GAP + 40); // depth 2
  });

  it("returns correct total height for multi-child tree", () => {
    const c1 = makeNode(2);
    const c2 = makeNode(3);
    const c3 = makeNode(4);
    const root = makeNode(1, [c1, c2, c3]);

    const { height } = layoutAncestors(root, 0, 0);

    // 3 leaf nodes, each takes NODE_H + ANCESTOR_ROW_GAP
    expect(height).toBe(3 * (NODE_H + ANCESTOR_ROW_GAP));
  });

  it("respects yOffset parameter", () => {
    const node = makeNode(1);
    const { positioned } = layoutAncestors(node, 0, 200);
    expect(positioned.y).toBe(200);
  });
});

// ─── layoutDescendants ───────────────────────────────────

describe("layoutDescendants", () => {
  it("positions a single leaf node", () => {
    const node = makeNode(1);
    const { positioned, width } = layoutDescendants(node, 0, 40);

    expect(positioned.y).toBe(0 * DESCENDANT_ROW_GAP + 40);
    expect(positioned.x).toBe(40);
    expect(positioned.children).toHaveLength(0);
    expect(width).toBe(NODE_W + DESCENDANT_COL_GAP);
  });

  it("positions a node with 2 children, centering horizontally", () => {
    const child1 = makeNode(2);
    const child2 = makeNode(3);
    const root = makeNode(1, [child1, child2]);
    const { positioned } = layoutDescendants(root, 0, 0);

    expect(positioned.children).toHaveLength(2);
    const c1Pos = positioned.children[0];
    const c2Pos = positioned.children[1];

    // Children at depth=1
    expect(c1Pos.y).toBe(1 * DESCENDANT_ROW_GAP + 40);
    expect(c2Pos.y).toBe(1 * DESCENDANT_ROW_GAP + 40);

    // Children side by side
    expect(c1Pos.x).toBe(0);
    expect(c2Pos.x).toBe(NODE_W + DESCENDANT_COL_GAP);

    // Root centered horizontally between children
    expect(positioned.x).toBe((c1Pos.x + c2Pos.x) / 2);
  });

  it("handles 3-generation descendant tree", () => {
    const grandchild = makeNode(10);
    const child1 = makeNode(2, [grandchild]);
    const child2 = makeNode(3);
    const root = makeNode(1, [child1, child2]);

    const { positioned } = layoutDescendants(root, 0, 0);

    // depth 0 = root, depth 1 = children, depth 2 = grandchild
    expect(positioned.y).toBe(40); // depth 0
    expect(positioned.children[0].y).toBe(DESCENDANT_ROW_GAP + 40); // depth 1
    expect(positioned.children[0].children[0].y).toBe(2 * DESCENDANT_ROW_GAP + 40); // depth 2
  });

  it("returns correct total width for multi-child tree", () => {
    const c1 = makeNode(2);
    const c2 = makeNode(3);
    const c3 = makeNode(4);
    const root = makeNode(1, [c1, c2, c3]);

    const { width } = layoutDescendants(root, 0, 0);

    // 3 leaf nodes, each takes NODE_W + DESCENDANT_COL_GAP
    expect(width).toBe(3 * (NODE_W + DESCENDANT_COL_GAP));
  });

  it("respects xOffset parameter", () => {
    const node = makeNode(1);
    const { positioned } = layoutDescendants(node, 0, 300);
    expect(positioned.x).toBe(300);
  });
});

// ─── collectEdges ────────────────────────────────────────

describe("collectEdges", () => {
  it("returns empty edges for a leaf node", () => {
    const node = makeNode(1);
    const { positioned } = layoutAncestors(node, 0, 0);
    const edges = collectEdges(positioned, "horizontal");
    expect(edges).toHaveLength(0);
  });

  it("collects horizontal edges (ancestors)", () => {
    const parent = makeNode(2);
    const root = makeNode(1, [parent]);
    const { positioned } = layoutAncestors(root, 0, 0);
    const edges = collectEdges(positioned, "horizontal");

    expect(edges).toHaveLength(1);
    // Parent right edge center → child left edge center
    expect(edges[0].x1).toBe(positioned.x + NODE_W / 2);
    expect(edges[0].y1).toBe(positioned.y + NODE_H / 2);
    expect(edges[0].x2).toBe(positioned.children[0].x);
    expect(edges[0].y2).toBe(positioned.children[0].y + NODE_H / 2);
  });

  it("collects vertical edges (descendants)", () => {
    const child = makeNode(2);
    const root = makeNode(1, [child]);
    const { positioned } = layoutDescendants(root, 0, 0);
    const edges = collectEdges(positioned, "vertical");

    expect(edges).toHaveLength(1);
    // Parent bottom center → child top center
    expect(edges[0].x1).toBe(positioned.x + NODE_W / 2);
    expect(edges[0].y1).toBe(positioned.y + NODE_H);
    expect(edges[0].x2).toBe(positioned.children[0].x + NODE_W / 2);
    expect(edges[0].y2).toBe(positioned.children[0].y);
  });

  it("counts edges matching total parent-child pairs", () => {
    // root -> 2 children, child1 -> 2 grandchildren = 4 edges
    const gc1 = makeNode(10);
    const gc2 = makeNode(11);
    const c1 = makeNode(2, [gc1, gc2]);
    const c2 = makeNode(3);
    const root = makeNode(1, [c1, c2]);

    const { positioned } = layoutDescendants(root, 0, 0);
    const edges = collectEdges(positioned, "vertical");

    // root->c1, root->c2, c1->gc1, c1->gc2 = 4
    expect(edges).toHaveLength(4);
  });
});

// ─── getBounds ───────────────────────────────────────────

describe("getBounds", () => {
  it("returns correct bounds for a single node", () => {
    const node = makeNode(1);
    const { positioned } = layoutAncestors(node, 0, 0);
    const bounds = getBounds(positioned);

    expect(bounds.maxX).toBe(positioned.x + NODE_W);
    expect(bounds.maxY).toBe(positioned.y + NODE_H);
  });

  it("returns max bounds across multi-level tree", () => {
    const gc = makeNode(10);
    const c1 = makeNode(2, [gc]);
    const c2 = makeNode(3);
    const root = makeNode(1, [c1, c2]);

    const { positioned } = layoutAncestors(root, 0, 0);
    const bounds = getBounds(positioned);

    // deepest node (gc) is at depth=2, x = 2*ANCESTOR_COL_GAP + 40
    // lowest node (c2) is at y = NODE_H + ANCESTOR_ROW_GAP
    const gcX = 2 * ANCESTOR_COL_GAP + 40;
    expect(bounds.maxX).toBe(gcX + NODE_W);
    expect(bounds.maxY).toBeGreaterThan(NODE_H);
  });

  it("handles descendant tree bounds", () => {
    const c1 = makeNode(2);
    const c2 = makeNode(3);
    const root = makeNode(1, [c1, c2]);

    const { positioned } = layoutDescendants(root, 0, 0);
    const bounds = getBounds(positioned);

    // rightmost child is c2 at x = NODE_W + DESCENDANT_COL_GAP
    expect(bounds.maxX).toBe(NODE_W + DESCENDANT_COL_GAP + NODE_W);
    // deepest is children at depth=1
    expect(bounds.maxY).toBe(DESCENDANT_ROW_GAP + 40 + NODE_H);
  });
});
