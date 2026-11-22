#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["src", "tests", "src-tauri/src"];
const sourceExtensions = new Set([".rs", ".ts", ".tsx"]);
const checkOnly = process.argv.includes("--check");
const details = process.argv.includes("--details");

// Common English words such as "can", "long", and "use" are deliberately
// excluded from this set because they are also valid pinyin syllables.
const pinyinSyllables = new Set(
  `
  ba bai bang bao bei ben beng bi bian biao bie bing bo bu
  cai cang ce ceng cha chai chan chang chao che cheng chi chong
  chu chuan chuang chun ci cong cuo cun
  da dai dan dang dao deng di dian diao die ding diu dong dou du duan dui duo
  er fa fang fei fen feng fu
  gai gan gang gao gei gen geng gong gou gu gua guai guan gui guo
  hai han hao heng hong hou hu hua huai huan hui hun huo
  ji jia jian jiang jiao jie jin jing jiu ju jue
  kai kan ke kong kou ku kua kuai kuan kuang kuo
  lai lan lao lei leng li lian liang lie lin ling liu lu lun luo lve
  man mao mei men mian miao ming mo mu
  na nei neng niu nuo
  pa pai pan pang pao pei peng pi pian pie ping pu
  qi qia qian qie qing qiu qu quan que
  reng ren ri rong ru ruan
  san se sha shan shang shao shen sheng shi shou shu shua shuang shui shun shuo
  si song su suan sui suo
  ta tai tan tao ti tian tiao ting tong tou tu tui tuo
  wan wang wei wen wu
  xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xun
  ya yan yang yao ye yi yin ying yong yu yuan yue yun
  zai zang zao ze zeng zha zhan zhang zhao zhen zheng zhi zhong zhou
  zhu zhuan zhuang zhui zhun zhuo zi zong zou zu zui zuo
  `
    .trim()
    .split(/\s+/),
);

function collect(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file, files);
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(file);
  }
  return files;
}

function maskRust(source) {
  const output = source.split("");
  let index = 0;
  const blank = (from, to) => {
    for (let cursor = from; cursor < to; cursor += 1) {
      if (output[cursor] !== "\n" && output[cursor] !== "\r") output[cursor] = " ";
    }
  };

  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      const stop = end < 0 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        if (source.startsWith("/*", cursor)) {
          depth += 1;
          cursor += 2;
        } else if (source.startsWith("*/", cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      blank(index, cursor);
      index = cursor;
      continue;
    }

    const character = /^(?:b)?'(?:\\.|\\u\{[0-9a-fA-F]+\}|[^'\\\r\n])'/.exec(
      source.slice(index),
    );
    if (character) {
      blank(index, index + character[0].length);
      index += character[0].length;
      continue;
    }

    const raw = /^(?:b?r)(#*)"/.exec(source.slice(index));
    if (raw) {
      const closer = `"${raw[1]}`;
      const end = source.indexOf(closer, index + raw[0].length);
      const stop = end < 0 ? source.length : end + closer.length;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (source[index] === '"' || source.startsWith('b"', index)) {
      let cursor = source[index] === '"' ? index + 1 : index + 2;
      while (cursor < source.length) {
        if (source[cursor] === "\\") cursor += 2;
        else if (source[cursor] === '"') {
          cursor += 1;
          break;
        } else {
          cursor += 1;
        }
      }
      blank(index, cursor);
      index = cursor;
      continue;
    }
    index += 1;
  }
  return output.join("");
}

function parts(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split("_")
    .filter(Boolean);
}

function isPinyin(identifier) {
  return parts(identifier).some((part) => pinyinSyllables.has(part));
}

function rustIdentifiers(source) {
  return maskRust(source).match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
}

function typescriptIdentifiers(file, source) {
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const identifiers = [];
  const isDeclaration = (identifier) => {
    const parent = identifier.parent;
    if (!parent || !("name" in parent) || parent.name !== identifier) return false;
    return (
      ts.isVariableDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isArrowFunction(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isEnumMember(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent)
    );
  };
  const visit = (node) => {
    if (ts.isIdentifier(node) && isDeclaration(node)) identifiers.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return identifiers;
}

const offenders = [];
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const file of collect(root)) {
    const source = fs.readFileSync(file, "utf8");
    const identifiers = file.endsWith(".rs")
      ? rustIdentifiers(source)
      : typescriptIdentifiers(file, source);
    const matches = [...new Set(identifiers.filter(isPinyin))].sort();
    if (matches.length) {
      offenders.push({ file: file.split(path.sep).join("/"), identifiers: matches });
    }
  }
}

if (details) {
  for (const offender of offenders) {
    console.log(`${offender.file}: ${offender.identifiers.join(", ")}`);
  }
}

console.log(
  JSON.stringify({
    files: offenders.length,
    identifiers: offenders.reduce((total, entry) => total + entry.identifiers.length, 0),
  }),
);

if (checkOnly && offenders.length) process.exit(1);
