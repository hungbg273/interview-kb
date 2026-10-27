/** Only for Markdown note output; never append to structured JSON tasks. */
export const MARKDOWN_FORMAT = [
  'Return Markdown content only. Do not wrap the entire response in a code fence or add introductory commentary.',
  'Use clear headings, lists, tables when useful, and fenced code blocks with the correct language label. Do not output raw HTML or SVG.',
  'When a diagram helps, use a fenced ```mermaid block with valid Mermaid syntax. Prefer flowchart or sequenceDiagram; keep diagrams small.',
  'For flowcharts use simple ASCII node IDs and quoted labels, for example A["Người dùng"] --> B["API"]. Do not use ASCII-art diagrams.',
  'Do not include Mermaid init directives, YAML configuration, HTML labels, scripts, click actions or external resources.',
  'Preserve existing code and Mermaid syntax when translating; translate prose and diagram labels without changing node IDs or relationships. Do not invent diagrams when only translating.',
].join('\n');
