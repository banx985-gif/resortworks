// Typing a short name on a canvas game (Milestone 21 — Company Setup): a real HTML text box is laid exactly over the
// canvas field, so phones bring up their own keyboard. Enter, Done or tapping away keeps the text; Escape cancels.
//   const tp = new TextPrompt({ renderer });
//   tp.open({ rect (logical), value, maxLength, placeholder, onDone(value), onCancel })   tp.active   tp.close()
import { THEME } from '../Theme.js';

export class TextPrompt {
  constructor({ renderer }) {
    this.renderer = renderer;
    this.el = null;
  }

  get active() {
    return !!this.el;
  }

  open({ rect, value = '', maxLength = 24, placeholder = '', onDone = () => {}, onCancel = () => {} }) {
    this.close();
    const r = this.renderer;
    const s = r.scale;
    const el = document.createElement('input');
    el.type = 'text';
    el.value = value;
    el.maxLength = maxLength;
    el.placeholder = placeholder;
    el.autocomplete = 'off';
    el.enterKeyHint = 'done';
    el.setAttribute('aria-label', placeholder || 'Name');
    const C = THEME.color;
    el.style.cssText = [
      'position:fixed',
      `left:${r.cssBox.x + rect.x * s}px`,
      `top:${r.cssBox.y + rect.y * s}px`,
      `width:${rect.w * s}px`,
      `height:${rect.h * s}px`,
      'box-sizing:border-box',
      `padding:0 ${24 * s}px`,
      `font:bold ${Math.max(16, THEME.size.button * s)}px ${THEME.family}`,
      `color:${C.text}`,
      `background:${C.panel}`,
      `border:${Math.max(2, 5 * s)}px solid ${C.action}`,
      `border-radius:${24 * s}px`,
      'outline:none',
      'z-index:10',
    ].join(';');
    let settled = false;
    const finish = (keep) => {
      if (settled) return;
      settled = true;
      const v = el.value.trim();
      this.close();
      if (keep) onDone(v);
      else onCancel();
    };
    el.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing must not pause the game or press back
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    el.addEventListener('blur', () => finish(true));
    document.body.appendChild(el);
    this.el = el;
    el.focus();
    el.select();
  }

  // A multi-line box (Milestone 22 save inspector: export / import a save as text). readOnly: the text is selected for
  // copying. Tapping away (blur) finishes; onDone gets the text.
  openArea({ rect, value = '', readOnly = false, placeholder = '', onDone = () => {} }) {
    this.close();
    const r = this.renderer;
    const s = r.scale;
    const el = document.createElement('textarea');
    el.value = value;
    el.readOnly = readOnly;
    el.placeholder = placeholder;
    el.spellcheck = false;
    el.style.cssText = [
      'position:fixed',
      `left:${r.cssBox.x + rect.x * s}px`,
      `top:${r.cssBox.y + rect.y * s}px`,
      `width:${rect.w * s}px`,
      `height:${rect.h * s}px`,
      'box-sizing:border-box',
      `padding:${12 * s}px`,
      `font:${Math.max(11, 24 * s)}px ui-monospace, Consolas, monospace`,
      `color:${THEME.color.text}`,
      `background:${THEME.color.panel}`,
      `border:${Math.max(2, 5 * s)}px solid ${THEME.color.progress}`,
      `border-radius:${20 * s}px`,
      'z-index:10',
    ].join(';');
    let settled = false;
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.addEventListener('blur', () => {
      if (settled) return;
      settled = true;
      const v = el.value;
      this.close();
      onDone(v);
    });
    document.body.appendChild(el);
    this.el = el;
    el.focus();
    if (readOnly) el.select();
  }

  close() {
    const el = this.el;
    this.el = null;
    if (el?.parentNode) el.parentNode.removeChild(el);
  }
}
