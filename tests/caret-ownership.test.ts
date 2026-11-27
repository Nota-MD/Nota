import { textCaretOwner, textCaretOwnerSelector } from "../src/editor/caret-ownership";
import {
  dispatchCaretCommand,
  registerCaretSurface,
} from "../src/editor/caret-commander";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

testCase("inner text surfaces own caret navigation", () => {
  const owner = {} as Element;
  const target = {
    closest(selector: string) {
      return selector === textCaretOwnerSelector ? owner : null;
    },
  };
  assert(textCaretOwner(target) === owner, "the nearest inner editable surface was not returned");
});

testCase("ordinary document targets do not claim an inner caret", () => {
  assert(
    textCaretOwner({ closest: () => null }) === null,
    "a document target was mistaken for an inner editor",
  );
  assert(textCaretOwner(null) === null, "a missing target claimed caret ownership");
});

testCase("the shared selector covers inputs, CodeMirror and embedded source editors", () => {
  for (const selector of [
    "input",
    "textarea",
    ".cm-content",
    ".nota-math-source",
    ".nota-math-inline",
    ".nota-code-lang-input",
    ".nota-html-source",
    ".nota-diagram-source",
  ]) {
    assert(textCaretOwnerSelector.includes(selector), `missing caret owner ${selector}`);
  }
});

testCase("registered surfaces receive commands through the commander", () => {
  const element = {} as Element;
  const calls: string[] = [];
  const dispose = registerCaretSurface({
    element,
    kind: "test",
    handle(command) {
      calls.push(command.type);
      return command.type === "escape";
    },
  });
  const event = { target: element } as unknown as Event;
  assert(
    dispatchCaretCommand({ type: "escape" }, event),
    "a registered surface did not receive the caret command",
  );
  assert(!dispatchCaretCommand({ type: "move", key: "ArrowLeft" }, event), "unhandled command was consumed");
  dispose();
  assert(!dispatchCaretCommand({ type: "escape" }, event), "unregistered surface still received commands");
});

testCase("newer surface handlers take priority without bypassing the commander", () => {
  const element = {} as Element;
  const calls: string[] = [];
  const disposeFirst = registerCaretSurface({
    element,
    kind: "first",
    handle() {
      calls.push("first");
      return true;
    },
  });
  const disposeSecond = registerCaretSurface({
    element,
    kind: "second",
    handle() {
      calls.push("second");
      return true;
    },
  });
  dispatchCaretCommand({ type: "escape" }, { target: element } as unknown as Event);
  assert(calls.join(",") === "second", "handler priority did not follow registration order");
  disposeSecond();
  dispatchCaretCommand({ type: "escape" }, { target: element } as unknown as Event);
  assert(calls.join(",") === "second,first", "fallback handler was not reached");
  disposeFirst();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
