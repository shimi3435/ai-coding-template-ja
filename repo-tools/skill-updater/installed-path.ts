import { validateCanonicalPath } from "./canonical.ts";
import { resourceLimits } from "./legal.ts";

export function validateInstalledTraversalPath(relative: string): void {
  validateCanonicalPath(relative);
  if (Buffer.byteLength(relative, "utf8") > resourceLimits.pathBytes) {
    throw new Error(`installed tree pathが${resourceLimits.pathBytes} bytesを超えています: ${relative}`);
  }
  for (const segment of relative.split("/")) {
    if (Buffer.byteLength(segment, "utf8") > resourceLimits.pathSegmentBytes) {
      throw new Error(`installed tree path segmentが${resourceLimits.pathSegmentBytes} bytesを超えています: ${relative}`);
    }
  }
}
