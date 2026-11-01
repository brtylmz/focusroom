type Attrs = Record<string, string>;
type Handlers = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export interface ElOptions {
  class?: string;
  text?: string;
  attrs?: Attrs;
  on?: Handlers;
}

type Child = Node | string | false | null | undefined;

/** Small DOM builder. Text is always set via textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [key, value] of Object.entries(options.attrs ?? {})) node.setAttribute(key, value);
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    if (handler) node.addEventListener(type, handler as EventListener);
  }
  for (const child of children) {
    if (child !== false && child !== null && child !== undefined) node.append(child);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
