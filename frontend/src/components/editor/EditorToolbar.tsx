import type { Editor } from '@tiptap/react';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';

interface Props {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive
          ? 'bg-purple-100 dark:bg-[#cba6f7]/20 text-purple-600 dark:text-[#cba6f7]'
          : 'text-gray-500 dark:text-[#a6adc8] hover:bg-gray-100 dark:hover:bg-[#313244]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

/**
 * Toolbar for TipTap editor with basic formatting options.
 * Styled with Catppuccin Mocha theme.
 */
export function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-[#313244] bg-gray-50 dark:bg-[#181825]">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Cmd+B)"
      >
        <Bold size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Cmd+I)"
      >
        <Italic size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Underline (Cmd+U)"
      >
        <Underline size={16} />
      </ToolbarButton>

      <div className="w-px h-4 bg-gray-300 dark:bg-[#45475a] mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List size={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
    </div>
  );
}
