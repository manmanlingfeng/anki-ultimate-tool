interface Props {
  html: string;
  className?: string;
  /** If true, lists display inline (comma-separated) instead of vertical with bullets */
  inline?: boolean;
}

/**
 * Renders HTML content safely.
 * Used for Anki card fields that may contain HTML formatting like <ul>, <li>, <b>, etc.
 *
 * @param inline - When true, lists render horizontally without bullets (for table cells, centered text)
 */
export function HtmlContent({ html, className, inline = false }: Props) {
  if (!html) return null;

  return (
    <span
      className={`${inline ? 'html-inline' : ''} ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
