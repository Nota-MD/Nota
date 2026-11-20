import { readFileSync } from "node:fs";

let pass = 0;
function test(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

const contributing = readFileSync("CONTRIBUTING.md", "utf8");
const pr = readFileSync(".github/pull_request_template.md", "utf8");
const agents = readFileSync("AGENTS.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const readmeZh = readFileSync("README.zh-CN.md", "utf8");

test("AI contributions are explicitly welcome", () => {
  if (!contributing.includes("explicitly supports contributions")) {
    throw new Error("CONTRIBUTING does not explicitly welcome AI contributions");
  }
  if (!agents.includes("AI-assisted contributions are welcome")) {
    throw new Error("AGENTS is missing the AI contribution rule");
  }
});

test("Submitter testing is mandatory", () => {
  if (!contributing.includes("Personally test every contributed behavior")) {
    throw new Error("CONTRIBUTING does not require personal testing");
  }
  if (!pr.includes("Personal testing by the submitter")) {
    throw new Error("PR template is missing personal testing");
  }
  if (!pr.includes("the AI said it tested this")) {
    throw new Error("PR template does not reject AI-only test claims");
  }
});

test("PR template requires AI scope and licensing responsibility", () => {
  if (!pr.includes("AI disclosure")) throw new Error("AI disclosure is missing");
  if (!pr.includes("licensing")) throw new Error("Licensing responsibility is missing");
});

test("English README contains no Chinese", () => {
  if (/[\u3400-\u9fff]/.test(readme)) throw new Error("README.md contains Chinese");
});

test("README language entry points are bidirectional", () => {
  if (!readme.includes('href="README.zh-CN.md"')) {
    throw new Error("English README lacks a Chinese link");
  }
  if (!readme.includes("<strong>English</strong>")) {
    throw new Error("English README does not mark English as current");
  }
  if (!readmeZh.includes('href="README.md"')) {
    throw new Error("Chinese README lacks an English link");
  }
  if (!readmeZh.includes("<strong>简体中文</strong>")) {
    throw new Error("Chinese README does not mark Chinese as current");
  }
});

test("Contribution rules define README translation naming", () => {
  if (!contributing.includes("README.<BCP-47>.md")) {
    throw new Error("README translation naming rule is missing");
  }
  if (!contributing.includes("only English source version")) {
    throw new Error("English source README rule is missing");
  }
});

console.log(`${pass} passed`);
