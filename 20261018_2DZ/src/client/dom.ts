// NEW — tiny DOM helpers shared by the client UI modules (same as 20260927_FPV/src/client/dom.ts).
import { parseCssColor } from './color.ts';

export function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

/** Writes text only when it changed (HUD updates every frame). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setVisible(node: HTMLElement, visible: boolean): void {
  const hidden = !visible;
  if (node.hidden !== hidden) node.hidden = hidden;
}

/** The index.html colour tokens canvas drawers need (SSOT stays in CSS). */
export interface Theme {
  fg: number;
  danger: number;
  ok: number;
  accent: number;
  font: string;
}

export function readTheme(): Theme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string): string => {
    const v = style.getPropertyValue(name).trim();
    if (!v) throw new Error(`Missing CSS token ${name} in index.html`);
    return v;
  };
  return {
    fg: parseCssColor(token('--fg')),
    danger: parseCssColor(token('--danger')),
    ok: parseCssColor(token('--ok')),
    accent: parseCssColor(token('--accent')),
    font: token('--font'),
  };
}
