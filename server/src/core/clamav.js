const net = require('net');

/**
 * Minimal clamd client (INSTREAM over TCP). Sends the buffer in length-prefixed
 * chunks and reads the single-line verdict. Rejects on any transport error so
 * the caller can fail closed.
 */
const scanWithClamd = (buffer, { host, port, timeoutMs = 15000 }) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host, port });
  let reply = '';
  let settled = false;
  const done = (fn, v) => { if (!settled) { settled = true; socket.destroy(); fn(v); } };
  const timer = setTimeout(() => done(reject, new Error('clamd timeout')), timeoutMs);

  socket.once('connect', () => {
    socket.write('zINSTREAM\0');
    const CHUNK = 64 * 1024;
    for (let off = 0; off < buffer.length; off += CHUNK) {
      const slice = buffer.subarray(off, Math.min(off + CHUNK, buffer.length));
      const len = Buffer.alloc(4);
      len.writeUInt32BE(slice.length, 0);
      socket.write(Buffer.concat([len, slice]));
    }
    socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
  });
  socket.on('data', (d) => { reply += d.toString('latin1'); });
  socket.on('end', () => {
    clearTimeout(timer);
    const line = reply.replace(/\0/g, '').trim();
    if (/\bOK$/.test(line)) return done(resolve, { clean: true, threat: null });
    const m = /:\s*(.+?)\s+FOUND$/.exec(line);
    if (m) return done(resolve, { clean: false, threat: m[1] });
    done(reject, new Error(`unexpected clamd reply: ${line || '(empty)'}`));
  });
  socket.on('error', (err) => { clearTimeout(timer); done(reject, err); });
});

module.exports = { scanWithClamd };
