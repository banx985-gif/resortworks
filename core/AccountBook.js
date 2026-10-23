// An account-wide book of pages (any series game): entries kept for good across every campaign — a CAREWORKS Memory
// Book, a hall of fame of retired robots or legendary players. Kept in the account save, never a run save, so a new
// campaign (or New Game+) can't touch it. There is deliberately no remove: nothing can be deleted by accident.
//
//   add(page) → true when it is new (a page needs an `id`; the same id is never added twice — the first copy stays)
//   merge(pages) → how many were new        get(id) → the page or null        has(id)
//   list → oldest first (the order they were added)        count
//   serialize() → plain JSON        load(data) → adds what it holds (never drops a page this book already has)
// Emits 'book:page' ({ book, page }) for each new page.
export class AccountBook {
  constructor({ name = 'book', bus = null } = {}) {
    this.name = name;
    this.bus = bus;
    this.pages = [];
    this.ids = new Set();
  }

  add(page) {
    if (!page || page.id == null || this.ids.has(page.id)) return false;
    const copy = JSON.parse(JSON.stringify(page));
    this.pages.push(copy);
    this.ids.add(copy.id);
    this.bus?.emit('book:page', { book: this.name, page: copy });
    return true;
  }

  merge(pages = []) {
    let n = 0;
    for (const p of pages ?? []) if (this.add(p)) n++;
    return n;
  }

  get(id) {
    return this.pages.find((p) => p.id === id) ?? null;
  }

  has(id) {
    return this.ids.has(id);
  }

  get list() {
    return this.pages;
  }

  get count() {
    return this.pages.length;
  }

  serialize() {
    return { pages: JSON.parse(JSON.stringify(this.pages)) };
  }

  load(data) {
    if (!data || !Array.isArray(data.pages)) return false;
    for (const p of data.pages) {
      if (!p || p.id == null || this.ids.has(p.id)) continue;
      this.pages.push(JSON.parse(JSON.stringify(p)));
      this.ids.add(p.id);
    }
    return true;
  }
}
