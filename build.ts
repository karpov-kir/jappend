import { $ } from "bun";
import { readdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";

await build();
await moveFiles();
await patchImportsPaths();
await formatDist();

async function build() {
  await $`npx tsc --project tsconfig.types.json`;
  await $`rimraf tsconfig.types.tsbuildinfo`;
}

async function moveFiles() {
  const distSrcDir = "dist/src";
  const files = await readdir(distSrcDir);
  for (const file of files) {
    await rename(path.join(distSrcDir, file), path.join("dist", file));
  }
  await rm(distSrcDir, { recursive: true });
}

async function patchImportsPaths() {
  const dtsPath = "dist/tests/InMemoryFileHandle.d.ts";
  const dtsContent = await readFile(dtsPath, "utf8");
  const patched = dtsContent.replace(/from (["'])\.\.\/src\//g, "from $1../");
  if (patched === dtsContent) {
    throw new Error(`${dtsPath} has no ../src import to point at the package root`);
  }
  await writeFile(dtsPath, patched, "utf8");
}

/**
 * Formats the built JS and declaration files with oxfmt. oxfmt skips git-ignored `dist` when it walks a directory, so the
 * function names each file.
 */
async function formatDist() {
  const files = await readdir("dist", { recursive: true });
  const builtFiles = files
    .filter((file) => /\.(js|ts)$/.test(file))
    .map((file) => path.join("dist", file));
  await $`oxfmt ${builtFiles}`;
}
