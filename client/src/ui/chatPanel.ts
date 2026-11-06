import { CHARACTERS, LIMITS, tr, type ChatMessage } from '@focusroom/shared';
import { el } from './dom.js';

export interface ChatHooks {
  send(text: string): Promise<string | null>;
  report(messageId: string): void;
  mutesChanged(): void;
  onError(text: string): void;
}

const ACCENT = new Map(CHARACTERS.map((c) => [c.id, c.accent]));

export class ChatPanel {
  readonly element: HTMLElement;
  readonly header: HTMLElement;
  private readonly body: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly counter: HTMLElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private messages: ChatMessage[] = [];
  private open = true;
  private unread = 0;
  private sending = false;

  constructor(
    parent: HTMLElement,
    private readonly selfId: string,
    private readonly mutes: Set<string>,
    private readonly hooks: ChatHooks,
  ) {
    this.badge = el('span', { class: 'badge', attrs: { hidden: '' } });
    this.toggleButton = el('button', {
      class: 'ghost small',
      text: '−',
      attrs: { 'aria-expanded': 'true', 'aria-label': 'Sohbeti aç/kapat' },
      on: { click: () => this.setOpen(!this.open) },
    });
    this.header = el('div', { class: 'collapsible-head' }, [
      el('h2', { text: tr.chat.heading }),
      el('div', { class: 'row-buttons' }, [this.badge, this.toggleButton]),
    ]);

    this.log = el('div', { class: 'chat-log', attrs: { role: 'log', 'aria-live': 'polite' } });
    this.input = el('textarea', {
      attrs: {
        rows: '2',
        maxlength: String(LIMITS.chatMaxLength),
        placeholder: tr.chat.placeholder,
        'aria-label': tr.chat.placeholder,
      },
      on: {
        input: () => this.updateCounter(),
        keydown: (e) => this.onKey(e),
      },
    });
    this.counter = el('div', { class: 'counter', attrs: { 'aria-live': 'polite' } });
    this.sendButton = el('button', { class: 'primary', text: tr.chat.send, on: { click: () => void this.submit() } });
    const form = el('div', { class: 'chat-form' }, [this.input, this.sendButton]);

    this.body = el('div', { class: 'collapsible-body' }, [this.log, form, this.counter]);
    this.element = el('div', { class: 'panel', attrs: { 'aria-label': tr.chat.heading } }, [this.header, this.body]);
    parent.append(this.element);
    this.updateCounter();
  }

  setHistory(messages: ChatMessage[]): void {
    this.messages = [...messages];
    this.renderAll();
  }

  append(message: ChatMessage): void {
    this.messages.push(message);
    if (this.messages.length > LIMITS.chatHistory) this.messages.shift();
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    const node = this.render(message);
    if (node) this.log.append(node);
    if (atBottom) this.log.scrollTop = this.log.scrollHeight;
    if (!this.open && message.authorId !== this.selfId) {
      this.unread += 1;
      this.badge.textContent = tr.chat.unread(this.unread);
      this.badge.hidden = false;
    }
  }

  focusInput(): void {
    this.setOpen(true);
    this.input.focus();
  }

  isTyping(): boolean {
    return document.activeElement === this.input;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.body.hidden = !open;
    this.toggleButton.textContent = open ? '−' : '+';
    this.toggleButton.setAttribute('aria-expanded', String(open));
    if (open) {
      this.unread = 0;
      this.badge.hidden = true;
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  refreshMutes(): void {
    this.renderAll();
  }

  private renderAll(): void {
    this.log.replaceChildren();
    if (this.messages.length === 0) {
      this.log.append(el('div', { class: 'small', text: tr.chat.empty }));
    }
    for (const m of this.messages) {
      const node = this.render(m);
      if (node) this.log.append(node);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  private render(m: ChatMessage): HTMLElement | null {
    if (m.kind === 'system') {
      const cls = m.tone === 'milestone' ? 'chat-msg system milestone' : 'chat-msg system';
      return el('div', { class: cls, text: m.text });
    }
    const muted = Boolean(m.authorId && m.authorId !== this.selfId && this.mutes.has(m.authorId));
    const time = new Date(m.sentAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const swatch = el('span', { class: 'swatch' });
    const accent = m.characterId ? ACCENT.get(m.characterId) : undefined;
    if (accent) swatch.style.background = accent;
    const actions =
      m.authorId && m.authorId !== this.selfId
        ? el('span', { class: 'actions' }, [
            el('button', { text: this.mutes.has(m.authorId) ? tr.chat.unmute : tr.chat.mute, on: { click: () => this.toggleMute(m.authorId!) } }),
            el('button', { text: tr.chat.report, on: { click: () => this.hooks.report(m.id) } }),
          ])
        : undefined;
    return el('div', { class: 'chat-msg', attrs: { 'data-id': m.id } }, [
      el('div', { class: 'meta' }, [
        swatch,
        el('span', { class: 'author', text: m.authorName }),
        el('span', { text: time }),
        actions,
      ]),
      el('div', { text: muted ? tr.chat.muted : m.text }),
    ]);
  }

  private toggleMute(playerId: string): void {
    if (this.mutes.has(playerId)) this.mutes.delete(playerId);
    else this.mutes.add(playerId);
    this.hooks.mutesChanged();
    this.renderAll();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this.submit();
    } else if (e.key === 'Escape') {
      this.input.blur();
    }
  }

  private async submit(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.sending) return;
    this.sending = true;
    this.updateCounter();
    const error = await this.hooks.send(text);
    this.sending = false;
    this.updateCounter();
    if (error) {
      this.hooks.onError(error);
      return;
    }
    this.input.value = '';
    this.updateCounter();
  }

  private updateCounter(): void {
    const length = [...this.input.value].length;
    this.counter.textContent = `${length}/${LIMITS.chatMaxLength}`;
    this.sendButton.disabled = this.sending || this.input.value.trim().length === 0;
  }
}
