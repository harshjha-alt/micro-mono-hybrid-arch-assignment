import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Task 1 - build this.
 *
 * Walk every .ts file under src/modules and look at its imports.
 * A module may import:
 *   - its own files
 *   - anything under src/platform
 *   - another module's index.ts  -  and nothing else
 *
 * Anything else is a violation.
 *
 * Running this file directly should print the violations and exit 1 when
 * there are any, 0 when there are none.
 *
 * No dependencies. node:fs and node:path are enough. Remember that a
 * type-only import still couples one module to another.
 */
export interface Violation {
  file: string;
  importPath: string;
  reason: string;
}

function findTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return findTypeScriptFiles(file);
    return entry.isFile() && file.endsWith(".ts") ? [file] : [];
  });
}

function importPaths(source: string): string[] {
  const paths: string[] = [];
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"'();]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [importPattern, dynamicImportPattern]) {
    for (const match of source.matchAll(pattern)) paths.push(match[1]);
  }

  return paths;
}

export function findViolations(root: string): Violation[] {
  const sourceRoot = resolve(root);
  const modulesRoot = resolve(sourceRoot, "modules");
  const violations: Violation[] = [];

  for (const file of findTypeScriptFiles(modulesRoot)) {
    const moduleDirectory = relative(modulesRoot, file).split(sep)[0];
    const source = readFileSync(file, "utf8");

    for (const importPath of importPaths(source)) {
      if (!importPath.startsWith(".")) {
        violations.push({ file: relative(sourceRoot, file), importPath, reason: "module imports must be relative or under platform" });
        continue;
      }

      const importedFile = resolve(dirname(file), importPath);
      const importedFromRoot = relative(sourceRoot, importedFile);
      const importedFromModule = relative(resolve(modulesRoot, moduleDirectory), importedFile);
      const isInside = (path: string) => path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);

      if (isInside(importedFromModule)) continue;
      if (isInside(importedFromRoot) && importedFromRoot.startsWith(`platform${sep}`)) continue;

      const targetModule = importedFromRoot.split(sep)[1];
      if (isInside(importedFromRoot) && importedFromRoot.startsWith(`modules${sep}`) &&
          targetModule !== moduleDirectory && importedFromRoot.endsWith(`${sep}index.ts`)) continue;

      violations.push({ file: relative(sourceRoot, file), importPath, reason: "cross-module imports must use the other module's index.ts" });
    }
  }

  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const violations = findViolations(resolve("src"));
  for (const violation of violations) {
    console.error(`${violation.file} -> ${violation.importPath}: ${violation.reason}`);
  }
  if (violations.length > 0) process.exitCode = 1;
}
