import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Custom renderer for code blocks
const CodeBlock: React.FC<{ children: string; className?: string }> = ({ children, className }) => {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  
  if (language) {
    return (
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        customStyle={{
          margin: '8px 0',
          borderRadius: '6px',
          fontSize: '13px',
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  }
  
  return (
    <code style={{
      background: 'rgba(110, 118, 129, 0.4)',
      padding: '2px 6px',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '0.9em'
    }}>
      {children}
    </code>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  // Guard: react-markdown calls .split() internally — bail out on empty/undefined content
  if (!content) return null;

  return (
    <div className={`markdown-content ${className || ''}`} style={{
      wordBreak: 'break-word',
      lineHeight: '1.5',
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const inline = !className;
            if (inline) {
              return <code className={className} {...props}>{children}</code>;
            }
            return <CodeBlock className={className}>{String(children)}</CodeBlock>;
          },
          a({ node, children, href, ...props }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: '#1abc9c', textDecoration: 'underline' }}
                {...props}
              >
                {children}
              </a>
            );
          },
          blockquote({ node, children, ...props }) {
            return (
              <blockquote style={{
                borderLeft: '4px solid #30363d',
                margin: '8px 0',
                paddingLeft: '16px',
                color: '#8b949e'
              }} {...props}>
                {children}
              </blockquote>
            );
          },
          ul({ node, children, ...props }) {
            return <ul style={{ margin: '8px 0', paddingLeft: '24px' }} {...props}>{children}</ul>;
          },
          ol({ node, children, ...props }) {
            return <ol style={{ margin: '8px 0', paddingLeft: '24px' }} {...props}>{children}</ol>;
          },
          li({ node, children, ...props }) {
            return <li style={{ margin: '4px 0' }} {...props}>{children}</li>;
          },
          strong({ node, children, ...props }) {
            return <strong style={{ fontWeight: 700 }} {...props}>{children}</strong>;
          },
          em({ node, children, ...props }) {
            return <em style={{ fontStyle: 'italic' }} {...props}>{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
