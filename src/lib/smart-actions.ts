import { copyTextToClipboard } from "./api";
import type { ClipboardItem } from "./types";

export interface SmartAction {
  id: string;
  label: string;
  run: () => Promise<string>;
}

function isUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanUrl(value: string) {
  const url = new URL(value.trim());
  [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
  ].forEach((param) => url.searchParams.delete(param));
  return url.toString();
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function copyTransformed(value: string, message: string) {
  await copyTextToClipboard(value, message);
  return value;
}

export function getImageOcrText(item: ClipboardItem) {
  if (item.itemType !== "image") return "";
  const lines = item.content.split(/\r?\n/);
  if (!lines[0]?.startsWith("Screenshot ·")) return "";
  return lines.slice(1).join("\n").trim();
}

export function smartActionsForItem(item: ClipboardItem): SmartAction[] {
  const content = item.content.trim();
  const actions: SmartAction[] = [];

  const ocrText = getImageOcrText(item);
  if (ocrText) {
    actions.push({
      id: "copy-ocr-text",
      label: "Copy extracted text",
      run: () => copyTransformed(ocrText, "Copied extracted text"),
    });
  }

  if (isUrl(content)) {
    actions.push({
      id: "copy-clean-url",
      label: "Copy clean URL",
      run: () => copyTransformed(cleanUrl(content), "Copied clean URL"),
    });
    actions.push({
      id: "copy-markdown-link",
      label: "Copy Markdown link",
      run: () => copyTransformed(`[${content.replace(/^https?:\/\//, "")}](${content})`, "Copied Markdown link"),
    });
  }

  const parsedJson = tryParseJson(content);
  if (parsedJson !== null) {
    actions.push({
      id: "copy-pretty-json",
      label: "Copy pretty JSON",
      run: () => copyTransformed(JSON.stringify(parsedJson, null, 2), "Copied pretty JSON"),
    });
    actions.push({
      id: "copy-minified-json",
      label: "Copy minified JSON",
      run: () => copyTransformed(JSON.stringify(parsedJson), "Copied minified JSON"),
    });
  }

  if (item.itemType === "text" || item.itemType === "code") {
    const slug = slugify(content);
    if (slug && slug !== content) {
      actions.push({
        id: "copy-slug",
        label: "Copy slug",
        run: () => copyTransformed(slug, "Copied slug"),
      });
    }
  }

  return actions;
}
