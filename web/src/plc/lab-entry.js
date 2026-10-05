// Entry of the lazily loaded lab bundle (build/www/lab.js): the 3D lab screen with three.js.
// Modules that the main app already contains are taken from window.__raptiMods (see build.mjs).
import { LabScreen } from './ui/lab.js';

window.__raptiLab = { LabScreen };
