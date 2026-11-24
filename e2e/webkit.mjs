import { strict as assert } from "node:assert";

const driver = process.env.WEBKIT_DRIVER_URL ?? "http://127.0.0.1:4445";
const page =
  process.env.WEBKIT_E2E_URL ??
  "http://127.0.0.1:5274/e2e/index.html?webkitProbe=1";

const key = {
  backspace: "\ue003",
  escape: "\ue00c",
  left: "\ue012",
  right: "\ue014",
  delete: "\ue017",
};

async function request(path, init = {}) {
  const response = await fetch(`${driver}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok || body.value?.error) {
    throw new Error(`${path}: ${body.value?.message ?? JSON.stringify(body)}`);
  }
  return body.value;
}

function post(path, value) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(value),
  });
}

async function main() {
  const session = await post("/session", {
    capabilities: { alwaysMatch: { browserName: "MiniBrowser" } },
  });
  const sessionPath = `/session/${session.sessionId}`;

  try {
    await post(`${sessionPath}/url`, { url: page });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probeReady = await post(`${sessionPath}/execute/sync`, {
        script: "return !!window.__notaWebkitProbe;",
        args: [],
      });
      if (probeReady) {
        ready = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.ok(ready, "WebKit probe did not become ready");

    await post(`${sessionPath}/execute/async`, {
      script:
        "const done=arguments[arguments.length-1];" +
        "window.__notaWebkitProbe.mount(arguments[0]).then(done,e=>done(String(e)));",
      args: [""],
    });

    const element = async (selector) => {
      const found = await post(`${sessionPath}/element`, {
        using: "css selector",
        value: selector,
      });
      return found["element-6066-11e4-a52e-4f735466cecf"];
    };
    const press = (keys) => {
      const actions = [];
      for (const character of keys) {
        actions.push(
          { type: "keyDown", value: character },
          { type: "keyUp", value: character },
          { type: "pause", duration: 40 },
        );
      }
      return post(`${sessionPath}/actions`, {
        actions: [{ type: "key", id: "keyboard", actions }],
      });
    };
    const execute = async (script) => {
      const result = await post(`${sessionPath}/execute/sync`, {
        script,
        args: [],
      });
      return result;
    };
    const mount = async (markdown = "", options = {}) => {
      await post(`${sessionPath}/execute/async`, {
        script:
          "const done=arguments[arguments.length-1];" +
          "window.__notaWebkitProbe.mount(arguments[0],arguments[1]).then(done,e=>done(String(e)));",
        args: [markdown, options],
      });
      return element(".ProseMirror");
    };
    const state = () =>
      execute(
        "return {md:window.__notaWebkitProbe.markdown()," +
          "html:window.__notaWebkitProbe.html()," +
          "sel:window.__notaWebkitProbe.selectionRange()," +
          "dom:window.__notaWebkitProbe.domSelection()};",
      );

    let editor = await element(".ProseMirror");
    await press(["#"]);
    let current = await state();
    assert.equal(current.dom.focus, 1, JSON.stringify(current));
    await press([" "]);
    current = await state();
    assert.equal(current.dom.focus, 2, JSON.stringify(current));
    await press([" ", " "]);
    current = await state();
    assert.equal(current.md, "#   ");
    assert.equal(current.dom.focus, 4, JSON.stringify(current));

    await press([key.backspace]);
    current = await state();
    assert.equal(current.md, "#  ");

    editor = await mount("", {
      autoPair: true,
      keyboardExperience: true,
    });
    await press([
      "#",
      " ",
      "n",
      "o",
      "t",
      "a",
      key.backspace,
      key.backspace,
      key.backspace,
      key.backspace,
      "n",
      "o",
      "t",
      "a",
    ]);
    current = await state();
    assert.equal(current.md, "# nota");
    assert.ok(!current.html.includes("nota-syntax-marker"));

    editor = await mount("", {
      autoPair: true,
      keyboardExperience: true,
      vim: true,
    });
    await press(["i"]);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    await press(["#", " "]);
    current = await state();
    assert.equal(current.md, "# ");
    assert.equal(current.sel.head, 3);
    assert.equal(current.dom.focus, 2);

    editor = await mount("$\\LaTeX$");
    await press([key.right]);
    let input = await element(".nota-math-source");
    await press([key.escape]);
    await press([key.backspace]);
    current = await state();
    assert.equal(current.md, "$\\LaTeX");

    editor = await mount("$\\LaTeX$");
    await press([key.right]);
    input = await element(".nota-math-source");
    await press([key.left]);
    await press([key.delete]);
    current = await state();
    assert.equal(current.md, "\\LaTeX$");

    editor = await mount("$x$ price \\$5");
    await press([key.right]);
    const metrics = await execute(
      "const p=document.querySelector('.ProseMirror p');" +
        "const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);" +
        "let t=null,idx=-1;" +
        "for(let n=w.nextNode();n;n=w.nextNode()){" +
        "if(n.parentElement?.closest('.nota-math-inline'))continue;" +
        "idx=n.textContent.indexOf('$');if(idx>=0){t=n;break;}}" +
        "const r=document.createRange();r.setStart(t,idx);r.setEnd(t,idx+1);" +
        "const a=r.getBoundingClientRect();" +
        "const d=document.querySelector('.nota-math-inline.nota-math-editing .nota-math-delim');" +
        "const b=d.getBoundingClientRect();" +
        "return {literal:{top:a.top,bottom:a.bottom,height:a.height}," +
        "delimiter:{top:b.top,bottom:b.bottom,height:b.height}};",
    );
    assert.ok(Math.abs(metrics.literal.height - metrics.delimiter.height) <= 1);
    assert.ok(Math.abs(metrics.literal.top - metrics.delimiter.top) <= 1);
    assert.ok(Math.abs(metrics.literal.bottom - metrics.delimiter.bottom) <= 1);

    console.log("WebKit E2E: 7/7 passed");
  } finally {
    await request(sessionPath, { method: "DELETE" }).catch(() => undefined);
  }
}

await main();
