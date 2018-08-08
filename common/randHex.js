//  random hex string generator (from https://codepen.io/code_monk/pen/FvpfI)
function randHex(len) {
  const maxlen = 8;
  const min = 16 ** (Math.min(len, maxlen) - 1);
  const max = (16 ** Math.min(len, maxlen)) - 1;
  const n = Math.floor(Math.random() * ((max - min) + 1)) + min;
  let r = n.toString(16);
  while (r.length < len) {
    r += randHex(len - maxlen);
  }
  return r;
}

module.exports = randHex;
