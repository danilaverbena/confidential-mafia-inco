"use client";

import { Fragment, useState, type ReactNode } from "react";

// A tiny Solidity highlighter (no library, so it stays CSP-clean). Colors are
// tuned for the navy background: kit calls pop, keywords and types are calm.
const COMMENT = "#565f89";
const KEYWORD = "#bb9af7";
const TYPE = "#2ac3de";
const FUNC = "#7aa2f7";
const NUM = "#ff9e64";

const RULES: { re: RegExp; c?: string }[] = [
  { re: /(contract|function|for|external|payable|returns|memory|storage|public|private|internal|view|constructor|is)\b/y, c: KEYWORD },
  { re: /(euint256|elist|uint256|uint16|uint8|uint|address|bool)\b/y, c: TYPE },
  { re: /_[A-Za-z][A-Za-z0-9_]*/y, c: FUNC }, // kit calls / internal fns
  { re: /\d+/y, c: NUM },
  { re: /[A-Za-z_$][A-Za-z0-9_$]*/y }, // plain identifier
  { re: /\s+/y }, // whitespace (preserved by <pre>)
];

function highlightCode(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < code.length) {
    let hit = false;
    for (const { re, c } of RULES) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i) {
        out.push(c ? <span key={key++} style={{ color: c }}>{m[0]}</span> : <Fragment key={key++}>{m[0]}</Fragment>);
        i += m[0].length;
        hit = true;
        break;
      }
    }
    if (!hit) { out.push(<Fragment key={key++}>{code[i]}</Fragment>); i++; }
  }
  return out;
}

// One line: code is highlighted, the trailing comment is dimmed.
function Line({ line }: { line: string }) {
  const idx = line.indexOf("//");
  const codePart = idx >= 0 ? line.slice(0, idx) : line;
  const comment = idx >= 0 ? line.slice(idx) : "";
  return (
    <div>
      {highlightCode(codePart)}
      {comment && <span style={{ color: COMMENT }}>{comment}</span>}
    </div>
  );
}

// Collapsible Solidity peek. Collapsed by default so it never crowds the UI.
export function CodePeek({ code, title = "see the solidity" }: { code: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
      >
        <span>{title}</span>
        <span className="text-primary">{open ? "-" : "+"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-border bg-background/60 p-3 text-[11px] leading-relaxed text-foreground/90">
          <code>
            {code.split("\n").map((line, i) => <Line key={i} line={line} />)}
          </code>
        </pre>
      )}
    </div>
  );
}
