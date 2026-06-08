export function setFileDragData(dataTransfer: DataTransfer, paths: string[]) {
  const urls = paths.map(fileUrlFromPath);
  const uriList = urls.join("\r\n");
  dataTransfer.effectAllowed = "copy";
  dataTransfer.dropEffect = "copy";
  dataTransfer.setData("text/uri-list", uriList);
  dataTransfer.setData("text/plain", paths.join("\n"));
  if (urls.length === 1) {
    dataTransfer.setData("DownloadURL", `application/octet-stream:${fileName(paths[0])}:${urls[0]}`);
  }
}

export function fileUrlFromPath(path: string) {
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

function fileName(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "ClipFlow item";
}
