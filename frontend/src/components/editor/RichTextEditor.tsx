import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useEffect, useState, useCallback } from 'react';
import { EditorToolbar } from './EditorToolbar';
import { Type } from 'lucide-react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  /** If true, Enter creates soft break instead of new paragraph */
  singleLine?: boolean;
  /** If true, always show the toolbar. Default false (hidden, toggle to show) */
  alwaysShowToolbar?: boolean;
}

/**
 * Strip wrapper <p> tags for single line content.
 */
function stripParagraphWrapper(html: string): string {
  if (!html) return '';
  if (html === '<p></p>') return '';
  const match = html.match(/^<p>(.*)<\/p>$/s);
  if (match && !match[1].includes('<p>')) {
    return match[1];
  }
  return html;
}

/**
 * Rich text editor using TipTap with basic formatting support.
 * Supports bold, italic, underline, and lists.
 * Toolbar is completely hidden by default and shown via toggle button.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = '40px',
  className = '',
  singleLine = false,
  alwaysShowToolbar = false,
}: Props) {
  const [showToolbar, setShowToolbar] = useState(false);

  // Strip HTML tags for plain text paste in singleLine mode
  const handlePaste = useCallback(
    (view: unknown, event: ClipboardEvent) => {
      if (singleLine) {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (view as any).dispatch(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (view as any).state.tr.insertText(text)
        );
        return true;
      }
      return false;
    },
    [singleLine]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        hardBreak: singleLine ? false : undefined,
      }),
      Underline,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'outline-none',
        style: `min-height: ${minHeight}`,
      },
      handleKeyDown: singleLine
        ? (_view, event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              return true;
            }
            return false;
          }
        : undefined,
      handlePaste: singleLine ? handlePaste : undefined,
    },
    onUpdate: ({ editor }) => {
      let html = editor.getHTML();
      // For singleLine, strip the <p> wrapper that TipTap always adds
      if (singleLine) {
        html = stripParagraphWrapper(html);
      }
      onChange(html);
    },
  });

  // Sync external value changes to editor
  useEffect(() => {
    if (editor) {
      // For singleLine, we need to compare without <p> wrapper
      const currentHtml = singleLine
        ? stripParagraphWrapper(editor.getHTML())
        : editor.getHTML();
      if (value !== currentHtml) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    }
  }, [value, editor, singleLine]);

  const toolbarVisible = alwaysShowToolbar || showToolbar;

  return (
    <div
      className={`relative border border-gray-200 dark:border-[#45475a] rounded-lg overflow-hidden bg-white dark:bg-[#313244]/50 focus-within:ring-2 focus-within:ring-purple-500 dark:focus-within:ring-[#cba6f7] focus-within:border-transparent ${className}`}
    >
      {/* Toolbar - completely hidden when not visible */}
      {toolbarVisible && (
        <div className="border-b border-gray-200 dark:border-[#313244] bg-gray-50 dark:bg-[#181825]">
          <EditorToolbar editor={editor} />
        </div>
      )}

      {/* Editor content with inline toggle button */}
      <div className={`flex ${singleLine ? 'items-center' : 'items-start'}`}>
        <div className={`flex-1 px-3 ${singleLine ? 'py-1.5' : 'py-2'}`}>
          <EditorContent
            editor={editor}
            className={`prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-0 [&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ol]:my-1 ${singleLine ? '[&_.ProseMirror]:flex [&_.ProseMirror]:items-center' : ''}`}
          />
          {!value && placeholder && !editor?.isFocused && (
            <div className="text-gray-400 dark:text-[#6c7086] text-sm pointer-events-none absolute top-0 left-0">
              {placeholder}
            </div>
          )}
        </div>

        {/* Minimal toggle button - inline with content */}
        {!alwaysShowToolbar && (
          <button
            type="button"
            onClick={() => setShowToolbar(!showToolbar)}
            className={`p-1.5 m-1 rounded transition-colors ${
              showToolbar
                ? 'text-[#cba6f7] bg-[#cba6f7]/10'
                : 'text-[#6c7086] hover:text-[#a6adc8] hover:bg-[#313244]/50'
            }`}
            title={showToolbar ? 'Hide formatting' : 'Show formatting'}
          >
            <Type size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
