import esbuild from "esbuild";
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist");
const ASSETS = join(__dirname, "..", "..", "android-app", "app", "src", "main", "assets");

// Clean & create dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(join(DIST, "data"), { recursive: true });

// 1. Bundle handler with esbuild (ydb-sdk is external — needs native grpc)
await esbuild.build({
  entryPoints: [join(__dirname, "handler.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: join(DIST, "handler.js"),
  external: ["ydb-sdk"],
  minify: false,
  sourcemap: false,
});

console.log("✓ handler.js bundled");

// 2. Copy data files (optional — on prod data comes from YDB)
const famCsvSrc = join(ASSETS, "fam.csv");
if (existsSync(famCsvSrc)) {
  cpSync(famCsvSrc, join(DIST, "data", "fam.csv"));
  console.log("✓ fam.csv copied");
} else {
  writeFileSync(join(DIST, "data", "fam.csv"), "");
  console.log("✓ fam.csv created (empty — YDB mode)");
}

const favCsvSrc = join(ASSETS, "fav.csv");
if (existsSync(favCsvSrc)) {
  cpSync(favCsvSrc, join(DIST, "data", "fav.csv"));
  console.log("✓ fav.csv copied");
} else {
  writeFileSync(join(DIST, "data", "fav.csv"), "");
  console.log("✓ fav.csv created (empty)");
}

// 3. Copy bio files (optional)
const infoSrc = join(ASSETS, "info");
const infoDst = join(DIST, "data", "info");
if (existsSync(infoSrc)) {
  cpSync(infoSrc, infoDst, { recursive: true });
  console.log("✓ info/ copied");
} else {
  mkdirSync(infoDst, { recursive: true });
  console.log("✓ info/ created (empty)");
}

// 4. Install ydb-sdk in dist (production only)
writeFileSync(
  join(DIST, "package.json"),
  JSON.stringify(
    { name: "drevo-api", version: "1.0.0", private: true, dependencies: { "ydb-sdk": "^5.11.1" } },
    null,
    2
  )
);

execSync("npm install --production --no-optional", {
  cwd: DIST,
  stdio: "inherit",
});
console.log("✓ ydb-sdk installed in dist/");

// 5. Create zip
execSync("cd dist && zip -r api.zip handler.js package.json data/ node_modules/", {
  cwd: __dirname,
  stdio: "inherit",
});
console.log("\n✓ dist/api.zip ready");
