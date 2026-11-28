/**
 * A small QR Code encoder (ISO/IEC 18004, byte mode, versions 1–40), so a
 * pass can draw the exact payload the server sent without a dependency.
 * Pure: the same matrix on the web (SVG) and in React Native.
 *
 * The algorithm follows Project Nayuki's reference implementation (MIT):
 * pick the smallest version that holds the bytes at the error-correction
 * level, add Reed–Solomon codewords per block, interleave, draw the function
 * patterns, place the data in the zigzag and choose the mask with the lowest
 * penalty.
 */

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrMatrix {
  /** Modules per side (21 for version 1, +4 per version). */
  readonly size: number;
  readonly version: number;
  readonly mask: number;
  /** Row-major: `modules[y * size + x]` is true for a dark module. */
  readonly modules: readonly boolean[];
}

const ORDINAL: Record<QrErrorCorrection, number> = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS: Record<QrErrorCorrection, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number, ecl: QrErrorCorrection): number {
  const o = ORDINAL[ecl];
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[o]![version]! *
      NUM_ERROR_CORRECTION_BLOCKS[o]![version]!
  );
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]) {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index]! ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
}

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

const bit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

/**
 * Encodes `text` (UTF-8 bytes) as a QR Code. Throws a RangeError when the
 * text is too long for version 40 at this level.
 */
export function encodeQr(text: string, ecl: QrErrorCorrection = "M"): QrMatrix {
  const bytes = utf8(text);
  let version = 1;
  for (; ; version += 1) {
    if (version > 40) throw new RangeError("Text too long for a QR Code");
    const countBits = version < 10 ? 8 : 16;
    const used = 4 + countBits + bytes.length * 8;
    if (used <= dataCodewords(version, ecl) * 8) break;
  }
  const capacity = dataCodewords(version, ecl) * 8;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!;
    data.push(byte);
  }

  // Error correction, per block, then interleave.
  const o = ORDINAL[ecl];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[o]![version]!;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[o]![version]!;
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(
      k,
      k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1),
    );
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
        codewords.push(block[i]!);
    });
  }

  // Function patterns.
  const size = version * 4 + 17;
  const modules = new Array<boolean>(size * size).fill(false);
  const isFunction = new Array<boolean>(size * size).fill(false);
  const setFunction = (x: number, y: number, dark: boolean) => {
    modules[y * size + x] = dark;
    isFunction[y * size + x] = true;
  };
  for (let i = 0; i < size; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size)
          setFunction(xx, yy, distance !== 2 && distance !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const alignment: number[] = [];
  if (version > 1) {
    const count = Math.floor(version / 7) + 2;
    const step =
      Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
    alignment.push(6);
    for (let pos = size - 7; alignment.length < count; pos -= step)
      alignment.splice(1, 0, pos);
  }
  const last = alignment.length - 1;
  alignment.forEach((ay, i) => {
    alignment.forEach((ax, j) => {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      )
        return;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1)
          setFunction(
            ax + dx,
            ay + dy,
            Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
          );
    });
  });
  const drawFormat = (mask: number) => {
    const value = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = value;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const format = ((value << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) setFunction(8, i, bit(format, i));
    setFunction(8, 7, bit(format, 6));
    setFunction(8, 8, bit(format, 7));
    setFunction(7, 8, bit(format, 8));
    for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, bit(format, i));
    for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, bit(format, i));
    for (let i = 8; i < 15; i += 1)
      setFunction(8, size - 15 + i, bit(format, i));
    setFunction(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = bit(versionBits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  // Data in the zigzag.
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!isFunction[y * size + x] && index < codewords.length * 8) {
          modules[y * size + x] = bit(codewords[index >>> 3]!, 7 - (index & 7));
          index += 1;
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        const at = y * size + x;
        if (!isFunction[at] && invert) modules[at] = !modules[at];
      }
    }
  };

  let bestMask = 0;
  let minPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(mask);
    drawFormat(mask);
    const score = penalty(modules, size);
    if (score < minPenalty) {
      minPenalty = score;
      bestMask = mask;
    }
    applyMask(mask);
  }
  applyMask(bestMask);
  drawFormat(bestMask);
  return { size, version, mask: bestMask, modules };
}

function penalty(modules: readonly boolean[], size: number): number {
  let result = 0;
  const at = (x: number, y: number) => modules[y * size + x]!;
  const addHistory = (length: number, history: number[]) => {
    history.pop();
    history.unshift(history[0] === 0 ? length + size : length);
  };
  const countPatterns = (h: readonly number[]) => {
    const n = h[1]!;
    const core =
      n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (
      (core && h[0]! >= n * 4 && h[6]! >= n ? 1 : 0) +
      (core && h[6]! >= n * 4 && h[0]! >= n ? 1 : 0)
    );
  };
  const line = (read: (i: number) => boolean) => {
    let runColor = false;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < size; i += 1) {
      if (read(i) === runColor) {
        run += 1;
        if (run === 5) result += 3;
        else if (run > 5) result += 1;
      } else {
        addHistory(run, history);
        if (!runColor) result += countPatterns(history) * 40;
        runColor = read(i);
        run = 1;
      }
    }
    if (runColor) {
      addHistory(run, history);
      run = 0;
    }
    run += size;
    addHistory(run, history);
    result += countPatterns(history) * 40;
  };
  for (let y = 0; y < size; y += 1) line((x) => at(x, y));
  for (let x = 0; x < size; x += 1) line((y) => at(x, y));
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1))
        result += 3;
    }
  }
  const dark = modules.filter(Boolean).length;
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return result;
}

/**
 * The dark modules as one SVG path in module units, offset by a quiet zone
 * (four modules, the standard): draw it in a `viewBox` of `size + 2 * quiet`.
 */
export function qrPath(matrix: QrMatrix, quiet = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y * matrix.size + x])
        parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return parts.join("");
}
