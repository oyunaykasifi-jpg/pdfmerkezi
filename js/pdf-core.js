window.PDFMerkezi = window.PDFMerkezi || {};

window.PDFMerkezi.utils = {
  formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  },

  isPdfFile(file) {
    if (!file) return false;
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();

    return (
      name.endsWith(".pdf") ||
      type === "application/pdf" ||
      type.includes("pdf")
    );
  },

  sanitizeFileName(name) {
    return String(name || "dosya")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "pdf";
  },

  createDownloadUrl(bytes, mimeType = "application/pdf") {
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  },

  revokeDownloadUrl(url) {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
};