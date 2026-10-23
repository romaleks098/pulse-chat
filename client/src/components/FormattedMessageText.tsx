import React, { useState } from 'react';

interface FormattedMessageTextProps {
  text: string;
  className?: string;
  isOutgoing?: boolean;
}

export const Spoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((prev) => !prev);
      }}
      className={`cursor-pointer transition-all duration-150 rounded px-1 inline-block ${
        revealed
          ? 'bg-black/15 filter-none select-text'
          : 'filter blur-[5px] bg-white/20 select-none hover:bg-white/30'
      }`}
      title={revealed ? 'Спойлер (кликните, чтобы скрыть)' : 'Спойлер (кликните, чтобы прочитать)'}
    >
      {children}
    </span>
  );
};

export const FormattedMessageText: React.FC<FormattedMessageTextProps> = ({
  text,
  className = '',
  isOutgoing = false,
}) => {
  if (!text) return null;

  // Regex breakdown:
  // 1. Code blocks: ```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```
  // 2. Inline code: `([^`\n]+)`
  // 3. Spoilers: \|\|([^|]+)\|\|
  // 4. Bold: \*\*([^*]+)\*\*
  // 5. Italic: \*([^*]+)\*
  // 6. Strikethrough: ~~([^~]+)~~
  // 7. URLs: (https?:\/\/[^\s]+)

  const tokenRegex = /(```[\s\S]*?```|`[^`\n]+`|\|\|[\s\S]+?\|\||\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|https?:\/\/[^\s<]+|t\.me\/[^\s<]+)/g;

  const parts = text.split(tokenRegex);

  return (
    <span className={`whitespace-pre-wrap break-words leading-relaxed select-text ${className}`}>
      {parts.map((part, index) => {
        if (!part) return null;

        // Code block
        if (part.startsWith('```') && part.endsWith('```')) {
          const raw = part.slice(3, -3);
          const firstLineBreak = raw.indexOf('\n');
          let codeContent = raw;
          let lang = '';
          if (firstLineBreak !== -1) {
            lang = raw.slice(0, firstLineBreak).trim();
            codeContent = raw.slice(firstLineBreak + 1);
          }
          return (
            <pre
              key={index}
              className="my-1.5 p-2.5 rounded-xl bg-black/40 text-[12px] font-mono text-emerald-300 overflow-x-auto border border-white/10"
            >
              {lang && <span className="block text-[10px] uppercase text-slate-400 mb-1">{lang}</span>}
              <code>{codeContent}</code>
            </pre>
          );
        }

        // Inline code
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={index}
              className="px-1.5 py-0.5 rounded-md bg-black/30 font-mono text-[12px] text-amber-200 border border-white/10 mx-0.5"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        // Spoiler: ||spoiler text||
        if (part.startsWith('||') && part.endsWith('||') && part.length > 4) {
          return (
            <Spoiler key={index}>
              {part.slice(2, -2)}
            </Spoiler>
          );
        }

        // Bold: **text**
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={index} className="font-bold">
              {part.slice(2, -2)}
            </strong>
          );
        }

        // Italic: *text*
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <em key={index} className="italic">
              {part.slice(1, -1)}
            </em>
          );
        }

        // Strikethrough: ~~text~~
        if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
          return (
            <del key={index} className="line-through opacity-70">
              {part.slice(2, -2)}
            </del>
          );
        }

        // URLs: http:// or https:// or t.me/
        if (part.startsWith('http://') || part.startsWith('https://') || part.startsWith('t.me/')) {
          const href = part.startsWith('t.me/') ? `https://${part}` : part;
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`underline underline-offset-2 break-all ${
                isOutgoing ? 'text-white hover:text-indigo-100 font-medium' : 'text-indigo-400 hover:text-indigo-300'
              }`}
            >
              {part}
            </a>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};
