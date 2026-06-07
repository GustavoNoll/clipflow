import {
  Archive,
  Disc3,
  File,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import type { ClipboardItem } from "../lib/types";
import { cn } from "../lib/utils";

interface FileIconProps {
  item: ClipboardItem;
  className?: string;
  size?: "xs" | "sm" | "md";
  title?: string;
}

const sizeClasses = {
  xs: "h-4 w-4 rounded-[4px]",
  sm: "h-[18px] w-[18px] rounded-[5px]",
  md: "h-6 w-6 rounded-[6px]",
};

const glyphSizes = {
  xs: 11,
  sm: 13,
  md: 16,
};

const extensionStyles: Record<
  string,
  {
    Icon: LucideIcon;
    bg: string;
    fg: string;
    label?: string;
  }
> = {
  dmg: { Icon: Disc3, bg: "bg-zinc-100", fg: "text-zinc-700", label: "DMG" },
  app: { Icon: Disc3, bg: "bg-zinc-100", fg: "text-zinc-700", label: "APP" },
  pdf: { Icon: FileText, bg: "bg-red-500", fg: "text-white", label: "PDF" },
  doc: { Icon: FileText, bg: "bg-blue-500", fg: "text-white", label: "DOC" },
  docx: { Icon: FileText, bg: "bg-blue-500", fg: "text-white", label: "DOC" },
  txt: { Icon: FileText, bg: "bg-zinc-500", fg: "text-white", label: "TXT" },
  md: { Icon: FileText, bg: "bg-zinc-700", fg: "text-white", label: "MD" },
  csv: { Icon: FileSpreadsheet, bg: "bg-emerald-500", fg: "text-white", label: "CSV" },
  xls: { Icon: FileSpreadsheet, bg: "bg-emerald-600", fg: "text-white", label: "XLS" },
  xlsx: { Icon: FileSpreadsheet, bg: "bg-emerald-600", fg: "text-white", label: "XLS" },
  numbers: { Icon: FileSpreadsheet, bg: "bg-emerald-500", fg: "text-white", label: "NUM" },
  zip: { Icon: Archive, bg: "bg-amber-500", fg: "text-white", label: "ZIP" },
  rar: { Icon: Archive, bg: "bg-amber-500", fg: "text-white", label: "RAR" },
  "7z": { Icon: Archive, bg: "bg-amber-500", fg: "text-white", label: "7Z" },
  tar: { Icon: Archive, bg: "bg-amber-500", fg: "text-white", label: "TAR" },
  gz: { Icon: Archive, bg: "bg-amber-500", fg: "text-white", label: "GZ" },
  png: { Icon: FileImage, bg: "bg-fuchsia-500", fg: "text-white", label: "IMG" },
  jpg: { Icon: FileImage, bg: "bg-fuchsia-500", fg: "text-white", label: "IMG" },
  jpeg: { Icon: FileImage, bg: "bg-fuchsia-500", fg: "text-white", label: "IMG" },
  webp: { Icon: FileImage, bg: "bg-fuchsia-500", fg: "text-white", label: "IMG" },
  gif: { Icon: FileImage, bg: "bg-fuchsia-500", fg: "text-white", label: "GIF" },
  svg: { Icon: FileCode2, bg: "bg-orange-500", fg: "text-white", label: "SVG" },
  js: { Icon: FileCode2, bg: "bg-yellow-400", fg: "text-zinc-950", label: "JS" },
  ts: { Icon: FileCode2, bg: "bg-blue-500", fg: "text-white", label: "TS" },
  jsx: { Icon: FileCode2, bg: "bg-sky-500", fg: "text-white", label: "JSX" },
  tsx: { Icon: FileCode2, bg: "bg-sky-600", fg: "text-white", label: "TSX" },
  json: { Icon: FileCode2, bg: "bg-zinc-700", fg: "text-white", label: "JSON" },
  html: { Icon: FileCode2, bg: "bg-orange-500", fg: "text-white", label: "HTML" },
  css: { Icon: FileCode2, bg: "bg-blue-500", fg: "text-white", label: "CSS" },
  mov: { Icon: FileVideo, bg: "bg-violet-500", fg: "text-white", label: "MOV" },
  mp4: { Icon: FileVideo, bg: "bg-violet-500", fg: "text-white", label: "MP4" },
  mp3: { Icon: FileAudio, bg: "bg-pink-500", fg: "text-white", label: "MP3" },
  wav: { Icon: FileAudio, bg: "bg-pink-500", fg: "text-white", label: "WAV" },
};

export function isDownloadFileItem(item: ClipboardItem) {
  return item.itemType === "file" || item.id.startsWith("download:") || item.categoryId === -2;
}

export function FileIcon({ item, className, size = "sm", title }: FileIconProps) {
  const extension = fileExtension(item);
  const style = (extension ? extensionStyles[extension] : undefined) ?? {
    Icon: File,
    bg: "bg-zinc-500",
    fg: "text-white",
    label: extension ? extension.slice(0, 3).toUpperCase() : "FILE",
  };
  const { Icon } = style;

  return (
    <span
      title={title ?? item.fileName ?? item.preview}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] ring-1 ring-black/5",
        sizeClasses[size],
        style.bg,
        style.fg,
        className,
      )}
    >
      <Icon size={glyphSizes[size]} strokeWidth={2.2} />
      {size === "md" && style.label && (
        <span className="absolute bottom-0 left-0 right-0 bg-black/18 px-0.5 text-center text-[5px] leading-[7px] tracking-[-0.02em]">
          {style.label}
        </span>
      )}
    </span>
  );
}

function fileExtension(item: ClipboardItem) {
  const name = item.fileName ?? item.preview ?? item.content;
  const clean = name.split(/[?#]/)[0]?.trim();
  const match = clean?.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase();
}
