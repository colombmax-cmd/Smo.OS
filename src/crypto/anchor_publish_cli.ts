import { publishAnchor } from "./anchor";

function getSegmentArg(): string | undefined {
  const idx = process.argv.indexOf("--segment");
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

try {
  const segmentId = getSegmentArg();
  const anchor = publishAnchor(segmentId);

  console.log(`Anchored ${anchor.segmentId} ✅`);
  console.log(`  backend: ${anchor.backend}`);
  console.log(`  anchorRef: ${anchor.anchorRef}`);
  console.log(`  anchoredAt: ${anchor.anchoredAt}`);
} catch (err: any) {
  console.error(`Anchor publish failed: ${err?.message ?? String(err)}`);
  process.exit(1);
}
