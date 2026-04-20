// Page: Brand Profiles
function PageBrand() {
  const t = window.T;
  const [profile, setProfile] = React.useState("Identity Jedi Newsletter");
  const [saved, setSaved] = React.useState(false);
  const [isDefault, setIsDefault] = React.useState(false);

  const [name, setName] = React.useState("Identity Jedi Newsletter");
  const [version, setVersion] = React.useState("1.0");
  const [voiceId, setVoiceId] = React.useState("");
  const [modelId, setModelId] = React.useState("eleven_turbo_v2_5");
  const [voiceRules, setVoiceRules] = React.useState(`{
  "tone": [
    "direct",
    "confident",
    "human",
    "practical"
  ],
  "avoid": ["jargon", "hedging", "passive voice"],
  "reading_level": "practitioner",
  "sentence_length": "varied — short punchy leads, longer analysis"
}`);
  const [formattingRules, setFormattingRules] = React.useState(`{
  "promo_format": {
    "cta_style": "short and direct",
    "max_lines": 5,
    "max_sentences_per_line": 1
  },
  "headers": "bold, sentence case",
  "bullets": "em-dash preferred over hyphens"
}`);
  const [forbidden, setForbidden] = React.useState(`[
  "game-changer",
  "paradigm shift",
  "leverage (as verb)",
  "unlock",
  "delve",
  "in conclusion"
]`);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const profiles = ["Identity Jedi Newsletter", "B2B Creator Weekly", "Enterprise Brief"];

  return (
    <div>
      <PageHeader title="Brand profiles" sub="Voice rules, formatting, ElevenLabs defaults, and workspace default for Issues and content products" />

      {/* Profile selector card */}
      <Card style={{ marginBottom: 24 }}>
        <SectionLabel>Profile</SectionLabel>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Select
            value={profile}
            onChange={p => { setProfile(p); setName(p); }}
            options={[...profiles, "+ New profile"].map(p => ({ value: p, label: p }))}
            style={{ flex: 1 }}
          />
          <Btn variant="secondary">+ New</Btn>
          <Btn onClick={save}>{saved ? "✓ Saved" : "Save"}</Btn>
          <Btn
            variant={isDefault ? "positive" : "secondary"}
            onClick={() => setIsDefault(d => !d)}
          >
            {isDefault ? "✓ Workspace default" : "☆ Set as workspace default"}
          </Btn>
        </div>
      </Card>

      {/* Fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionLabel>Name</SectionLabel>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </Card>
        <Card>
          <SectionLabel>Profile version</SectionLabel>
          <Input value={version} onChange={e => setVersion(e.target.value)} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionLabel>ElevenLabs voice ID</SectionLabel>
          <Input
            value={voiceId}
            onChange={e => setVoiceId(e.target.value)}
            placeholder="Optional; used for podcast TTS"
          />
        </Card>
        <Card>
          <SectionLabel>ElevenLabs model ID</SectionLabel>
          <Input
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            placeholder="e.g. eleven_turbo_v2_5"
          />
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <SectionLabel>Voice rules</SectionLabel>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 1, color: t.sub, textTransform: "uppercase" }}>JSON object</span>
        </div>
        <Textarea value={voiceRules} onChange={e => setVoiceRules(e.target.value)} rows={8} mono />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <SectionLabel>Formatting rules</SectionLabel>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 1, color: t.sub, textTransform: "uppercase" }}>JSON object</span>
        </div>
        <Textarea value={formattingRules} onChange={e => setFormattingRules(e.target.value)} rows={7} mono />
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <SectionLabel>Forbidden patterns</SectionLabel>
          <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 1, color: t.sub, textTransform: "uppercase" }}>JSON array</span>
        </div>
        <Textarea value={forbidden} onChange={e => setForbidden(e.target.value)} rows={6} mono />
      </Card>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={save}>{saved ? "✓ Saved" : "Save profile"}</Btn>
        <Btn variant="secondary">Duplicate</Btn>
        <Btn variant="ghost" style={{ color: "#B83232", marginLeft: "auto" }}>Delete profile</Btn>
      </div>
    </div>
  );
}
Object.assign(window, { PageBrand });
