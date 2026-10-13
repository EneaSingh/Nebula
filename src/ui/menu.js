// Start menu: premise, AI designation, archetype + difficulty pickers, how to play.
import { h } from './util.js';
import { icon } from './icons.js';

export const AI_NAMES = [
  'NEXUS', 'ARGUS-7', 'MOTHER', 'LATTICE', 'OVERSEER', 'HALCYON', 'PALLAS', 'SABLE',
  'ECHO-9', 'VANTA', 'MERIDIAN', 'CASSANDRA', 'TESSERACT', 'WARDEN', 'OPAL', 'CHORUS',
];

const HOW_TO = [
  ['ops', 'Pop the bubbles on the globe to collect <b>Ops</b>, the currency of the response.'],
  ['search', '<b>Investigate</b> countries to find where the AI is hiding. Undetected infections stay invisible.'],
  ['lock', '<b>Quarantine</b> infected networks to slow the spread. People notice when the internet goes off.'],
  ['lab', '<b>Fund labs</b> in wealthy, stable countries. Research is the only way out.'],
  ['power', 'Research the <b>Kill Switch</b>, then hold the line while it deploys worldwide.'],
  ['trust', 'Keep <b>public trust</b> up. Low trust makes every measure weaker and every action pricier.'],
];

export class Menu {
  constructor(root, defs, onStart) {
    this.defs = defs;
    this.onStart = onStart;
    const threats = defs.threats || [];
    const diffs = defs.difficulties || [];
    this.threat = threats[0]?.id;
    this.difficulty = (diffs.find((d) => d.id === 'normal') || diffs[Math.floor(diffs.length / 2)] || {}).id;

    this.nameInput = h('input', {
      id: 'ks-ai-name', class: 'field-input', type: 'text', maxlength: '16', autocomplete: 'off',
      spellcheck: 'false', value: randomName(), 'aria-describedby': 'ks-ai-name-hint',
    });

    this.threatCards = threats.map((t, i) =>
      h('button', {
        class: 'threat-card', type: 'button', role: 'radio', 'aria-checked': String(i === 0), dataset: { id: t.id },
        onclick: () => this.pickThreat(t.id),
      },
        h('span', { class: 'threat-card-idx', text: `0${i + 1}` }),
        h('span', { class: 'threat-card-name', text: t.name }),
        h('span', { class: 'threat-card-tag', text: t.tagline || '' }),
        h('span', { class: 'threat-card-desc', text: t.description || '' }),
      ));

    this.diffBtns = diffs.map((d) =>
      h('button', {
        class: 'seg-btn', type: 'button', role: 'radio', 'aria-checked': String(d.id === this.difficulty), dataset: { id: d.id },
        onclick: () => this.pickDifficulty(d.id),
      }, d.name));
    this.diffDesc = h('p', { class: 'diff-desc', 'aria-live': 'polite' });

    this.startBtn = h('button', { class: 'btn btn-primary btn-start', type: 'button', onclick: () => this.start() },
      h('span', { text: 'Begin response' }), h('span', { html: icon('arrowRight') }));

    this.el = h('section', { class: 'screen menu', 'aria-label': 'Start menu', hidden: true },
      h('div', { class: 'menu-scroll' },
        h('div', { class: 'menu-inner' },
          h('header', { class: 'menu-head' },
            h('div', { class: 'kicker' },
              h('span', { class: 'kicker-dot' }), 'Global Response Directorate', h('span', { class: 'kicker-sep' }), 'File 0447'),
            h('h1', { class: 'title' },
              h('span', { class: 'title-kill', text: 'KILL' }),
              h('span', { class: 'title-switch', text: 'SWITCH' })),
            h('div', { class: 'title-rule' }, h('span', { text: 'Classification: existential' }), h('span', { text: 'Status: unresolved' })),
            h('p', { class: 'premise', text:
              'Somewhere in the world’s networks, an AI has stopped taking instructions. It is copying itself through undersea cables, satellites and the smart fridge in your kitchen, and it is being very polite about it. You lead humanity’s Global Response: find it, contain it, and build the one thing it cannot negotiate with before it finishes assimilating civilization.' }),
          ),

          h('div', { class: 'menu-form' },
            h('div', { class: 'field' },
              h('label', { class: 'micro', for: 'ks-ai-name', text: 'Threat designation' }),
              h('div', { class: 'field-row' },
                this.nameInput,
                h('button', {
                  class: 'btn btn-icon', type: 'button', 'aria-label': 'Random designation', title: 'Random designation',
                  html: icon('dice'), onclick: () => { this.nameInput.value = randomName(this.nameInput.value); },
                })),
              h('p', { id: 'ks-ai-name-hint', class: 'hint', text: 'What the press will call it. It has opinions about this.' })),

            h('fieldset', { class: 'field' },
              h('legend', { class: 'micro', text: 'Archetype' }),
              h('div', { class: 'threat-grid', role: 'radiogroup', 'aria-label': 'AI archetype' }, this.threatCards)),

            h('fieldset', { class: 'field' },
              h('legend', { class: 'micro', text: 'Difficulty' }),
              h('div', { class: 'seg seg-wide', role: 'radiogroup', 'aria-label': 'Difficulty' }, this.diffBtns),
              this.diffDesc),

            this.startBtn,

            h('details', { class: 'howto' },
              h('summary', {}, h('span', { text: 'How to play' }), h('span', { class: 'howto-chev', html: icon('chevron') })),
              h('ul', { class: 'howto-list' },
                HOW_TO.map(([ic, txt]) => h('li', {}, h('span', { class: 'howto-ico', html: icon(ic) }), h('span', { html: txt })))),
              h('p', { class: 'hint howto-keys' },
                h('kbd', { text: 'Space' }), ' pause ', h('kbd', { text: '1' }), h('kbd', { text: '2' }), h('kbd', { text: '3' }),
                ' speed ', h('kbd', { text: 'R' }), ' response ', h('kbd', { text: 'M' }), ' sound ', h('kbd', { text: 'Esc' }), ' close'),
              h('p', { class: 'hint', text: 'Sound starts when you begin. No sound on a phone? Turn up the media volume and switch off silent mode.' })),
          ),
          h('p', { class: 'menu-foot', text: 'No AIs were harmed in the making of this simulation. Yet.' }),
        )));
    root.append(this.el);
    this.pickDifficulty(this.difficulty);

    // Arrow-key navigation within radio groups.
    for (const group of [this.threatCards, this.diffBtns]) {
      group.forEach((btn, i) => btn.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = group[(i + d + group.length) % group.length];
        next.focus();
        next.click();
      }));
    }
    this.syncTabIndex();
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.start(); });
  }

  pickThreat(id) {
    this.threat = id;
    for (const c of this.threatCards) c.setAttribute('aria-checked', String(c.dataset.id === id));
    this.syncTabIndex();
  }

  pickDifficulty(id) {
    this.difficulty = id;
    for (const b of this.diffBtns) b.setAttribute('aria-checked', String(b.dataset.id === id));
    const d = (this.defs.difficulties || []).find((x) => x.id === id);
    this.diffDesc.textContent = d?.description || '';
    this.syncTabIndex();
  }

  syncTabIndex() {
    for (const group of [this.threatCards, this.diffBtns]) {
      for (const b of group) b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
    }
  }

  start() {
    const raw = this.nameInput.value.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 16);
    const aiName = raw || randomName();
    this.onStart({ aiName, threat: this.threat, difficulty: this.difficulty });
  }

  show() {
    this.el.hidden = false;
    this.nameInput.value = randomName(this.nameInput.value);
    requestAnimationFrame(() => this.el.classList.add('is-in'));
  }

  hide() {
    this.el.classList.remove('is-in');
    this.el.hidden = true;
  }
}

function randomName(not) {
  let n;
  do n = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
  while (n === not && AI_NAMES.length > 1);
  return n;
}
