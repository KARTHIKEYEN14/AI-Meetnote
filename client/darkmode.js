const fs = require('fs');
const path = require('path');

const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.jsx')) results.push(file);
    }
  });
  return results;
};

const map = {
  'bg-slate-50': 'bg-slate-950',
  'bg-white': 'bg-slate-900',
  'text-slate-900': 'text-white',
  'text-slate-800': 'text-slate-100',
  'text-slate-700': 'text-slate-300',
  'text-slate-600': 'text-slate-400',
  'text-slate-500': 'text-slate-400',
  'text-slate-400': 'text-slate-500',
  'text-slate-300': 'text-slate-600',
  'bg-slate-100': 'bg-slate-800',
  'bg-slate-200': 'bg-slate-800',
  'border-slate-100': 'border-slate-800',
  'border-slate-200': 'border-slate-700',
  'border-slate-300': 'border-slate-600',
  'divide-slate-100': 'divide-slate-800',
  'divide-slate-200': 'divide-slate-700',
  'bg-white/50': 'bg-slate-900/50',
  'bg-white/80': 'bg-slate-900/80',
  'shadow-slate-200/50': 'shadow-black/50',
  'shadow-slate-200/40': 'shadow-black/50',
  'shadow-slate-200': 'shadow-black/50',
  'border-white': 'border-slate-800'
};

const files = walk(path.join(__dirname, 'src'));
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  for (const [key, value] of Object.entries(map)) {
    content = content.replace(new RegExp(`(?<=[\\s"'\\\`>])${key.replace(/\\//g, '\\/')}(?=[\\s"'\\\`<])`, 'g'), value);
  }
  fs.writeFileSync(file, content);
});

// Update index.css
const cssPath = path.join(__dirname, 'src', 'index.css');
let indexCss = fs.readFileSync(cssPath, 'utf8');
indexCss = indexCss.replace('bg-slate-50', 'bg-slate-950').replace('text-slate-900', 'text-white');
fs.writeFileSync(cssPath, indexCss);

console.log('Dark mode applied successfully!');
