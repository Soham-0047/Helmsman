"use client";
import { marked } from "marked";
import { useMemo } from "react";

export function MarkdownPreview({ source }: { source: string }) {
  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(source || "*Nothing to preview yet.*") as string;
  }, [source]);
  return <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
