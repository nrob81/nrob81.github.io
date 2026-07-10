export function normalize(input) {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createHistory() {
  const items = [];
  let cursor = 0; // one past the newest entry = fresh prompt

  return {
    push(cmd) {
      if (cmd && items[items.length - 1] !== cmd) {
        items.push(cmd);
      }
      cursor = items.length;
    },
    prev() {
      if (cursor > 0) {
        cursor -= 1;
      }
      return items[cursor] ?? '';
    },
    next() {
      if (cursor < items.length) {
        cursor += 1;
      }
      return items[cursor] ?? '';
    },
  };
}
