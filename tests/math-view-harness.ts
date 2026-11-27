let pass = 0;
let fail = 0;
const failed: string[] = [];

export async function testCase(
  name: string,
  body: () => void | Promise<void>,
): Promise<void> {
  try {
    await body();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    fail += 1;
    failed.push(name);
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function group(name: string): void {
  console.log(`\n[${name}]`);
}

export function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

export function equal(
  actual: unknown,
  expected: unknown,
  description: string,
): void {
  if (actual !== expected) {
    throw new Error(`${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function flushRefresh(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function finishMathViewTests(): void {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log(`Failed:\n  - ${failed.join("\n  - ")}`);
    process.exitCode = 1;
  }
}
