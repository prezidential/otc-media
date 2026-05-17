"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, ChevronLeft, Plus, X, Loader2, Wand2 } from "lucide-react";
import { studioInner } from "@/lib/studio/inner-classes";
import { cn } from "@/lib/utils";

// ─── Wizard data shape ────────────────────────────────────────────────────────

type WizardData = {
  // Step 1: Basics
  name: string;
  profileVersion: string;
  elevenlabsVoiceId: string;
  elevenlabsModelId: string;
  // Step 2: Voice
  voiceName: string;
  tone: string[];
  style: string[];
  audience: string[];
  stance: string[];
  // Step 3: Formatting
  paragraphLength: string;
  preferredStructures: string[];
  avoidStructures: string[];
  // Step 4: Forbidden patterns
  forbiddenPatterns: string[];
  // Step 5: CTAs
  defaultCta: string;
  allowedCtaStyles: string[];
  maxPrimaryCtas: string;
  // Step 6: Emoji
  emojiAllowed: boolean;
  allowedEmojis: string[];
  emojiGuidance: string;
  // Step 7: Narrative
  coreThesis: string[];
  recurringAngles: string[];
  skepticismTriggers: string[];
};

const INITIAL_DATA: WizardData = {
  name: "",
  profileVersion: "1.0",
  elevenlabsVoiceId: "",
  elevenlabsModelId: "",
  voiceName: "",
  tone: [],
  style: [],
  audience: [],
  stance: [],
  paragraphLength: "",
  preferredStructures: [],
  avoidStructures: [],
  forbiddenPatterns: [],
  defaultCta: "",
  allowedCtaStyles: [],
  maxPrimaryCtas: "1",
  emojiAllowed: false,
  allowedEmojis: [],
  emojiGuidance: "",
  coreThesis: [],
  recurringAngles: [],
  skepticismTriggers: [],
};

const STEP_COUNT = 7;

const STEP_META = [
  {
    title: "Profile basics",
    description: "Give this profile a name and optional technical settings.",
  },
  {
    title: "Voice & tone",
    description: "Define how this brand speaks — its name, tone, style, and audience.",
  },
  {
    title: "Formatting",
    description: "Set the structural rules for how content is written.",
  },
  {
    title: "Forbidden patterns",
    description: "List phrases and clichés this brand should never say.",
  },
  {
    title: "CTAs",
    description: "Define the call-to-action style and how many primary CTAs are allowed.",
  },
  {
    title: "Emoji policy",
    description: "Set whether emojis are allowed and any usage guidance.",
  },
  {
    title: "Narrative",
    description: "Define the core thesis, recurring angles, and skepticism filters.",
  },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <label
      className={cn(
        studioInner.sectionLabel,
        "block mb-1.5"
      )}
    >
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-[#9C8E78] mt-0.5 mb-2">{children}</p>;
}

function TagListInput({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addItem() {
    const trimmed = input.trim();
    if (trimmed) {
      onChange([...items, trimmed]);
      setInput("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={cn(studioInner.input, "flex-1")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder ?? "Type and press Enter to add"}
        />
        <button type="button" onClick={addItem} className={studioInner.btnSecondary}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-[#E4D9C2] bg-[#F5EFE4] px-2.5 py-1 text-[12px] text-[#1F1A14]"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="ml-0.5 text-[#9C8E78] hover:text-[#C8571E] transition-colors"
                aria-label={`Remove ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

type StepProps = {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
};

function StepBasics({ data, update }: StepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <SectionLabel>Profile name *</SectionLabel>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Identity Jedi Newsletter"
          autoFocus
        />
      </div>
      <div>
        <SectionLabel>Profile version</SectionLabel>
        <FieldHint>Defaults to 1.0</FieldHint>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.profileVersion}
          onChange={(e) => update("profileVersion", e.target.value)}
          placeholder="1.0"
        />
      </div>
      <div>
        <SectionLabel>ElevenLabs voice ID</SectionLabel>
        <FieldHint>Optional — used for podcast TTS when draft uses this profile</FieldHint>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.elevenlabsVoiceId}
          onChange={(e) => update("elevenlabsVoiceId", e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="sm:col-span-2">
        <SectionLabel>ElevenLabs model ID</SectionLabel>
        <FieldHint>Optional — e.g. eleven_turbo_v2_5</FieldHint>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.elevenlabsModelId}
          onChange={(e) => update("elevenlabsModelId", e.target.value)}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

function StepVoice({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Voice name</SectionLabel>
        <FieldHint>The name or persona for this brand voice, e.g. "The Identity Jedi"</FieldHint>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.voiceName}
          onChange={(e) => update("voiceName", e.target.value)}
          placeholder="e.g. The Identity Jedi"
          autoFocus
        />
      </div>
      <div>
        <SectionLabel>Tone</SectionLabel>
        <FieldHint>How does this voice feel? e.g. direct, confident, human, practical</FieldHint>
        <TagListInput
          items={data.tone}
          onChange={(v) => update("tone", v)}
          placeholder="e.g. direct"
        />
      </div>
      <div>
        <SectionLabel>Style</SectionLabel>
        <FieldHint>What writing style does it use? e.g. conversational, punchy, tight sentences</FieldHint>
        <TagListInput
          items={data.style}
          onChange={(v) => update("style", v)}
          placeholder="e.g. conversational"
        />
      </div>
      <div>
        <SectionLabel>Target audience</SectionLabel>
        <FieldHint>Who is this written for? e.g. IAM leaders, security practitioners</FieldHint>
        <TagListInput
          items={data.audience}
          onChange={(v) => update("audience", v)}
          placeholder="e.g. security practitioners"
        />
      </div>
      <div>
        <SectionLabel>Writing stance</SectionLabel>
        <FieldHint>How does this voice position itself? e.g. zero corporate jargon, blunt when needed</FieldHint>
        <TagListInput
          items={data.stance}
          onChange={(v) => update("stance", v)}
          placeholder="e.g. zero corporate jargon"
        />
      </div>
    </div>
  );
}

function StepFormatting({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Paragraph length</SectionLabel>
        <FieldHint>Describe the ideal paragraph length, e.g. "3-4 sentences"</FieldHint>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.paragraphLength}
          onChange={(e) => update("paragraphLength", e.target.value)}
          placeholder="e.g. 3-4 sentences"
          autoFocus
        />
      </div>
      <div>
        <SectionLabel>Preferred content structures</SectionLabel>
        <FieldHint>Structures the content should follow, e.g. "Strong opening line", "What it means"</FieldHint>
        <TagListInput
          items={data.preferredStructures}
          onChange={(v) => update("preferredStructures", v)}
          placeholder="e.g. Strong opening line"
        />
      </div>
      <div>
        <SectionLabel>Structures to avoid</SectionLabel>
        <FieldHint>Patterns the content should never use, e.g. "forced metaphors"</FieldHint>
        <TagListInput
          items={data.avoidStructures}
          onChange={(v) => update("avoidStructures", v)}
          placeholder="e.g. forced metaphors"
        />
      </div>
    </div>
  );
}

function StepForbidden({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Forbidden phrases & patterns</SectionLabel>
        <FieldHint>
          Clichés, filler phrases, or jargon this brand should never use — e.g. "Here&apos;s the
          thing", "synergy", "empower"
        </FieldHint>
        <TagListInput
          items={data.forbiddenPatterns}
          onChange={(v) => update("forbiddenPatterns", v)}
          placeholder={`e.g. "Here's the thing"`}
        />
      </div>
      {data.forbiddenPatterns.length === 0 && (
        <p className="text-[12px] text-[#9C8E78]">
          No forbidden patterns yet — you can add them now or skip and edit later.
        </p>
      )}
    </div>
  );
}

function StepCta({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Default CTA</SectionLabel>
        <FieldHint>The primary call-to-action verb or phrase, e.g. "Subscribe"</FieldHint>
        <input
          className={cn(studioInner.input, "w-full")}
          value={data.defaultCta}
          onChange={(e) => update("defaultCta", e.target.value)}
          placeholder="e.g. Subscribe"
          autoFocus
        />
      </div>
      <div>
        <SectionLabel>Allowed CTA styles</SectionLabel>
        <FieldHint>What styles are acceptable? e.g. short, direct, no hype</FieldHint>
        <TagListInput
          items={data.allowedCtaStyles}
          onChange={(v) => update("allowedCtaStyles", v)}
          placeholder="e.g. short"
        />
      </div>
      <div>
        <SectionLabel>Max primary CTAs</SectionLabel>
        <FieldHint>Maximum number of primary CTAs per piece of content</FieldHint>
        <input
          type="number"
          min={1}
          max={10}
          className={cn(studioInner.input, "w-24")}
          value={data.maxPrimaryCtas}
          onChange={(e) => update("maxPrimaryCtas", e.target.value)}
        />
      </div>
    </div>
  );
}

function StepEmoji({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Allow emojis?</SectionLabel>
        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={() => update("emojiAllowed", true)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors",
              data.emojiAllowed
                ? "border-[#C8571E] bg-[#C8571E] text-white"
                : "border-[#E4D9C2] bg-transparent text-[#1F1A14] hover:bg-[#EBDFC5]/50"
            )}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => update("emojiAllowed", false)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors",
              !data.emojiAllowed
                ? "border-[#C8571E] bg-[#C8571E] text-white"
                : "border-[#E4D9C2] bg-transparent text-[#1F1A14] hover:bg-[#EBDFC5]/50"
            )}
          >
            No
          </button>
        </div>
      </div>

      {data.emojiAllowed && (
        <>
          <div>
            <SectionLabel>Specific emojis allowed</SectionLabel>
            <FieldHint>Enter each emoji you want to permit, e.g. 🏾, ✅</FieldHint>
            <TagListInput
              items={data.allowedEmojis}
              onChange={(v) => update("allowedEmojis", v)}
              placeholder="e.g. 🏾"
            />
          </div>
          <div>
            <SectionLabel>Usage guidance</SectionLabel>
            <FieldHint>Describe when and how emojis should be used</FieldHint>
            <input
              className={cn(studioInner.input, "w-full")}
              value={data.emojiGuidance}
              onChange={(e) => update("emojiGuidance", e.target.value)}
              placeholder="e.g. Use sparingly and only when natural."
            />
          </div>
        </>
      )}
    </div>
  );
}

function StepNarrative({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Core thesis</SectionLabel>
        <FieldHint>
          Foundational beliefs this brand returns to again and again, e.g. "Identity is the
          security control plane."
        </FieldHint>
        <TagListInput
          items={data.coreThesis}
          onChange={(v) => update("coreThesis", v)}
          placeholder="e.g. Identity is the security control plane."
        />
      </div>
      <div>
        <SectionLabel>Recurring angles</SectionLabel>
        <FieldHint>
          Angles and framings the brand regularly takes, e.g. "Migrations fail because process
          is ignored."
        </FieldHint>
        <TagListInput
          items={data.recurringAngles}
          onChange={(v) => update("recurringAngles", v)}
          placeholder="e.g. AI agents multiply identity risk."
        />
      </div>
      <div>
        <SectionLabel>Skepticism triggers</SectionLabel>
        <FieldHint>Claims or patterns that should trigger healthy skepticism in this voice</FieldHint>
        <TagListInput
          items={data.skepticismTriggers}
          onChange={(v) => update("skepticismTriggers", v)}
          placeholder="e.g. Vendor claims without operational reality"
        />
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface BrandProfileWizardProps {
  onDone: (profileId: string) => void;
  onCancel: () => void;
}

export function BrandProfileWizard({ onDone, onCancel }: BrandProfileWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function validateCurrentStep(): string | null {
    if (step === 0 && !data.name.trim()) return "Profile name is required.";
    return null;
  }

  function handleNext() {
    const err = validateCurrentStep();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  function buildPayload() {
    return {
      name: data.name.trim(),
      profile_version: data.profileVersion.trim() || "1.0",
      elevenlabs_voice_id: data.elevenlabsVoiceId.trim() || null,
      elevenlabs_model_id: data.elevenlabsModelId.trim() || null,
      voice_rules_json: {
        voice_name: data.voiceName,
        tone: data.tone,
        style: data.style,
        audience: data.audience,
        stance: data.stance,
      },
      formatting_rules_json: {
        paragraph_length: data.paragraphLength,
        preferred_structures: data.preferredStructures,
        avoid_structures: data.avoidStructures,
      },
      forbidden_patterns_json: data.forbiddenPatterns,
      cta_rules_json: {
        default_cta: data.defaultCta,
        allowed_cta_styles: data.allowedCtaStyles,
        max_primary_ctas: parseInt(data.maxPrimaryCtas, 10) || 1,
      },
      emoji_policy_json: {
        allowed: data.emojiAllowed,
        allowed_emojis: data.allowedEmojis,
        guidance: data.emojiGuidance,
      },
      narrative_preferences_json: {
        core_thesis: data.coreThesis,
        recurring_angles: data.recurringAngles,
        skepticism_triggers: data.skepticismTriggers,
      },
    };
  }

  async function handleCreate() {
    const err = validateCurrentStep();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/brand-profiles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof responseData.error === "string" ? responseData.error : "Failed to create profile"
        );
        return;
      }
      const id = responseData.id as string | undefined;
      if (id) onDone(id);
      else setError("Unexpected response — no profile ID returned.");
    } finally {
      setSaving(false);
    }
  }

  const isLastStep = step === STEP_COUNT - 1;
  const { title, description } = STEP_META[step];

  return (
    <div className={cn(studioInner.card, "space-y-6")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="h-4 w-4 text-[#C8571E] shrink-0" />
            <span
              className={cn(
                studioInner.sectionLabel,
                "mb-0"
              )}
            >
              Step {step + 1} of {STEP_COUNT}
            </span>
          </div>
          <h2 className="text-[15px] font-semibold text-[#1F1A14]">{title}</h2>
          <p className="text-[12px] text-[#9C8E78] mt-0.5">{description}</p>
        </div>
        {/* Progress dots */}
        <div className="flex shrink-0 gap-1 pt-1">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 w-5 rounded-full transition-colors",
                i < step
                  ? "bg-[#C8571E]"
                  : i === step
                    ? "bg-[#C8571E]/50"
                    : "bg-[#E4D9C2]"
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div>
        {step === 0 && <StepBasics data={data} update={update} />}
        {step === 1 && <StepVoice data={data} update={update} />}
        {step === 2 && <StepFormatting data={data} update={update} />}
        {step === 3 && <StepForbidden data={data} update={update} />}
        {step === 4 && <StepCta data={data} update={update} />}
        {step === 5 && <StepEmoji data={data} update={update} />}
        {step === 6 && <StepNarrative data={data} update={update} />}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[10px] border border-[#C0442A]/35 bg-[#C0442A]/08 px-4 py-3 text-sm text-[#8B2E1F]">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-[#E4D9C2] pt-4">
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <button type="button" onClick={handleBack} className={studioInner.btnSecondary}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onCancel}
            className={cn(studioInner.link, "text-xs")}
          >
            Switch to JSON editor
          </button>
        </div>

        {isLastStep ? (
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className={studioInner.btnPrimary}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {saving ? "Creating…" : "Create profile"}
          </button>
        ) : (
          <button type="button" onClick={handleNext} className={studioInner.btnPrimary}>
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
