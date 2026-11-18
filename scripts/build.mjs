import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");
const dist = path.join(web, "dist");

async function readRootEnv() {
  const values = { ...process.env };
  let source = "";
  try {
    source = await fs.readFile(path.join(root, ".env"), "utf8");
  } catch {
    return values;
  }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || values[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]] = value;
  }
  return values;
}

export async function buildApp({ watch = false } = {}) {
  const env = await readRootEnv();
  if (!watch) await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });
  await fs.cp(path.join(web, "public"), dist, { recursive: true, force: true });
  await fs.copyFile(path.join(web, "index.html"), path.join(dist, "index.html"));

  const context = await esbuild.context({
    absWorkingDir: root,
    entryPoints: [path.join(web, "src", "main.tsx")],
    bundle: true,
    outfile: path.join(dist, "assets", "app.js"),
    platform: "browser",
    format: "esm",
    target: ["es2022"],
    jsx: "automatic",
    sourcemap: watch ? "inline" : true,
    minify: !watch,
    define: {
      "import.meta.env": JSON.stringify({
        PROD: !watch,
        DEV: watch,
        MODE: watch ? "development" : "production",
        BASE_URL: "./",
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? "",
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? ""
      })
    },
    logLevel: "info"
  });

  await context.rebuild();
  if (watch) {
    await context.watch();
    return context;
  }
  await context.dispose();
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildApp();
}
