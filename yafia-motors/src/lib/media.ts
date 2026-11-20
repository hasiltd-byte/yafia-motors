export const mediaTypes: Record<string, { extension: string; limit: number }> = {
  'image/jpeg': { extension: 'jpg', limit: 20 * 1024 * 1024 },
  'image/png': { extension: 'png', limit: 20 * 1024 * 1024 },
  'image/webp': { extension: 'webp', limit: 20 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', limit: 200 * 1024 * 1024 },
  'video/webm': { extension: 'webm', limit: 200 * 1024 * 1024 },
};
export function validMediaHeader(mime: string, bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (mime === 'image/jpeg') return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === 'image/png')
    return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp')
    return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'video/mp4') return b.toString('ascii', 4, 8) === 'ftyp';
  if (mime === 'video/webm') return b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  return false;
}
