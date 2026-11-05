import "server-only";

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

import { z } from "zod";

/**
 * Password hashing with scrypt from node:crypto, so there is no native
 * dependency to build on Vercel. The parameters are stored inside each hash,
 * which lets them be raised later without invalidating existing passwords.
 *
 * Format: `scrypt$N$r$p$saltB64$hashB64`.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const passwordSchema = z
  .string()
  .min(10, { error: "Use at least 10 characters" })
  .max(200, { error: "Password cannot exceed 200 characters" });

function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function derive(
  password: string,
  salt: Uint8Array,
  n: number,
  r: number,
  p: number,
): Promise<Uint8Array> {
  // scrypt needs ~128 * N * r bytes; leave headroom over the 32 MiB default.
  const options: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(new Uint8Array(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(randomBytes(SALT_LENGTH));
  const key = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, toB64(salt), toB64(key)].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) {
    return false;
  }
  const expected = fromB64(hashB64);
  const actual = await derive(
    password,
    fromB64(saltB64),
    Number(n),
    Number(r),
    Number(p),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A real hash that matches no password. Verifying against it when the account
 * does not exist keeps "unknown email" and "wrong password" equally slow, so
 * response time does not reveal which emails are registered.
 */
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(toB64(new Uint8Array(randomBytes(24))));
  return decoy;
}
