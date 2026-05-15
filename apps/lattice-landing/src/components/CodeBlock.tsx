"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

type Variant = "panel" | "inline";

type Token = { type: TokenType; text: string };

type TokenType =
  | "txt"
  | "key"
  | "str"
  | "num"
  | "bool"
  | "null"
  | "kw"
  | "fn"
  | "flag"
  | "comment"
  | "header";

const PY_KEYWORDS = new Set([
  "from",
  "import",
  "as",
  "def",
  "return",
  "class",
  "if",
  "elif",
  "else",
  "for",
  "in",
  "while",
  "with",
  "try",
  "except",
  "finally",
  "raise",
  "yield",
  "lambda",
  "pass",
  "break",
  "continue",
  "None",
  "True",
  "False",
  "and",
  "or",
  "not",
  "is",
]);

const PY_BUILTINS = new Set(["print", "len", "range", "str", "int", "float", "list", "dict", "set"]);

function detectLanguage(source: string): "json" | "shellish" {
  const trimmed = source.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "shellish";
}

function tokenizeJson(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ type: "txt", text: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === '"') {
      flush();
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) j += 2;
        else j += 1;
      }
      j = Math.min(j + 1, src.length);
      const strText = src.slice(i, j);
      let k = j;
      while (k < src.length && /\s/.test(src[k])) k += 1;
      const isKey = src[k] === ":";
      out.push({ type: isKey ? "key" : "str", text: strText });
      i = j;
      continue;
    }

    if (/[-\d]/.test(ch) && (ch !== "-" || /\d/.test(src[i + 1] ?? ""))) {
      flush();
      let j = i;
      if (src[j] === "-") j += 1;
      while (j < src.length && /[\d.eE+\-]/.test(src[j])) {
        const nxt = src[j];
        if ((nxt === "+" || nxt === "-") && !/[eE]/.test(src[j - 1] ?? "")) break;
        j += 1;
      }
      out.push({ type: "num", text: src.slice(i, j) });
      i = j;
      continue;
    }

    if (/[a-z]/.test(ch)) {
      flush();
      let j = i;
      while (j < src.length && /[a-z]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      if (word === "true" || word === "false") out.push({ type: "bool", text: word });
      else if (word === "null") out.push({ type: "null", text: word });
      else {
        buf = word;
        flush();
      }
      i = j;
      continue;
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function tokenizeShellish(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let buf = "";
  let atLineStart = true;
  const flush = () => {
    if (buf) {
      out.push({ type: "txt", text: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    const ch = src[i];
    const prev = src[i - 1];

    if (ch === "\n") {
      buf += ch;
      atLineStart = true;
      i += 1;
      continue;
    }

    // HTTP header line: WORD-WORD: value  (only at start of line)
    if (atLineStart && /[A-Z]/.test(ch)) {
      const lineEnd = src.indexOf("\n", i);
      const line = src.slice(i, lineEnd === -1 ? src.length : lineEnd);
      const headerMatch = line.match(/^([A-Z][\w-]*):\s*(.+)$/);
      if (headerMatch) {
        flush();
        out.push({ type: "header", text: headerMatch[1] });
        out.push({ type: "txt", text: ": " });
        out.push({ type: "str", text: headerMatch[2] });
        i += line.length;
        atLineStart = false;
        continue;
      }
    }

    if (ch === "#") {
      flush();
      let j = i;
      while (j < src.length && src[j] !== "\n") j += 1;
      out.push({ type: "comment", text: src.slice(i, j) });
      i = j;
      atLineStart = false;
      continue;
    }

    if (ch === '"' || ch === "'") {
      flush();
      const quote = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < src.length) j += 2;
        else j += 1;
      }
      j = Math.min(j + 1, src.length);
      out.push({ type: "str", text: src.slice(i, j) });
      i = j;
      atLineStart = false;
      continue;
    }

    if (
      ch === "-" &&
      (prev === undefined || /[\s=]/.test(prev)) &&
      (src[i + 1] === "-" || /[a-zA-Z]/.test(src[i + 1] ?? ""))
    ) {
      flush();
      let j = i;
      while (j < src.length && (src[j] === "-" || /[\w]/.test(src[j]))) j += 1;
      out.push({ type: "flag", text: src.slice(i, j) });
      i = j;
      atLineStart = false;
      continue;
    }

    if (/\d/.test(ch) && !(prev && /[a-zA-Z_]/.test(prev))) {
      flush();
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j])) j += 1;
      out.push({ type: "num", text: src.slice(i, j) });
      i = j;
      atLineStart = false;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      flush();
      let j = i;
      while (j < src.length && /[\w]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      if (PY_KEYWORDS.has(word)) {
        out.push({ type: "kw", text: word });
      } else if (PY_BUILTINS.has(word) || src[j] === "(") {
        out.push({ type: "fn", text: word });
      } else {
        buf = word;
        flush();
      }
      i = j;
      atLineStart = false;
      continue;
    }

    if (!/\s/.test(ch)) atLineStart = false;
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function tokenize(source: string): Token[] {
  return detectLanguage(source) === "json" ? tokenizeJson(source) : tokenizeShellish(source);
}

export function CodeBlock({
  children,
  compact = false,
  variant = "panel",
}: {
  children: string;
  compact?: boolean;
  variant?: Variant;
}) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => tokenize(children), [children]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(children);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = children;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        // some embedded browsers block clipboard writes
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const wrapperClass = `code-block-wrap variant-${variant}${compact ? " compact" : ""}`;
  const preClass = variant === "inline" ? "api-code" : compact ? "code-panel compact-code" : "code-panel";

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        className={copied ? "code-block-copy copied" : "code-block-copy"}
        onClick={onCopy}
        aria-label="Copy code"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <pre className={preClass}>
        <code>
          {tokens.map((tok, idx) =>
            tok.type === "txt" ? (
              <span key={idx}>{tok.text}</span>
            ) : (
              <span className={`tok-${tok.type}`} key={idx}>
                {tok.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
