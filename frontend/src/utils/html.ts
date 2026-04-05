/**
 * HTML utility functions for cleaning and processing HTML content.
 */

/**
 * Strips wrapper <p> tags from single-line content for cleaner storage.
 * TipTap wraps all content in <p> tags by default.
 */
export function cleanHtml(html: string): string {
  if (!html) return '';
  // Remove empty paragraph tags
  if (html === '<p></p>') return '';
  // For single line content, unwrap from <p> tags
  const match = html.match(/^<p>(.*)<\/p>$/s);
  if (match && !match[1].includes('<p>')) {
    return match[1];
  }
  return html;
}

/**
 * Strips all HTML tags and returns plain text.
 * Useful for API calls that need clean text without formatting.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  // First clean the wrapper tags
  const cleaned = cleanHtml(html);
  // Then strip any remaining HTML tags
  return cleaned.replace(/<[^>]*>/g, '').trim();
}

/**
 * Capitalize the first letter of a string, handling HTML content.
 * For HTML, capitalizes the first visible text character.
 */
export function capitalizeFirst(str: string): string {
  if (!str) return str;

  // Check if it starts with HTML tag
  const htmlMatch = str.match(/^(<[^>]+>)(.)/);
  if (htmlMatch) {
    // Capitalize first character after the opening tag
    return htmlMatch[1] + htmlMatch[2].toUpperCase() + str.slice(htmlMatch[0].length);
  }

  // Simple case: capitalize first character
  return str.charAt(0).toUpperCase() + str.slice(1);
}
