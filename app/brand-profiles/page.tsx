"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Star } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";

type ListItem = { id: string; name: string; created_at: string };

type FullProfile = {
  id: string;
  workspace_id: string;
  name: string;
  voice_rules_json: unknown;
  formatting_rules_json: unknown;
  forbidden_patterns_json: unknown;
  cta_rules_json: unknown;
  emoji_policy_json: unknown;
  narrative_preferences_json: unknown;
  profile_version: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_model_id: string | null;
  created_at: string;
};

const jsonTextareaClass =
  "font-mono text-xs min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary";

const DEFAULT_OBJECTS = {
  voice_rules_json: "{\n  \n}",
  formatting_rules_json: "{\n  \n}",
  forbidden_patterns_json: "[]",
  cta_rules_json: "{\n  \n}",
  emoji_policy_json: "{\n  \n}",
  narrative_preferences_json: "{\n  \n}",
};

function applyProfileToForm(p: FullProfile) {
  return {
    name: p.name,
    profile_version: p.profile_version ?? "1.0",
    elevenlabs_voice_id: p.elevenlabs_voice_id ?? "",
    elevenlabs_model_id: p.elevenlabs_model_id ?? "",
    voice_rules_json: JSON.stringify(p.voice_rules_json ?? {}, null, 2),
    formatting_rules_json: JSON.stringify(p.formatting_rules_json ?? {}, null, 2),
    forbidden_patterns_json: JSON.stringify(p.forbidden_patterns_json ?? [], null, 2),
    cta_rules_json: JSON.stringify(p.cta_rules_json ?? {}, null, 2),
    emoji_policy_json: JSON.stringify(p.emoji_policy_json ?? {}, null, 2),
    narrative_preferences_json: JSON.stringify(p.narrative_preferences_json ?? {}, null, 2),
  };
}

export default function BrandProfilesPage() {
  const [list, setList] = useState<ListItem[]>([]);
  const [defaultBrandProfileId, setDefaultBrandProfileId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isNew, setIsNew] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [name, setName] = useState("");
  const [profileVersion, setProfileVersion] = useState("1.0");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("");
  const [elevenlabsModelId, setElevenlabsModelId] = useState("");
  const [voiceJson, setVoiceJson] = useState(DEFAULT_OBJECTS.voice_rules_json);
  const [formattingJson, setFormattingJson] = useState(DEFAULT_OBJECTS.formatting_rules_json);
  const [forbiddenJson, setForbiddenJson] = useState(DEFAULT_OBJECTS.forbidden_patterns_json);
  const [ctaJson, setCtaJson] = useState(DEFAULT_OBJECTS.cta_rules_json);
  const [emojiJson, setEmojiJson] = useState(DEFAULT_OBJECTS.emoji_policy_json);
  const [narrativeJson, setNarrativeJson] = useState(DEFAULT_OBJECTS.narrative_preferences_json);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError("");
    const res = await fetch("/api/brand-profiles/list");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load profiles");
      setLoadingList(false);
      return;
    }
    const profiles = (data.brandProfiles as ListItem[]) ?? [];
    setList(profiles);
    setDefaultBrandProfileId(
      typeof data.defaultBrandProfileId === "string" ? data.defaultBrandProfileId : null
    );
    setLoadingList(false);
  }, []);

  const resetNewForm = useCallback(() => {
    setIsNew(true);
    setSelectedId("");
    setName("");
    setProfileVersion("1.0");
    setElevenlabsVoiceId("");
    setElevenlabsModelId("");
    setVoiceJson(DEFAULT_OBJECTS.voice_rules_json);
    setFormattingJson(DEFAULT_OBJECTS.formatting_rules_json);
    setForbiddenJson(DEFAULT_OBJECTS.forbidden_patterns_json);
    setCtaJson(DEFAULT_OBJECTS.cta_rules_json);
    setEmojiJson(DEFAULT_OBJECTS.emoji_policy_json);
    setNarrativeJson(DEFAULT_OBJECTS.narrative_preferences_json);
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingProfile(true);
    setError("");
    setMessage("");
    setIsNew(false);
    const res = await fetch(`/api/brand-profiles/${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load profile");
      setLoadingProfile(false);
      return;
    }
    const p = data.profile as FullProfile | undefined;
    if (!p) {
      setError("Invalid response");
      setLoadingProfile(false);
      return;
    }
    const f = applyProfileToForm(p);
    setName(f.name);
    setProfileVersion(f.profile_version);
    setElevenlabsVoiceId(f.elevenlabs_voice_id);
    setElevenlabsModelId(f.elevenlabs_model_id);
    setVoiceJson(f.voice_rules_json);
    setFormattingJson(f.formatting_rules_json);
    setForbiddenJson(f.forbidden_patterns_json);
    setCtaJson(f.cta_rules_json);
    setEmojiJson(f.emoji_policy_json);
    setNarrativeJson(f.narrative_preferences_json);
    setSelectedId(id);
    setLoadingProfile(false);
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function parseJsonField(raw: string, label: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`${label} is not valid JSON`);
    }
  }

  function buildBody() {
    const voice_rules_json = parseJsonField(voiceJson, "Voice rules");
    const formatting_rules_json = parseJsonField(formattingJson, "Formatting rules");
    const forbidden_patterns_json = parseJsonField(forbiddenJson, "Forbidden patterns");
    const cta_rules_json = parseJsonField(ctaJson, "CTA rules");
    const emoji_policy_json = parseJsonField(emojiJson, "Emoji policy");
    const narrative_preferences_json = parseJsonField(narrativeJson, "Narrative preferences");

    return {
      name: name.trim(),
      profile_version: profileVersion.trim() || null,
      elevenlabs_voice_id: elevenlabsVoiceId.trim() || null,
      elevenlabs_model_id: elevenlabsModelId.trim() || null,
      voice_rules_json,
      formatting_rules_json,
      forbidden_patterns_json,
      cta_rules_json,
      emoji_policy_json,
      narrative_preferences_json,
    };
  }

  async function saveProfile() {
    setMessage("");
    setError("");
    let body: Record<string, unknown>;
    try {
      body = buildBody();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch("/api/brand-profiles/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Create failed");
          return;
        }
        const id = data.id as string | undefined;
        setMessage("Profile created.");
        await loadList();
        if (id) await loadProfile(id);
        else resetNewForm();
      } else if (selectedId) {
        const res = await fetch(`/api/brand-profiles/${encodeURIComponent(selectedId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Save failed");
          return;
        }
        setMessage("Saved.");
        await loadList();
        await loadProfile(selectedId);
      }
    } finally {
      setSaving(false);
    }
  }

  async function makeWorkspaceDefault() {
    if (!selectedId || isNew) {
      setError("Save the profile first, then set as default.");
      return;
    }
    setSettingDefault(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultBrandProfileId: selectedId }),
    });
    const data = await res.json().catch(() => ({}));
    setSettingDefault(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not update default");
      return;
    }
    setDefaultBrandProfileId(selectedId);
    setMessage("Workspace default updated.");
    await loadList();
  }

  async function clearWorkspaceDefault() {
    setSettingDefault(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultBrandProfileId: null }),
    });
    const data = await res.json().catch(() => ({}));
    setSettingDefault(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not clear default");
      return;
    }
    setDefaultBrandProfileId(null);
    setMessage("Workspace default cleared.");
    await loadList();
  }

  const selectClass =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors";

  return (
    <div className="p-6 lg:p-10 max-w-[1100px]">
      <PageHeader
        title="Brand profiles"
        description="Voice rules, formatting, ElevenLabs defaults, and workspace default for Issues and content products"
      />

      <div className="rounded-xl border border-border bg-card p-5 mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
            Profile
          </label>
          <select
            className={cn(selectClass, "w-full")}
            value={isNew ? "__new__" : selectedId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setIsNew(false);
                setSelectedId("");
                setMessage("");
                setError("");
                return;
              }
              if (v === "__new__") resetNewForm();
              else void loadProfile(v);
            }}
            disabled={loadingList}
          >
            <option value="">— Select —</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {defaultBrandProfileId === p.id ? " ★" : ""}
              </option>
            ))}
            <option value="__new__">+ New profile</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => resetNewForm()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
        {(selectedId || isNew) && (
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={saving || loadingProfile}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? "Create" : "Save"}
          </button>
        )}
        {selectedId && !isNew && (
          <>
            <button
              type="button"
              onClick={() => void makeWorkspaceDefault()}
              disabled={settingDefault || defaultBrandProfileId === selectedId}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-50 transition-colors"
            >
              <Star className="h-4 w-4" />
              Set as workspace default
            </button>
            {defaultBrandProfileId && (
              <button
                type="button"
                onClick={() => void clearWorkspaceDefault()}
                disabled={settingDefault}
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Clear default
              </button>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger mb-4">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground mb-4">
          {message}
        </div>
      )}

      {(selectedId || isNew) && (
        <div className="space-y-6">
          {loadingProfile && !isNew && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Name
              </label>
              <input
                className={cn(selectClass, "w-full")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Identity Jedi"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Profile version
              </label>
              <input
                className={cn(selectClass, "w-full")}
                value={profileVersion}
                onChange={(e) => setProfileVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                ElevenLabs voice ID
              </label>
              <input
                className={cn(selectClass, "w-full")}
                value={elevenlabsVoiceId}
                onChange={(e) => setElevenlabsVoiceId(e.target.value)}
                placeholder="Optional; used for podcast TTS when draft uses this profile"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                ElevenLabs model ID
              </label>
              <input
                className={cn(selectClass, "w-full")}
                value={elevenlabsModelId}
                onChange={(e) => setElevenlabsModelId(e.target.value)}
                placeholder="e.g. eleven_turbo_v2_5"
              />
            </div>
          </div>

          <div className="space-y-4">
            {(
              [
                ["Voice rules (object)", voiceJson, setVoiceJson],
                ["Formatting rules (object)", formattingJson, setFormattingJson],
                ["Forbidden patterns (array)", forbiddenJson, setForbiddenJson],
                ["CTA rules (object)", ctaJson, setCtaJson],
                ["Emoji policy (object)", emojiJson, setEmojiJson],
                ["Narrative preferences (object)", narrativeJson, setNarrativeJson],
              ] as const
            ).map(([label, value, setter]) => (
              <div key={label}>
                <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                  {label}
                </label>
                <textarea
                  className={jsonTextareaClass}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!selectedId && !isNew && !loadingList && (
        <p className="text-sm text-muted-foreground">Select a profile or create a new one.</p>
      )}
    </div>
  );
}
