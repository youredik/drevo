import esbuild from "esbuild";
import { cpSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist");
const ASSETS = join(__dirname, "..", "..", "android-app", "app", "src", "main", "assets");

// Clean & create dist
mkdirSync(join(DIST, "data"), { recursive: true });

// 1. Bundle handler with esbuild
await esbuild.build({
  entryPoints: [join(__dirname, "handler.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: join(DIST, "handler.js"),
  external: [],
  minify: false,
  sourcemap: false,
});

console.log("✓ handler.js bundled");

// 2. Copy data files
cpSync(join(ASSETS, "fam.csv"), join(DIST, "data", "fam.csv"));
console.log("✓ fam.csv copied");

if (existsSync(join(ASSETS, "fav.csv"))) {
  cpSync(join(ASSETS, "fav.csv"), join(DIST, "data", "fav.csv"));
  console.log("✓ fav.csv copied");
} else {
  writeFileSync(join(DIST, "data", "fav.csv"), "");
  console.log("✓ fav.csv created (empty)");
}

// 3. Copy bio files
const infoSrc = join(ASSETS, "info");
const infoDst = join(DIST, "data", "info");
if (existsSync(infoSrc)) {
  cpSync(infoSrc, infoDst, { recursive: true });
  console.log("✓ info/ copied");
}

// 4. Minimal package.json (so Node.js doesn't try ESM)
writeFileSync(
  join(DIST, "package.json"),
  JSON.stringify({ name: "drevo-api", version: "1.0.0", private: true }, null, 2)
);
console.log("✓ package.json created");

// 5. Create zip
execSync("cd dist && zip -r api.zip handler.js package.json data/", {
  cwd: __dirname,
  stdio: "inherit",
});
console.log("\n✓ dist/api.zip ready");
