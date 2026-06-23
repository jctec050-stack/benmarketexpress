const fs = require('fs');
const code = fs.readFileSync('c:/Users/jpiris/Desktop/JP/benMarket/app/resumen/page.js', 'utf8');

let braces = 0;
let parens = 0;
let brackets = 0;
let line = 1;
let col = 1;

let inString = false;
let stringChar = '';
let inComment = false;
let inRegex = false;

for (let i = 0; i < code.length; i++) {
  const char = code[i];
  if (char === '\n') {
    line++;
    col = 1;
  } else {
    col++;
  }

  // Handle strings and comments to avoid counting characters inside them
  if (inComment) {
    if (char === '\n' && inComment === 'single') {
      inComment = false;
    } else if (char === '/' && code[i-1] === '*' && inComment === 'multi') {
      inComment = false;
    }
    continue;
  }

  if (inString) {
    if (char === stringChar && code[i-1] !== '\\') {
      inString = false;
    }
    continue;
  }

  if (char === '/' && code[i+1] === '/') {
    inComment = 'single';
    i++;
    continue;
  }
  if (char === '/' && code[i+1] === '*') {
    inComment = 'multi';
    i++;
    continue;
  }

  if (char === "'" || char === '"' || char === '`') {
    inString = true;
    stringChar = char;
    continue;
  }

  if (char === '{') braces++;
  if (char === '}') braces--;
  if (char === '(') parens++;
  if (char === ')') parens--;
  if (char === '[') brackets++;
  if (char === ']') brackets--;

  if (braces < 0) {
    console.error(`Unmatched closing brace } at line ${line}, col ${col}`);
    break;
  }
  if (parens < 0) {
    console.error(`Unmatched closing parenthesis ) at line ${line}, col ${col}`);
    break;
  }
  if (brackets < 0) {
    console.error(`Unmatched closing bracket ] at line ${line}, col ${col}`);
    break;
  }
}

console.log(`Matching check complete.
Braces open: ${braces}
Parens open: ${parens}
Brackets open: ${brackets}
`);
