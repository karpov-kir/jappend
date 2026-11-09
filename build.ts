import { $ } from "bun";
import { readFile, rename, rm, writeFile } from "fs/promises";
import { readdir } from "fs/promises";
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
  const patched = dtsContent.replace(`from '../src`, `from '..`);
  await writeFile(dtsPath, patched, "utf8");
}

// Just to have the built files nicely formatted. oxfmt skips the git-ignored dist, so each file goes through stdin.
async function formatDist() {
  for (const file of await readdir("dist", { recursive: true })) {
    if (!/\.(js|ts)$/.test(file)) {
      continue;
    }
    const filePath = path.join("dist", file);
    const formatted = await $`oxfmt --stdin-filepath=${filePath} < ${Bun.file(filePath)}`.text();
    await writeFile(filePath, formatted, "utf8");
  }
}
