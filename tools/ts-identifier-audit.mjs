#!/usr/bin/env node
/**
 * Audit TypeScript identifiers without scanning comments or string literals.
 *
 * Usage:
 *   node tools/ts-identifier-audit.mjs
 *   node tools/ts-identifier-audit.mjs --check
 *
 * `--check` exits with status 1 while any CJK identifier declaration remains.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["src", "tests"];
const checkOnly = process.argv.includes("--check");
const cjkPattern = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

function collectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(filePath, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

function declarationKind(identifier) {
  const parent = identifier.parent;
  if (!parent || !("name" in parent) || parent.name !== identifier) return null;
  if (ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) return "variable";
  if (ts.isParameter(parent)) return "parameter";
  if (
    ts.isFunctionDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent)
  ) {
    return "function_or_method";
  }
  if (
    ts.isTypeAliasDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isTypeParameterDeclaration(parent)
  ) {
    return "type";
  }
  if (
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isEnumMember(parent)
  ) {
    return "property";
  }
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) {
    return "import";
  }
  if (ts.isShorthandPropertyAssignment(parent)) return "shorthand_property";
  return null;
}

const totals = {
  files: 0,
  declarations: 0,
  occurrences: 0,
  uniqueDeclarations: new Set(),
  uniqueIdentifiers: new Set(),
  kinds: {},
};
const offenders = [];

for (const root of roots) {
  let rootDeclarations = 0;
  let rootOccurrences = 0;
  for (const filePath of collectFiles(root)) {
    const source = fs.readFileSync(filePath, "utf8");
    const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );
    let fileDeclarations = 0;
    let fileOccurrences = 0;

    const visit = (node) => {
      if (ts.isIdentifier(node) && cjkPattern.test(node.text)) {
        fileOccurrences += 1;
        totals.occurrences += 1;
        totals.uniqueIdentifiers.add(node.text);
        const kind = declarationKind(node);
        if (kind) {
          fileDeclarations += 1;
          totals.declarations += 1;
          totals.uniqueDeclarations.add(node.text);
          totals.kinds[kind] = (totals.kinds[kind] ?? 0) + 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (fileOccurrences > 0) {
      totals.files += 1;
      rootDeclarations += fileDeclarations;
      rootOccurrences += fileOccurrences;
      offenders.push({
        file: filePath,
        declarations: fileDeclarations,
        occurrences: fileOccurrences,
      });
    }
  }
  console.log(
    JSON.stringify({
      scope: root,
      declarations: rootDeclarations,
      occurrences: rootOccurrences,
    }),
  );
}

const summary = {
  files: totals.files,
  declarations: totals.declarations,
  occurrences: totals.occurrences,
  uniqueDeclarations: totals.uniqueDeclarations.size,
  uniqueIdentifiers: totals.uniqueIdentifiers.size,
  kinds: totals.kinds,
};
console.log(JSON.stringify({ scope: "total", ...summary }));

if (process.argv.includes("--details")) {
  offenders
    .sort((left, right) => right.declarations - left.declarations)
    .forEach((entry) => console.log(JSON.stringify(entry)));
}

if (checkOnly && totals.declarations > 0) process.exit(1);
