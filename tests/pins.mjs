// Dev aid: dump component pins.  node tests/pins.mjs <type...>   (no args = list all types)
import '../web/src/components/index.js';
import { getDef, pinsOf, defaultProps, allDefs } from '../web/src/components/registry.js';
const want = process.argv.slice(2);
if (!want.length) { console.log(allDefs().map((d) => d.type).join(' ')); process.exit(0); }
for (const type of want) {
  const def = getDef(type);
  if (!def) { console.log(type, 'MISSING'); continue; }
  const part = { id: 'x', type, x: 0, y: 0, rot: 0, props: defaultProps(def) };
  const box = typeof def.box === 'function' ? def.box(part.props) : def.box;
  console.log(`${type}  box=${JSON.stringify(box)}  props=${JSON.stringify(part.props)}`);
  console.log('   ' + pinsOf(part).map((p) => `${p.id}(${p.x},${p.y})`).join(' '));
}
