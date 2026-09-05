import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_PREFIX = "scrypt$v1";
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_SALT_BYTES = 16;
const LEGACY_HASH_PATTERN = /^[a-f0-9]{64}$/i;

export type PasswordVerification = {
  valid: boolean;
  needsRehash: boolean;
};

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, SCRYPT_KEY_BYTES, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(password, salt);
  return `${SCRYPT_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function legacyHashPassword(password: string): string {
  return createHash("sha256")
    .update(password + "quae_salt_2024")
    .digest("hex");
}

function equalBuffers(actual: Buffer, expected: Buffer): boolean {
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<PasswordVerification> {
  if (LEGACY_HASH_PATTERN.test(storedHash)) {
    const actual = Buffer.from(legacyHashPassword(password), "hex");
    const expected = Buffer.from(storedHash, "hex");
    const valid = equalBuffers(actual, expected);
    return { valid, needsRehash: valid };
  }

  const [algorithm, version, encodedSalt, encodedHash, ...extra] =
    storedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    version !== "v1" ||
    !encodedSalt ||
    !encodedHash ||
    extra.length > 0
  ) {
    return { valid: false, needsRehash: false };
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expected = Buffer.from(encodedHash, "base64url");
    if (
      salt.length !== SCRYPT_SALT_BYTES ||
      expected.length !== SCRYPT_KEY_BYTES
    ) {
      return { valid: false, needsRehash: false };
    }
    const actual = await scrypt(password, salt);
    return { valid: equalBuffers(actual, expected), needsRehash: false };
  } catch {
    return { valid: false, needsRehash: false };
  }
}
