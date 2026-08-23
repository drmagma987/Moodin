import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

function resolveTsPath(specifier) {
  const relativePath = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier;
  const basePath = path.resolve(rootDir, relativePath);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolvedPath = resolveTsPath(specifier);
    if (!resolvedPath) {
      throw new Error(`Could not resolve aliased import: ${specifier}`);
    }

    return nextResolve(pathToFileURL(resolvedPath).href, context);
  }

  return nextResolve(specifier, context);
}
