import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Compile the real module as Next does, then evaluate it before any React render.
const filename = fileURLToPath(
  new URL("../src/components/ui/liquid-glass-navbar.tsx", import.meta.url),
);
const source = readFileSync(filename, "utf8");
const jsx = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const compiled = transformSync(jsx, {
  filename,
  configFile: false,
  babelrc: false,
  parserOpts: { plugins: ["jsx"] },
  plugins: ["babel-plugin-react-compiler"],
}).code;
const js = ts.transpileModule(compiled, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(
  createRequire(import.meta.url),
  mod,
  mod.exports,
);
for (const name of ["home", "globe", "plane", "drop", "user"]) {
  assert.ok(
    isValidElement(mod.exports.NimbusIcons[name]),
    `Missing ${name} icon`,
  );
  assert.ok(
    renderToStaticMarkup(mod.exports.NimbusIcons[name]).includes("<svg"),
  );
}
assert.equal(typeof mod.exports.LiquidNavbar, "function");
const html = renderToStaticMarkup(createElement(mod.exports.LiquidNavbar));
assert.ok(html.includes('aria-label="Main"'));
assert.ok(html.includes("nimbus-water"));
assert.equal((html.match(/<button /g) || []).length, 5);
console.log(
  "PASS: React-compiled navbar initializes outside render without an invalid hook call.",
);
