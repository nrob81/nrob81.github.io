import { normalize, createHistory } from './shell.js';

const PROMPT = 'robert@nrcode.com:~$ ';
const TYPE_DELAY_MS = 30;

const cv = document.getElementById('cv');
const terminal = document.getElementById('terminal');
const output = document.getElementById('output');
const promptLine = document.getElementById('prompt-line');
const input = document.getElementById('cmd');
const typed = document.getElementById('typed');

const history = createHistory();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let revealQueue = Promise.resolve();
let skip = false;

// The CV sections in index.html are the single source of truth:
// each command's output is a clone of its section's children.
const sections = new Map();
for (const section of cv.querySelectorAll('section[data-command]')) {
    sections.set(section.dataset.command, {
        desc: section.dataset.desc ?? '',
        source: section,
    });
}

// Progressive enhancement: swap the static CV for the terminal.
cv.classList.add('sr-only');
terminal.hidden = false;

function line(text, cls = '') {
    const div = document.createElement('div');
    div.className = cls ? `line ${cls}` : 'line';
    div.textContent = text;
    return div;
}

function echoLine(rawInput) {
    const div = document.createElement('div');
    div.className = 'cmd-echo line';
    const prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.textContent = PROMPT;
    div.append(prompt, document.createTextNode(rawInput));
    return div;
}

function commandButton(name) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clickable';
    btn.textContent = name;
    btn.addEventListener('click', () => submit(name));
    return btn;
}

function helpNodes() {
    const nodes = [line('Available commands:')];
    for (const [name, { desc }] of sections) {
        const div = document.createElement('div');
        div.className = 'line';
        div.append('  ', commandButton(name), ' '.repeat(Math.max(2, 14 - name.length)), desc);
        nodes.push(div);
    }
    nodes.push(line('  clear         clear the screen', 'dim'));
    return nodes;
}

function lsNodes() {
    const div = document.createElement('div');
    div.className = 'line';
    for (const name of sections.keys()) {
        div.append(commandButton(name), '  ');
    }
    return [div];
}

function outputFor(name) {
    if (name === 'help') return helpNodes();
    if (name === 'ls') return lsNodes();
    if (name === 'sudo' || name.startsWith('sudo ')) {
        return [line('robert is not in the sudoers file. This incident will be reported.', 'error')];
    }
    const section = sections.get(name);
    if (section) {
        return [...section.source.children].map((node) => node.cloneNode(true));
    }
    return [line(`command not found: ${name} — try 'help'`, 'error')];
}

function scrollDown() {
    promptLine.scrollIntoView({ block: 'end' });
}

async function reveal(nodes) {
    skip = false;
    for (const node of nodes) {
        output.appendChild(node);
        scrollDown();
        if (!skip && !reducedMotion.matches) {
            await new Promise((resolve) => setTimeout(resolve, TYPE_DELAY_MS));
        }
    }
}

function submit(rawInput) {
    const name = normalize(rawInput);
    skip = true; // finish any reveal still in progress
    revealQueue = revealQueue.then(async () => {
        output.appendChild(echoLine(rawInput));
        scrollDown();
        if (!name) return;
        history.push(name);
        if (name === 'clear') {
            output.replaceChildren();
            return;
        }
        await reveal(outputFor(name));
    });
}

input.addEventListener('input', () => {
    typed.textContent = input.value;
});

input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        submit(input.value);
        input.value = '';
        typed.textContent = '';
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        input.value = history.prev();
        typed.textContent = input.value;
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        input.value = history.next();
        typed.textContent = input.value;
    } else {
        skip = true; // typing skips the typewriter effect
    }
});

// Clicking anywhere refocuses the input, unless the user is selecting
// text or clicking a link/button.
document.addEventListener('click', (event) => {
    skip = true;
    if (window.getSelection()?.toString()) return;
    if (event.target.closest('a, button')) return;
    input.focus({ preventScroll: true });
});

// Boot sequence: intro lines, then an automatic `help`.
revealQueue = revealQueue
    .then(() => reveal([
        line('nrcode.com — Róbert Natkay'),
        line('full stack developer · Komárno, Slovakia', 'dim'),
        line(' '),
    ]))
    .then(async () => {
        output.appendChild(echoLine('help'));
        await reveal(outputFor('help'));
    });

input.focus({ preventScroll: true });
