import { verifyAnchor } from "./anchor";

function getSegmentArg(): string | undefined {
  const idx = process.argv.indexOf("--segment");
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

try {
  const segmentId = getSegmentArg();
  const result = verifyAnchor(segmentId);

  if (!result.ok) {
    console.log("Anchor verification: FAIL ❌");
    for (const e of result.errors) console.log(`  - ${e}`);
    process.exit(1);
  }

  console.log("Anchor verification: ALL OK ✅");
  if (result.anchor) {
    console.log(`  segment: ${result.anchor.segmentId}`);
    console.log(`  backend: ${result.anchor.backend}`);
    console.log(`  anchorRef: ${result.anchor.anchorRef}`);
  }
} catch (err: any) {
  console.error(`Anchor verification crashed: ${err?.message ?? String(err)}`);
  process.exit(1);
}
