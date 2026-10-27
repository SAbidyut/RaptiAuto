// The "open the lab of step n" button of the Step-by-step chapters.
import { open as openEx } from '../helpers.js';

export const stepLab = (id, n) => openEx(id, `Open the lab of step ${n}`);
