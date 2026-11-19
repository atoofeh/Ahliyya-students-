const GROUPS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];

// Rejection sampling avoids modulo bias; generated passwords stay in the form
// only and are submitted through the normal account-creation request.
const randomBelow = (limit) => {
  const bytes = new Uint8Array(1);
  const ceiling = Math.floor(256 / limit) * limit;
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= ceiling);
  return bytes[0] % limit;
};

export function generatePassword() {
  const alphabet = GROUPS.join('');
  const characters = GROUPS.map((group) => group[randomBelow(group.length)]);
  while (characters.length < 16) characters.push(alphabet[randomBelow(alphabet.length)]);
  for (let index = characters.length - 1; index > 0; index--) {
    const other = randomBelow(index + 1);
    [characters[index], characters[other]] = [characters[other], characters[index]];
  }
  return characters.join('');
}
