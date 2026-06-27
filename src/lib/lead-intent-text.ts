export interface IntentTextSources {
  fieldData?: { name: string; values: string[] }[];
  formName?: string | null;
  adName?: string | null;
  campaignName?: string | null;
  message?: string | null;
}

/** Nối mọi nguồn văn bản của lead thành 1 chuỗi để dò dòng xe. */
export function gatherIntentText(src: IntentTextSources): string {
  const parts: string[] = [];
  for (const f of src.fieldData ?? []) {
    for (const v of f.values ?? []) if (v) parts.push(v);
  }
  if (src.formName) parts.push(src.formName);
  if (src.adName) parts.push(src.adName);
  if (src.campaignName) parts.push(src.campaignName);
  if (src.message) parts.push(src.message);
  return parts.join(' ').trim();
}
