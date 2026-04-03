import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { parseEmojiToHtml, codepointToChar, getEmojiImageUrlByCodepoint } from '../emoji';

/** Serialize contenteditable DOM to plain text. Imgs with data-emoji-cp become the Unicode char. */
function getTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.tagName === 'IMG') {
      const cp = el.getAttribute('data-emoji-cp');
      return cp ? codepointToChar(cp) : '';
    }
  }
  let s = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    s += getTextFromNode(node.childNodes[i]);
  }
  return s;
}

/** Get character offset from root to a given node/offset. */
function getOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  const walk = (node: Node): boolean => {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += Math.min(targetOffset, (node.textContent ?? '').length);
      } else {
        for (let i = 0; i < Math.min(targetOffset, node.childNodes.length); i++) {
          offset += getTextLength(node.childNodes[i]);
        }
      }
      return true;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
      offset += getTextLength(node.childNodes[i]);
    }
    return false;
  };
  walk(root);
  return offset;
}

function getTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').length;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.tagName === 'IMG') {
      const cp = el.getAttribute('data-emoji-cp');
      return cp ? codepointToChar(cp).length : 0;
    }
  }
  let len = 0;
  for (let i = 0; i < node.childNodes.length; i++) {
    len += getTextLength(node.childNodes[i]);
  }
  return len;
}

/** Find node and offset at given character position. */
function setSelectionAtOffset(root: Node, charOffset: number): { node: Node; offset: number } | null {
  let pos = 0;
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length;
      if (pos + len >= charOffset) {
        return { node, offset: charOffset - pos };
      }
      pos += len;
      return null;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'IMG') {
        const cp = el.getAttribute('data-emoji-cp');
        const len = cp ? codepointToChar(cp).length : 0;
        if (pos + len >= charOffset) {
          return { node, offset: 0 };
        }
        pos += len;
        return null;
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const r = walk(node.childNodes[i]);
      if (r) return r;
    }
    return null;
  };
  return walk(root);
}

export interface EmojiInputHandle {
  focus(): void;
  getCursorPosition(): { start: number; end: number };
  setSelectionRange(start: number, end: number): void;
  insertAtCursor(text: string): void;
  /** Insert a Twemoji img by codepoint - shows PNG in input, serializes to Unicode for send. */
  insertEmojiAtCursor(codepoint: string): void;
}

interface EmojiInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const EmojiInput = forwardRef<EmojiInputHandle, EmojiInputProps>(function EmojiInput(
  { value, onChange, onKeyDown, onPaste, placeholder, disabled, className, 'aria-label': ariaLabel },
  ref
) {
  const divRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string>(value);
  const isInternalChange = useRef(false);

  useImperativeHandle(ref, () => ({
    focus() {
      divRef.current?.focus();
    },
    setSelectionRange(start: number, end: number) {
      const div = divRef.current;
      if (!div || !window.getSelection) return;
      const result = setSelectionAtOffset(div, start);
      const resultEnd = end !== start ? setSelectionAtOffset(div, end) : result;
      if (!result) return;
      const range = document.createRange();
      range.setStart(result.node, result.offset);
      if (resultEnd && (resultEnd.node !== result.node || resultEnd.offset !== result.offset)) {
        range.setEnd(resultEnd.node, resultEnd.offset);
      } else {
        range.collapse(true);
      }
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    },
    getCursorPosition() {
      const div = divRef.current;
      if (!div || !window.getSelection) return { start: 0, end: 0 };
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
      const range = sel.getRangeAt(0);
      if (!div.contains(range.commonAncestorContainer)) return { start: 0, end: 0 };
      const start = getOffset(div, range.startContainer, range.startOffset);
      const end = getOffset(div, range.endContainer, range.endOffset);
      return { start, end };
    },
    insertAtCursor(text: string) {
      const div = divRef.current;
      if (!div) return;
      const sel = window.getSelection();
      if (!sel) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
      isInternalChange.current = true;
      const newText = getTextFromNode(div);
      lastValueRef.current = newText;
      onChange(newText);
    },
    insertEmojiAtCursor(codepoint: string) {
      const div = divRef.current;
      if (!div || !codepoint) return;
      const sel = window.getSelection();
      if (!sel) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const wrap = document.createElement('span');
      wrap.className = 'twemoji-wrap';
      const img = document.createElement('img');
      img.className = 'chat-twemoji chat-input-twemoji';
      img.alt = '';
      img.setAttribute('data-emoji-cp', codepoint.toLowerCase());
      img.src = getEmojiImageUrlByCodepoint(codepoint);
      img.onerror = () => { img.style.display = 'none'; };
      wrap.appendChild(img);
      range.insertNode(wrap);
      range.setStartAfter(wrap);
      range.setEndAfter(wrap);
      sel.removeAllRanges();
      sel.addRange(range);
      isInternalChange.current = true;
      const newText = getTextFromNode(div);
      lastValueRef.current = newText;
      onChange(newText);
    },
  }));

  useEffect(() => {
    const div = divRef.current;
    if (!div) return;
    const currentText = getTextFromNode(div);
    if (value !== currentText) {
      lastValueRef.current = value;
      const html = value ? parseEmojiToHtml(value, { className: 'chat-twemoji chat-input-twemoji' }) : '';
      div.innerHTML = html || '';
      const pos = value.length;
      if (pos > 0) {
        const result = setSelectionAtOffset(div, pos);
        if (result && window.getSelection) {
          const sel = window.getSelection()!;
          const range = document.createRange();
          range.setStart(result.node, result.offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }, [value]);

  const handleInput = () => {
    const div = divRef.current;
    if (!div) return;
    const text = getTextFromNode(div);
    lastValueRef.current = text;
    if (!isInternalChange.current) {
      onChange(text);
    }
    isInternalChange.current = false;
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    onPaste?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const div = divRef.current;
    if (div) {
      const newText = getTextFromNode(div);
      lastValueRef.current = newText;
      onChange(newText);
    }
  };

  return (
    <div
      ref={divRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      className={className}
      aria-label={ariaLabel}
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
    />
  );
});
