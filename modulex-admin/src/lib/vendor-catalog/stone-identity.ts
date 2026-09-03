export type StoneIdentityInput = {
  familyKey: string | null;
  fallbackFamilyCode: string;
  categoryName: string;
  externalId: string;
  title: string;
  variantCode: string | null;
  finish: string | null;
};

function normalizedCode(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function titleQualifier(title: string) {
  const normalized = title.toUpperCase();
  if (/\bPSJQ\b/.test(normalized)) return "PSJQ";
  if (/\bSJQ\b/.test(normalized)) return "SJQ";
  if (/\bJUMBO\b/.test(normalized)) return "JUMBO";
  if (/\bOUTDOOR\b/.test(normalized)) return "OUTDOOR";
  return null;
}

function appendToken(code: string, token: string | null) {
  if (!token) return code;
  const normalizedToken = normalizedCode(token, "");
  if (!normalizedToken) return code;
  const segments = code.split("-");
  if (segments.includes(normalizedToken)) return code;
  return normalizedCode(`${code}-${normalizedToken}`, code);
}

export function buildStoneIdentityCandidates(input: StoneIdentityInput) {
  const fallbackFamilyCode = normalizedCode(input.fallbackFamilyCode, "STONE-PRODUCT");
  const baseFamilyCode = normalizedCode(input.familyKey?.trim() || fallbackFamilyCode, fallbackFamilyCode);
  const categoryToken = normalizedCode(input.categoryName, "STONE");
  const categoryFamilyCode =
    baseFamilyCode === categoryToken || baseFamilyCode.endsWith(`-${categoryToken}`)
      ? baseFamilyCode
      : normalizedCode(`${baseFamilyCode}-${categoryToken}`, baseFamilyCode);

  let baseVariantCode = normalizedCode(input.variantCode?.trim() || "DEFAULT", "DEFAULT");
  baseVariantCode = appendToken(baseVariantCode, titleQualifier(input.title));
  baseVariantCode = appendToken(baseVariantCode, input.finish);

  const externalToken = normalizedCode(input.externalId, "SOURCE");
  const disambiguatedVariantCode = normalizedCode(
    `${baseVariantCode}-${externalToken}`,
    baseVariantCode
  );

  return {
    baseFamilyCode,
    categoryFamilyCode,
    baseVariantCode,
    disambiguatedVariantCode,
  };
}
