const SENSITIVE_PATTERNS = [
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b/i,
  /\b(bearer|basic)\s+[a-z0-9._~+/=-]{16,}/i,
  /\b[A-Za-z0-9_=-]{24,}\.[A-Za-z0-9_=-]{16,}\.[A-Za-z0-9_=-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

export function isSensitiveContent(value: string) {
  return (
    SENSITIVE_PATTERNS.some((pattern) => pattern.test(value)) ||
    hasHighEntropyToken(value)
  );
}

export function privacyPreview(value: string, enabled: boolean) {
  if (!enabled || !isSensitiveContent(value)) return value;
  return "Sensitive content hidden";
}

function hasHighEntropyToken(value: string) {
  return tokenCandidates(value).some((token) => {
    if (token.length < 16 || token.length > 128) return false;
    if (looksLikeHumanLabel(token)) return false;
    if (countDigits(token) < 2) return false;
    if (characterClassCount(token) < 3) return false;
    if (uniqueRatio(token) < 0.45) return false;
    return shannonEntropy(token) >= 3.45;
  });
}

function looksLikeHumanLabel(value: string) {
  const wordSegments = value
    .split(/[_-]+/)
    .filter((segment) => /^[A-Za-z]{3,}$/.test(segment));
  return wordSegments.length >= 2;
}

function tokenCandidates(value: string) {
  return value.match(/[A-Za-z0-9_-]{16,}/g) ?? [];
}

function countDigits(value: string) {
  return (value.match(/\d/g) ?? []).length;
}

function characterClassCount(value: string) {
  return [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[_-]/.test(value),
  ].filter(Boolean).length;
}

function uniqueRatio(value: string) {
  return new Set(value).size / value.length;
}

function shannonEntropy(value: string) {
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}
