import { rotateActiveKey } from "./sign";

function getOriginArg(): string | undefined {
  const idx = process.argv.indexOf("--origin");
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

try {
  const result = rotateActiveKey(getOriginArg());
  console.log("Key rotation: OK ✅");
  console.log(`  oldKeyId: ${result.oldKeyId}`);
  console.log(`  newKeyId: ${result.newKeyId}`);
  console.log(`  rotatedAt: ${result.rotatedAt}`);
} catch (err: any) {
  console.error(`Key rotation failed: ${err?.message ?? String(err)}`);
  process.exit(1);
}
