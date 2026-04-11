import type { OutlineKind } from "./types";
import { specJsonToFormFields } from "./spec-form";

export type ContentOutlineApiRow = {
  id: string;
  name: string;
  kind: OutlineKind;
  is_default: boolean;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
  userPromptTemplate: string;
  systemPromptSuffix: string;
  insiderSystemPrompt: string;
};

export function dbRowToApiOutline(row: {
  id: string;
  name: string;
  kind: string;
  is_default: boolean;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
  spec_json: unknown;
}): ContentOutlineApiRow {
  const kind = row.kind as OutlineKind;
  const form = specJsonToFormFields(kind, row.spec_json);
  return {
    id: row.id,
    name: row.name,
    kind,
    is_default: row.is_default,
    disabled_at: row.disabled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    userPromptTemplate: form.userPromptTemplate,
    systemPromptSuffix: form.systemPromptSuffix,
    insiderSystemPrompt: form.insiderSystemPrompt,
  };
}
