// Messages for the player (any game): an inbox of past messages you can reopen, small toasts that fade on their
// own (maxToasts at a time; past a short waiting line they go straight to the inbox), and a queue of pop-ups shown
// one at a time.
//
//   post({ kind, level, title, body, icon, art, data, popup, toast, day }) → the inbox entry
//     level: 'minor' | 'medium' | 'major' (bible §33.4)
//     popup: true → waits in the pop-up queue until the game is free to show it (the game calls take())
//     toast: true → a short message that fades on its own (default: minor/medium messages that are not pop-ups)
//   Every message goes in the inbox (newest first, capped at inboxMax).
//
// Queue cap (bible §40): at most maxQueue pop-ups wait. When one more arrives, the oldest waiting pop-up of the lowest
// level folds into the inbox instead (it stays there, unread); if everything waiting outranks the newcomer, the
// newcomer folds. onFold(entry) lets the game settle a folded pop-up (e.g. auto-pick a choice event's default).
// Saved as plain data (inbox + queue); the game rebuilds how a pop-up looks from its kind + data. Toasts are not saved.
const LEVELS = { minor: 0, medium: 1, major: 2 };

export class NotificationSystem {
  constructor({ bus = null, maxQueue = 20, inboxMax = 200, toastSec = 3.6, maxToasts = 2, toastQueueMax = 6, onFold = null } = {}) {
    this.bus = bus;
    this.maxQueue = maxQueue;
    this.inboxMax = inboxMax;
    this.toastSec = toastSec;
    this.maxToasts = maxToasts;
    this.toastQueueMax = toastQueueMax;
    this.onFold = onFold;
    this.reset();
  }

  reset() {
    this.inbox = []; // newest first
    this.queue = []; // inbox ids waiting to pop up, oldest first
    this.nextId = 1;
    this.folded = 0; // pop-ups folded into the inbox (for tests)
    this.peakQueue = 0;
    this.toasts = []; // showing: { entry, age }
    this.toastWaiting = [];
    this.toastsToInbox = 0; // toasts that went straight to the inbox (tests)
  }

  get pending() {
    return this.queue.length;
  }

  get unread() {
    let n = 0;
    for (const e of this.inbox) if (!e.read) n++;
    return n;
  }

  get(id) {
    return this.inbox.find((e) => e.id === id) ?? null;
  }

  post(msg) {
    const level = msg.level in LEVELS ? msg.level : 'minor';
    const entry = {
      id: this.nextId++,
      kind: msg.kind ?? 'note',
      level,
      day: msg.day ?? 0,
      title: msg.title ?? '',
      body: msg.body ?? '',
      icon: msg.icon ?? null,
      art: msg.art ?? null,
      data: msg.data ?? null,
      popup: !!msg.popup,
      read: !!msg.read,
      folded: false,
    };
    this.inbox.unshift(entry);
    if (this.inbox.length > this.inboxMax) {
      const dropped = this.inbox.pop();
      this.queue = this.queue.filter((id) => id !== dropped.id);
    }
    if (entry.popup) this._enqueue(entry);
    else if (msg.toast ?? level !== 'major') this._toast(entry);
    this.bus?.emit('notify:post', { entry });
    return entry;
  }

  _enqueue(entry) {
    if (this.queue.length >= this.maxQueue) {
      let worst = null;
      for (const id of this.queue) {
        const e = this.get(id);
        if (e && (!worst || LEVELS[e.level] < LEVELS[worst.level])) worst = e; // oldest of the lowest level
      }
      if (worst && LEVELS[worst.level] <= LEVELS[entry.level]) {
        this.queue = this.queue.filter((id) => id !== worst.id);
        this._fold(worst);
      } else {
        this._fold(entry);
        return;
      }
    }
    this.queue.push(entry.id);
    this.peakQueue = Math.max(this.peakQueue, this.queue.length);
  }

  _fold(entry) {
    entry.folded = true;
    entry.popup = false;
    this.folded++;
    this.onFold?.(entry);
    this.bus?.emit('notify:fold', { entry });
  }

  // The next pop-up to show (removed from the queue), or null.
  take() {
    while (this.queue.length) {
      const e = this.get(this.queue.shift());
      if (e) {
        e.read = true;
        return e;
      }
    }
    return null;
  }

  markRead(id) {
    const e = this.get(id);
    if (e) e.read = true;
  }

  markAllRead() {
    for (const e of this.inbox) e.read = true;
  }

  // --- toasts (real time) ---
  // maxToasts on screen plus a waiting line of toastQueueMax; anything past that goes straight to the inbox (it is already there) and the
  // toast on screen counts it ("+2 more in the Inbox").
  _toast(entry) {
    if (this.toasts.length + this.toastWaiting.length >= this.maxToasts + this.toastQueueMax) {
      this.toastsToInbox++;
      const showing = this.toasts.at(-1);
      if (showing) showing.more++;
      else this.toastWaiting.at(-1).more = (this.toastWaiting.at(-1).more ?? 0) + 1;
      return;
    }
    this.toastWaiting.push(entry);
  }

  // hold: the game has no free space for toasts right now (a pop-up or another screen is open) — they wait.
  update(dt, { hold = false } = {}) {
    if (hold) return;
    for (const t of this.toasts) t.age += dt;
    this.toasts = this.toasts.filter((t) => t.age < this.toastSec);
    while (this.toasts.length < this.maxToasts && this.toastWaiting.length) {
      const entry = this.toastWaiting.shift();
      this.toasts.push({ entry, age: 0, more: entry.more ?? 0 });
      delete entry.more;
    }
  }

  serialize() {
    return JSON.parse(JSON.stringify({ inbox: this.inbox, queue: this.queue, nextId: this.nextId, folded: this.folded }));
  }

  load(data) {
    this.reset();
    if (!data) return false;
    this.inbox = JSON.parse(JSON.stringify(data.inbox ?? []));
    const ids = new Set(this.inbox.map((e) => e.id));
    this.queue = (data.queue ?? []).filter((id) => ids.has(id));
    this.nextId = data.nextId ?? this.inbox.reduce((m, e) => Math.max(m, e.id + 1), 1);
    this.folded = data.folded ?? 0;
    return true;
  }
}
