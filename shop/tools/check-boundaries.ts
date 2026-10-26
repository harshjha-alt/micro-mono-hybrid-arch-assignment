import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

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

function getImportPaths(source: string): string[] {
  const paths: string[] = [];
  const staticImport =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'();]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImport, dynamicImport]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) paths.push(match[1]);
    }
  }

  return paths;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function findViolations(root: string): Violation[] {
  const sourceRoot = resolve(root);
  const modulesRoot = resolve(sourceRoot, "modules");
  const violations: Violation[] = [];

  for (const file of findTypeScriptFiles(modulesRoot)) {
    const moduleName = relative(modulesRoot, file).split(sep)[0] ?? "";
    const source = readFileSync(file, "utf8");

    for (const importPath of getImportPaths(source)) {
      if (!importPath.startsWith(".")) {
        violations.push({
          file: relative(sourceRoot, file),
          importPath,
          reason: "module imports must be relative or under platform",
        });
        continue;
      }

      const importedFile = resolve(dirname(file), importPath);
      const ownModule = resolve(modulesRoot, moduleName);

      if (isInside(ownModule, importedFile)) continue;
      if (isInside(resolve(sourceRoot, "platform"), importedFile)) continue;

      const importedFromRoot = relative(sourceRoot, importedFile).split(sep);
      const importsAnotherModuleIndex =
        importedFromRoot.length === 3 &&
        importedFromRoot[0] === "modules" &&
        importedFromRoot[1] !== moduleName &&
        importedFromRoot[2] === "index.ts";

      if (importsAnotherModuleIndex) continue;

      violations.push({
        file: relative(sourceRoot, file),
        importPath,
        reason: "cross-module imports must use the other module's index.ts",
      });
    }
  }

  return violations;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const violations = findViolations(resolve("src"));

  for (const violation of violations) {
    console.error(
      `${violation.file} -> ${violation.importPath}: ${violation.reason}`,
    );
  }

  if (violations.length > 0) process.exitCode = 1;
}