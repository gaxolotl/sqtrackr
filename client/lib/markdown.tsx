import type { ReactNode } from "react";

const inlinePattern =
  /(`[^`\n]+`)|(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(!\[([^\]\n]*)\]\(([^)\s]+)\))|(\[([^\]\n]+)\]\(([^)\s]+)\))/g;

function renderInline(value: string, depth = 0): ReactNode[] {
  if (depth > 6) return [value];
  const nodes: ReactNode[] = [];
  // React escapes text nodes, so pre-escaping here would display entities such
  // as &#39; literally instead of rendering the original apostrophe.
  const source = value;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  // Use a fresh regex per invocation: renderInline recurses, and sharing one
  // global /g regex would let an inner call reset lastIndex and loop forever.
  const pattern = new RegExp(inlinePattern.source, inlinePattern.flags);

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
    if (match[1]) {
      nodes.push(<code key={index}>{match[1].slice(1, -1)}</code>);
    } else if (match[2]) {
      nodes.push(
        <strong key={index}>{renderInline(match[3], depth + 1)}</strong>,
      );
    } else if (match[4]) {
      nodes.push(<em key={index}>{renderInline(match[5], depth + 1)}</em>);
    } else if (match[6]) {
      const alt = match[7];
      const src = match[8];
      if (/^https?:\/\//i.test(src) || src.startsWith("/")) {
        nodes.push(
          // User-supplied remote images cannot use next/image (unknown hosts).
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={src} alt={alt} loading="lazy" />,
        );
      } else {
        nodes.push(alt);
      }
    } else if (match[9]) {
      const label = match[10];
      const href = match[11];
      if (
        /^https?:\/\//i.test(href) ||
        href.startsWith("/") ||
        href.startsWith("#")
      ) {
        nodes.push(
          <a
            href={href}
            key={index}
            target={
              href.startsWith("/") || href.startsWith("#")
                ? undefined
                : "_blank"
            }
            rel="noreferrer noopener"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    }
    cursor = pattern.lastIndex;
    index += 1;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let blockKey = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={blockKey}>{renderInline(paragraph.join(" "))}</p>);
      paragraph = [];
      blockKey += 1;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    if (line.trim().startsWith("```")) {
      flushParagraph();
      const language = line.trim().slice(3).trim();
      const languageClass = language.replace(/[^a-z0-9_-]/gi, "");
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre key={blockKey}>
          <code
            className={languageClass ? `language-${languageClass}` : undefined}
          >
            {code.join("\n")}
          </code>
        </pre>,
      );
      blockKey += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length, 6);
      const headingKey = blockKey;
      const content = renderInline(heading[2]);
      if (level === 1) blocks.push(<h1 key={headingKey}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={headingKey}>{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={headingKey}>{content}</h3>);
      else if (level === 4) blocks.push(<h4 key={headingKey}>{content}</h4>);
      else if (level === 5) blocks.push(<h5 key={headingKey}>{content}</h5>);
      else blocks.push(<h6 key={headingKey}>{content}</h6>);
      blockKey += 1;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      flushParagraph();
      blocks.push(<hr key={blockKey} />);
      blockKey += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(
          <li key={items.length}>
            {renderInline(lines[i].replace(/^[-*]\s+/, ""))}
          </li>,
        );
        i += 1;
      }
      blocks.push(<ul key={blockKey}>{items}</ul>);
      blockKey += 1;
      i -= 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(
          <li key={items.length}>
            {renderInline(lines[i].replace(/^\d+\.\s+/, ""))}
          </li>,
        );
        i += 1;
      }
      blocks.push(<ol key={blockKey}>{items}</ol>);
      blockKey += 1;
      i -= 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={blockKey}>{renderInline(quote.join(" "))}</blockquote>,
      );
      blockKey += 1;
      i -= 1;
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return <div className="markdown-body">{blocks}</div>;
}
