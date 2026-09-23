/**
 * Reads typed-out exam questions into practice questions.
 *
 * Written for what a person actually types while copying a paper, not for a
 * format they have to learn: a numbered question, its choices one per line,
 * and the right one marked either with a `*` or by an "Answer: b" line.
 * Arabic numerals, brackets and full stops are all accepted, and so is the
 * Arabic word for the answer.
 *
 *   1) She waited ___ the station ___ two hours.
 *   a. in — since
 *   *b. in — for
 *   c. at — for
 *   Answer: b
 *   # "for" measures a length of time.
 *
 * Anything it cannot place is reported rather than guessed at, so the person
 * pasting sees what will be added before it is.
 */

// "a." "a)" "(b)" "ب-" … the letter that starts a choice.
const OPTION = /^\s*(\*?)\s*\(?([a-jA-Jأ-ي])\)?\s*[).،.:-]\s*(.+)$/;
const NUMBERED = /^\s*\(?\d+\)?\s*[).،.:-]\s*(.+)$/;
const ANSWER = /^\s*(?:answer|ans|correct|الإجابة|الاجابة|الجواب)\s*[:：-]\s*\(?([a-jA-Jأ-ي])\)?/i;
const NOTE = /^\s*(?:#|why|because|explanation|شرح|السبب)\s*[:：-]?\s*(.+)$/i;

const LETTERS = 'abcdefghij';
const ARABIC_LETTERS = 'أبجدهوزحطي';
const indexOfLetter = (raw) => {
  const letter = String(raw || '').trim();
  const latin = LETTERS.indexOf(letter.toLowerCase());
  return latin >= 0 ? latin : ARABIC_LETTERS.indexOf(letter);
};

/**
 * @param {string} text  what was pasted
 * @returns {{ questions: Array, skipped: number, unmarked: number }}
 *   `questions` are ready to post; `unmarked` counts the ones left out because
 *   no correct answer was marked, `skipped` the blocks that held no choices.
 */
export function parseQuestions(text) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let current = null;

  const push = () => { if (current && (current.head.length || current.options.length)) blocks.push(current); };
  const start = (head) => { push(); current = { head: head ? [head] : [], options: [], answer: null, note: '' }; };

  for (const line of lines) {
    const bare = line.trim();
    if (!bare) { if (current?.options.length) { push(); current = null; } continue; }

    const numbered = bare.match(NUMBERED);
    // A number only starts a question when we are not part-way through choices.
    if (numbered && (!current || current.options.length)) { start(numbered[1]); continue; }
    if (!current) start(null);

    const note = bare.match(NOTE);
    if (note && current.options.length) { current.note = note[1].trim(); continue; }

    const answer = bare.match(ANSWER);
    if (answer) { current.answer = indexOfLetter(answer[1]); continue; }

    const option = bare.match(OPTION);
    if (option) {
      current.options.push({ text: option[3].trim(), marked: option[1] === '*' });
      continue;
    }
    if (current.options.length) current.note = [current.note, bare].filter(Boolean).join(' ');
    else current.head.push(bare);
  }
  push();

  const questions = [];
  let skipped = 0;
  let unmarked = 0;
  for (const block of blocks) {
    const prompt = block.head.join(' ').trim();
    if (!prompt || block.options.length < 2) { skipped += 1; continue; }
    const options = block.options.map((o, i) => ({
      text: o.text,
      isCorrect: o.marked || block.answer === i,
    }));
    if (!options.some((o) => o.isCorrect)) { unmarked += 1; continue; }
    questions.push({ text: prompt, options, explanation: block.note || '' });
  }
  return { questions, skipped, unmarked };
}
