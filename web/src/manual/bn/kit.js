// Bangla versions of the manual's boxes ("Good to know", "Tip" …) and the example button.
import { open as openEx } from '../helpers.js';

export const jano = (t) => `<div class="mx-note"><b>জেনে রাখো</b>${t}</div>`;
export const tipsB = (t) => `<div class="mx-tip"><b>টিপস</b>${t}</div>`;
export const sabdhan = (t) => `<div class="mx-warn"><b>সাবধান</b>${t}</div>`;
export const koro = (t) => `<div class="mx-try"><b>নিজে করে দেখো</b>${t}</div>`;
/** "Open this example" in Bangla, with the step number. */
export const kholo = (id, n) => openEx(id, `ধাপ ${n}-এর ল্যাব খোলো`);
