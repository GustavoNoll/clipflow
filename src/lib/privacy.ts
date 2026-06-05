const SENSITIVE_PATTERNS = [
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b/i,
  /\b(bearer|basic)\s+[a-z0-9._~+/=-]{16,}/i,
  /\b[A-Za-z0-9_=-]{24,}\.[A-Za-z0-9_=-]{16,}\.[A-Za-z0-9_=-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

export function isSensitiveContent(value: string) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

export function privacyPreview(value: string, enabled: boolean) {
  if (!enabled || !isSensitiveContent(value)) return value;
  return "Sensitive content hidden";
}
