// The four campaign slots (Milestone 0, bible §5 / §33) on core/CampaignSlots: the slot cards, Continue (the last-used
// slot), starting a resort into a slot (START RESORT) and deleting one. Screens ask "are you sure" first; this module
// only does the writing.
import { CampaignSlots } from '../../../../core/CampaignSlots.js';
import { newCampaign, slotSummary, SAVE_MIGRATIONS, validateCampaign } from '../systems/resort.js';

export function createCampaigns({ adapter, save, bus = null }) {
  // (Milestone 32) every copy checked (validateCampaign), a newer game's save never written over, a damaged account kept aside
  const slots = new CampaignSlots({ adapter, count: save.count, prefix: save.prefix, accountKey: save.accountKey, version: save.version, migrations: SAVE_MIGRATIONS, describe: slotSummary, bus, validate: validateCampaign, refuseNewer: true, quarantineAccount: true });
  let cards = slots.numbers().map((n) => ({ n, empty: true, summary: null, error: null }));
  let last = null;

  return {
    slots,
    get cards() {
      return cards;
    },
    // Continue: the last-used slot when it still holds a resort, else none.
    get last() {
      return last != null && cards[last - 1]?.summary ? last : null;
    },
    card: (n) => cards[n - 1] ?? null,
    async refresh() {
      cards = await slots.summaries();
      last = await slots.lastUsed();
      return cards;
    },
    firstEmpty() {
      return cards.find((c) => c.empty)?.n ?? null;
    },
    // START RESORT: the summary record and a new campaign save into slot n (replacing what was there).
    async start(n, setup) {
      const data = newCampaign(setup);
      await slots.create(n, { data, summary: slotSummary(data) });
      await this.refresh();
      return data;
    },
    async open(n) {
      const data = await slots.load(n);
      if (data) await slots.setLastUsed(n);
      last = data ? n : last;
      return data;
    },
    // The open campaign's save (later milestones' autosave): its run save, then its summary record.
    async save(n, data) {
      await slots.save(n, data);
      await slots.writeSummary(n, slotSummary(data));
      const c = cards[n - 1];
      if (c) cards[n - 1] = { ...c, empty: false, summary: slotSummary(data) };
    },
    // (Milestone 32) the copies a slot keeps (newest first) and "go back": the copy before the newest good one becomes
    // current (it is written again as the newest, so nothing is deleted). → the data now current, or null
    async copies(n) {
      return (await slots.slot(n).list()).sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
    },
    async rollback(n) {
      const slot = slots.slot(n);
      const good = (await slot.list()).filter((c) => c.status === 'ok').sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
      if (good.length < 2) return null;
      await slot.importRecord(await slot.adapter.get(good[1].key));
      const data = await slots.load(n);
      if (data) await slots.writeSummary(n, slotSummary(data));
      await this.refresh();
      return data;
    },
    async remove(n) {
      await slots.remove(n);
      await this.refresh();
    },
  };
}
