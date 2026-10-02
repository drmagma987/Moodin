import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

  return (
    candidates.find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    ) ?? null
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolvedPath = resolveTsPath(specifier);
    if (!resolvedPath) {
      throw new Error(`Could not resolve aliased import: ${specifier}`);
    }

    return nextResolve(pathToFileURL(resolvedPath).href, context);
  }

  if (
    specifier.startsWith(".") &&
    context.parentURL?.startsWith("file:") &&
    !path.extname(specifier)
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const basePath = path.resolve(parentDir, specifier);
    const candidates = [
      `${basePath}.ts`,
      `${basePath}.tsx`,
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
    ];
    const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (resolvedPath) {
      return nextResolve(pathToFileURL(resolvedPath).href, context);
    }
  }

  return nextResolve(specifier, context);
}
