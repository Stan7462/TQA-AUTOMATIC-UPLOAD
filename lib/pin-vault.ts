function bytesFromHex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Invalid PIN encryption data");
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function keyFromSecret(secret: string | undefined): Promise<CryptoKey> {
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) throw new Error("PIN encryption key is unavailable");
  return crypto.subtle.importKey("raw", bytesFromHex(secret), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPin(pin: string, secret: string | undefined): Promise<string> {
  const key = await keyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pin)));
  return hex(iv) + ":" + hex(ciphertext);
}

export async function decryptPin(value: string, secret: string | undefined): Promise<string> {
  const [ivHex, dataHex] = value.split(":");
  if (!ivHex || !dataHex || !/^[0-9a-f]{24}$/i.test(ivHex)) throw new Error("Invalid PIN encryption data");
  const key = await keyFromSecret(secret);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesFromHex(ivHex) }, key, bytesFromHex(dataHex));
  const pin = new TextDecoder().decode(decrypted);
  if (!/^\d{5}$/.test(pin)) throw new Error("Invalid PIN encryption data");
  return pin;
}
