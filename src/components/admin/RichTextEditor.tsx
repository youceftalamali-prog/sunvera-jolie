"use client";

import { useEffect, useRef } from "react";

const BLOCKS: [string, string][] = [
  ["bold", "B"],
  ["italic", "I"],
  ["underline", "U"],
  ["formatBlock:h3", "H3"],
  ["formatBlock:p", "¶"],
  ["insertUnorderedList", "• List"],
  ["insertOrderedList", "1. List"],
  ["justifyLeft", "L"],
  ["justifyCenter", "C"],
  ["justifyRight", "R"],
  ["createLink", "Link"],
  ["insertImage", "Img"],
  ["insertTable", "Table"],
  ["removeFormat", "Clear"],
];

export default function RichTextEditor({
  value,
  onChange,
  label = "Content",
  height = 320,
}: {
  value: string;
  onChange: (html: string) => void;
  label?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(command: string) {
    const [cmd, arg] = command.split(":");
    if (cmd === "createLink") {
      const url = window.prompt("Link URL", "https://");
      if (!url) return;
      document.execCommand("createLink", false, url);
    } else if (cmd === "insertImage") {
      const url = window.prompt("Image URL", "https://");
      if (!url) return;
      document.execCommand("insertImage", false, url);
    } else if (cmd === "insertTable") {
      const rows = Number(window.prompt("Rows", "3") ?? 0);
      const cols = Number(window.prompt("Columns", "2") ?? 0);
      if (!rows || !cols) return;
      const html = `<table><tbody>${Array.from({ length: rows })
        .map(() => `<tr>${Array.from({ length: cols }).map(() => "<td>&nbsp;</td>").join("")}</tr>`)
        .join("")}</tbody></table><p></p>`;
      document.execCommand("insertHTML", false, html);
    } else {
      document.execCommand(cmd, false, arg);
    }
    if (ref.current) onChange(ref.current.innerHTML);
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1 border border-[var(--svj-border)] bg-white p-1.5">
        {BLOCKS.map(([cmd, text]) => (
          <button
            key={cmd}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(cmd)}
            className="border border-[var(--svj-border)] px-2 py-1 text-[11px] hover:bg-[var(--svj-background)]"
          >
            {text}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="rich-content overflow-y-auto border border-t-0 border-[var(--svj-border)] bg-white p-3 text-sm outline-none"
        style={{ minHeight: height }}
      />
      <p className="mt-1 text-[10px] text-[var(--svj-muted)]">
        Rich text: bold, italic, headings, lists, links, images, tables, alignment. Stored as HTML.
      </p>
    </div>
  );
}
