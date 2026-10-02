/**
 * M2D2 #1 — Cyberware skeleton.
 *
 * 22 organ slots: 14 SINGLE slots (one implant) and 8 PAIRED slots (an L and
 * an R sub-slot that share one slot id). This file is data only: the slot
 * definition, its display label, and whether the slot is paired. Physical
 * stat effects, pricing, the 1,75× organ-loss model, the shop, install /
 * uninstall UI, the 3D player preview and the Bytechip installation flow are
 * all explicitly out of scope this session (see the ticket's Non-goals).
 *
 * The authoritative per-player install state lives in `player.cyberware`
 * (see lib/store). A paired slot stores { L, R } rather than two separate
 * slot ids, so the L/R chips in the Cyberware panel read one entry.
 */
export type CyberwareSlotId =
  // ── single (14) ──
  | 'heart'
  | 'liver'
  | 'stomach'
  | 'pancreas'
  | 'spleen'
  | 'gallbladder'
  | 'small_intestine'
  | 'large_intestine'
  | 'urinary_bladder'
  | 'esophagus'
  | 'spinal_cord'
  | 'diaphragm'
  | 'appendix'
  | 'nose'
  // ── paired (8) — one slot, two sub-slots L/R ──
  | 'brain'
  | 'lungs'
  | 'kidneys'
  | 'ureters'
  | 'eye'
  | 'arm'
  | 'leg'
  | 'ear';

export interface CyberwareSlotDef {
  id: CyberwareSlotId;
  /** Display name: title-case of the id, underscores replaced by spaces. */
  label: string;
  /** True for the 8 L/R slots; a paired slot renders L/R sub-slots. */
  paired: boolean;
}

/**
 * All 22 slots in the ticket's canonical order: brain, heart, lungs, liver,
 * kidneys, stomach, pancreas, spleen, gallbladder, small_intestine,
 * large_intestine, urinary_bladder, esophagus, spinal_cord, diaphragm,
 * appendix, ureters, eye, arm, leg, ear, nose.
 *
 * Paired slots carry the plain singular label ('lungs' -> 'Lungs').
 */
export const CYBERWARE_SLOTS: readonly CyberwareSlotDef[] = [
  { id: 'brain', label: 'Brain', paired: true },
  { id: 'heart', label: 'Heart', paired: false },
  { id: 'lungs', label: 'Lungs', paired: true },
  { id: 'liver', label: 'Liver', paired: false },
  { id: 'kidneys', label: 'Kidneys', paired: true },
  { id: 'stomach', label: 'Stomach', paired: false },
  { id: 'pancreas', label: 'Pancreas', paired: false },
  { id: 'spleen', label: 'Spleen', paired: false },
  { id: 'gallbladder', label: 'Gallbladder', paired: false },
  { id: 'small_intestine', label: 'Small Intestine', paired: false },
  { id: 'large_intestine', label: 'Large Intestine', paired: false },
  { id: 'urinary_bladder', label: 'Urinary Bladder', paired: false },
  { id: 'esophagus', label: 'Esophagus', paired: false },
  { id: 'spinal_cord', label: 'Spinal Cord', paired: false },
  { id: 'diaphragm', label: 'Diaphragm', paired: false },
  { id: 'appendix', label: 'Appendix', paired: false },
  { id: 'ureters', label: 'Ureters', paired: true },
  { id: 'eye', label: 'Eye', paired: true },
  { id: 'arm', label: 'Arm', paired: true },
  { id: 'leg', label: 'Leg', paired: true },
  { id: 'ear', label: 'Ear', paired: true },
  { id: 'nose', label: 'Nose', paired: false },
];
