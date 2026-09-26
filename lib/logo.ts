import { Asset } from "expo-asset";
import { File } from "expo-file-system";

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

/** App icon as a data URI for embedding in the PDF report. */
export async function loadLogoDataUri(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const [{ localUri }] = await Asset.loadAsync(
      require("@/assets/images/icon.png")
    );
    if (!localUri) return null;
    const file = new File(localUri);
    const buffer = await file.arrayBuffer();
    return `data:image/png;base64,${bytesToBase64(new Uint8Array(buffer))}`;
  } catch {
    return null;
  }
}
