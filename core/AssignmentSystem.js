// Puts workers into a job's slots. Any role can fill any slot, and several workers of the same
// role are fine, but one worker can only be on one job (and in one slot) at a time.
// Keeps each worker's `assigned` flag in step so the staff rules know who is busy.
// Work outside jobs (e.g. a research queue) plugs in through two optional hooks:
//   busyElsewhere(staffId) → reason | null   refuses the job slot while the worker is busy there
//   otherBusyIds() → [staffId]               those workers also count as assigned (working)
export class AssignmentSystem {
  constructor({ staff, getJobs, bus = null, busyElsewhere = null, otherBusyIds = null }) {
    this.staff = staff; // StaffSystem
    this.getJobs = getJobs; // () => active jobs (each has .slots: [staffId | null])
    this.bus = bus;
    this.busyElsewhere = busyElsewhere;
    this.otherBusyIds = otherBusyIds;
  }

  jobOf(staffId) {
    return this.getJobs().find((j) => j.slots.includes(staffId)) || null;
  }

  // Put a worker in a slot (first free slot if slotIndex is omitted).
  // Returns { ok, reason }.
  assign(job, staffId, slotIndex = null) {
    if (!this.staff.get(staffId)) return { ok: false, reason: 'unknown worker' };
    const other = this.jobOf(staffId);
    if (other && other !== job) return { ok: false, reason: `already on ${other.name}` };
    if (job.slots.includes(staffId)) return { ok: false, reason: 'already on this job' };
    const elsewhere = this.busyElsewhere?.(staffId);
    if (elsewhere) return { ok: false, reason: elsewhere };
    const i = slotIndex ?? job.slots.indexOf(null);
    if (i < 0 || i >= job.slots.length) return { ok: false, reason: 'no free slot' };
    if (job.slots[i]) return { ok: false, reason: 'slot taken' };
    job.slots[i] = staffId;
    this.refresh();
    this.bus?.emit('assignment:change', { job, staffId, assigned: true });
    return { ok: true };
  }

  unassign(job, staffId) {
    const i = job.slots.indexOf(staffId);
    if (i < 0) return false;
    job.slots[i] = null;
    this.refresh();
    this.bus?.emit('assignment:change', { job, staffId, assigned: false });
    return true;
  }

  toggle(job, staffId) {
    return job.slots.includes(staffId) ? { ok: this.unassign(job, staffId) } : this.assign(job, staffId);
  }

  clearJob(job) {
    job.slots = job.slots.map(() => null);
    this.refresh();
  }

  // Recompute every worker's `assigned` flag from the active jobs (call after loading).
  refresh() {
    const busy = new Set();
    for (const j of this.getJobs()) for (const id of j.slots) if (id) busy.add(id);
    for (const id of this.otherBusyIds?.() ?? []) busy.add(id);
    for (const s of this.staff.staff) s.assigned = busy.has(s.id);
  }
}
