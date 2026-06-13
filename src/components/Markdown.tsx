"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// 채팅/생성 텍스트의 마크다운 렌더. raw HTML 비활성(기본) → 저장형 XSS 안전.
// 채팅 말풍선 안에서 자연스럽도록 여백·코드·링크만 가볍게 스타일.
const components: Components = {
  a: ({ ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-accent underline" />
  ),
  p: ({ ...props }) => <p {...props} className="my-1 first:mt-0 last:mb-0" />,
  ul: ({ ...props }) => <ul {...props} className="my-1 list-disc pl-5" />,
  ol: ({ ...props }) => <ol {...props} className="my-1 list-decimal pl-5" />,
  li: ({ ...props }) => <li {...props} className="my-0.5" />,
  h1: ({ ...props }) => <h1 {...props} className="my-1.5 text-base font-semibold" />,
  h2: ({ ...props }) => <h2 {...props} className="my-1.5 text-base font-semibold" />,
  h3: ({ ...props }) => <h3 {...props} className="my-1 text-sm font-semibold" />,
  strong: ({ ...props }) => <strong {...props} className="font-semibold" />,
  blockquote: ({ ...props }) => (
    <blockquote {...props} className="my-1 border-l-2 border-border pl-2 opacity-80" />
  ),
  hr: () => <hr className="my-2 border-border" />,
  pre: ({ ...props }) => (
    <pre {...props} className="my-1.5 overflow-x-auto rounded-control bg-bg p-2.5 text-xs ring-1 ring-border" />
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className || "");
    return isBlock ? (
      <code {...props} className={className}>
        {children}
      </code>
    ) : (
      <code {...props} className="rounded bg-bg px-1 py-0.5 text-[0.85em] ring-1 ring-border">
        {children}
      </code>
    );
  },
  table: ({ ...props }) => (
    <div className="my-1.5 overflow-x-auto">
      <table {...props} className="border-collapse text-xs" />
    </div>
  ),
  th: ({ ...props }) => <th {...props} className="border border-border px-2 py-0.5 text-left" />,
  td: ({ ...props }) => <td {...props} className="border border-border px-2 py-0.5" />,
};

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
