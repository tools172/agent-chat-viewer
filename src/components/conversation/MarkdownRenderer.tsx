import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface MarkdownRendererProps {
  content: string;
  /** 允许 <mark> 等 HTML 标签（用于搜索高亮） */
  allowHtml?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
  content,
  allowHtml,
}) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? [rehypeRaw] : []}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}, (prev, next) => prev.content === next.content && prev.allowHtml === next.allowHtml);
