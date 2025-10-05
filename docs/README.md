# Documentation Index

**Repository:** [meteor-devtools-evolved](https://github.com/primeinc/meteor-devtools-evolved)

---

## 📚 Quick Navigation

### For Feature Implementation
- **[Minimongo Query View](./features/minimongo-query-view/)** - Unimplemented deep inspection feature (design complete)
  - [LLM Implementation Guide](./features/minimongo-query-view/LLM_IMPLEMENTATION_GUIDE.md) ⭐ Start here for implementation
  - [Architecture Decisions](./features/minimongo-query-view/ARCHITECTURE_DECISIONS.md) - Critical design choices
  - [Feature Spec](./features/minimongo-query-view/FEATURE_SPEC.md) - Original requirements

### For Code Quality
- **[Code Quality Audits](./code-quality/)** - Tech debt tracking
  - [Remaining Issues](./code-quality/REMAINING_ISSUES.md) - Post-PR#15 comprehensive audit

### For Understanding Organization
- **[Organization Summary](./ORGANIZATION_SUMMARY.md)** - Why things are organized this way (deep reasoning defense)

---

## 🤖 LLM Prompt Examples

### Implementing Minimongo Query View

**Minimal prompt (84 tokens):**
```
Implement the Minimongo Query View feature.

Read in this exact order:
1. docs/features/minimongo-query-view/LLM_IMPLEMENTATION_GUIDE.md
2. All prerequisite files listed in Phase 0
3. Make architecture decisions from ARCHITECTURE_DECISIONS.md

Follow the implementation checklist. Ask before starting if anything is unclear.
```

**Detailed prompt (157 tokens):**
```
Task: Implement Minimongo Query View feature (8-12 hours estimated)

Required reading (in order):
1. docs/features/minimongo-query-view/LLM_IMPLEMENTATION_GUIDE.md (start here)
2. src/Injectors/MinimongoInjector.ts (current implementation)
3. src/Stores/Panel/MinimongoStore/index.ts (MobX store)
4. Other prerequisite files listed in guide's Phase 0

Critical decision: Review ADR-001 in ARCHITECTURE_DECISIONS.md (collections data structure)

Output:
- TypeScript/React code matching existing patterns
- Schema inference tests
- Updated documentation if patterns change

Follow implementation checklist in guide. Test each phase before moving to next.
```

### Code Review Request

**Minimal prompt (62 tokens):**
```
Review this code for:
- Matches patterns in docs/features/minimongo-query-view/LLM_IMPLEMENTATION_GUIDE.md Phase 1
- Follows ADR decisions in ARCHITECTURE_DECISIONS.md
- No pitfalls from Phase 3
- Test coverage adequate
```

### Understanding Codebase

**Minimal prompt (48 tokens):**
```
Explain how Minimongo message passing works.

Read:
1. src/Browser/Inject.ts (injector side)
2. src/Utils/BridgeAdapter.ts (panel side)

Describe the flow with example.
```

---

## 📋 Directory Structure

```
docs/
├── README.md                          ← You are here
├── ORGANIZATION_SUMMARY.md            ← Why organized this way (reasoning defense)
│
├── features/                          ← Feature design documentation
│   └── minimongo-query-view/
│       ├── README.md                  (Overview, status, quick start)
│       ├── LLM_IMPLEMENTATION_GUIDE.md (Step-by-step for LLMs - START HERE)
│       ├── ARCHITECTURE_DECISIONS.md  (7 ADRs with tradeoff analysis)
│       ├── FEATURE_SPEC.md            (Original design document)
│       └── reference-components/      (Example UI components)
│
└── code-quality/                      ← Code quality audits
    ├── README.md
    └── REMAINING_ISSUES.md            (Post-PR#15 audit results)
```

---

## 🎯 Documentation Strategy

### For Version Control (git)
- ✅ Feature specifications → `features/`
- ✅ Architecture decisions → `features/*/ARCHITECTURE_DECISIONS.md`
- ✅ Code quality audits → `code-quality/`
- ✅ Implementation guides → `features/*/LLM_IMPLEMENTATION_GUIDE.md`

### Not in Version Control (`.claude/`)
- ❌ Codebase snapshots → `.claude/snapshots/` (regenerable)
- ❌ PR archives → `.claude/archive/` (historical)
- ❌ Local settings → `.claude/settings.local.json` (user-specific)

**Rationale:** Different lifecycles, different storage. See [ORGANIZATION_SUMMARY.md](./ORGANIZATION_SUMMARY.md) for deep reasoning.

---

## 💡 Quick Reference: File Purposes

| File | Purpose | Audience | Read When |
|------|---------|----------|-----------|
| `LLM_IMPLEMENTATION_GUIDE.md` | Step-by-step implementation with file refs | LLMs | Implementing feature |
| `ARCHITECTURE_DECISIONS.md` | Design choices with alternatives | LLMs, Architects | Before coding |
| `FEATURE_SPEC.md` | Requirements and architecture overview | Humans | Understanding "what" and "why" |
| `reference-components/` | Example UI code | Frontend devs | Building UI |
| `README.md` (feature-level) | Quick orientation | Everyone | First visit to feature |
| `REMAINING_ISSUES.md` | Known tech debt | Maintainers | Prioritizing refactors |

---

## 🔗 Useful GitHub Links

**Repository Root:**
- [Main Branch](https://github.com/primeinc/meteor-devtools-evolved/tree/main)
- [Source Code](https://github.com/primeinc/meteor-devtools-evolved/tree/main/src)
- [Pull Requests](https://github.com/primeinc/meteor-devtools-evolved/pulls)

**Key Source Files (referenced in implementation guide):**
- [MinimongoInjector.ts](https://github.com/primeinc/meteor-devtools-evolved/blob/main/src/Injectors/MinimongoInjector.ts)
- [MinimongoStore/index.ts](https://github.com/primeinc/meteor-devtools-evolved/blob/main/src/Stores/Panel/MinimongoStore/index.ts)
- [CollectionStore.ts](https://github.com/primeinc/meteor-devtools-evolved/blob/main/src/Stores/Panel/MinimongoStore/CollectionStore.ts)
- [BridgeAdapter.ts](https://github.com/primeinc/meteor-devtools-evolved/blob/main/src/Utils/BridgeAdapter.ts)

---

## 🧪 Prompt Engineering Tips

### For LLMs Implementing Features

**DO:**
- ✅ Reference exact file paths from implementation guide
- ✅ Read prerequisite files in specified order
- ✅ Copy existing patterns (don't reinvent)
- ✅ Make architecture decisions BEFORE coding

**DON'T:**
- ❌ Skip prerequisite reading ("I'll figure it out")
- ❌ Implement all at once (do backend → UI → testing)
- ❌ Ignore ADRs (leads to wrong architecture choices)

### Token-Efficient Prompting

**Instead of:**
```
I need you to implement a feature that allows developers to see
what queries are being run against Minimongo collections in their
Meteor application, including stack traces and schema inference...
[200+ tokens of description]
```

**Use:**
```
Implement Minimongo Query View feature.
Read: docs/features/minimongo-query-view/LLM_IMPLEMENTATION_GUIDE.md
Follow the implementation checklist.
[30 tokens - file does the explaining]
```

**Principle:** Let documentation do the talking. Prompts should *point*, not *explain*.

---

## 📈 Documentation Metrics

### Current Status

| Metric | Value |
|--------|-------|
| Features documented | 1 (Minimongo Query View) |
| Implementation guides | 1 (34 KB) |
| Architecture decisions | 7 (across 1 feature) |
| Code quality audits | 1 (post-PR#15) |
| Total docs size | ~60 KB |
| Unimplemented features | 1 (0% complete) |

### Quality Indicators

- ✅ Every directory has README
- ✅ All docs have "Purpose" and "Audience"
- ✅ Implementation guides include prerequisite files
- ✅ ADRs document alternatives, not just choices
- ✅ Prompt examples provided

---

## 🚀 Getting Started as an Implementer

### New to this codebase?

1. **Start here:** [ORGANIZATION_SUMMARY.md](./ORGANIZATION_SUMMARY.md)
2. **Want to implement a feature?** Go to `features/<feature-name>/README.md`
3. **LLM assistant?** Read `LLM_IMPLEMENTATION_GUIDE.md` for that feature
4. **Human developer?** Read `FEATURE_SPEC.md` first, then implementation guide

### Prompt Template for LLMs

```
I'm implementing [FEATURE_NAME].

1. Read docs/features/[FEATURE_NAME]/LLM_IMPLEMENTATION_GUIDE.md
2. Read prerequisite files listed in Phase 0 (in order)
3. Review ADRs in ARCHITECTURE_DECISIONS.md
4. Confirm I understand before coding

Start with Phase 0.
```

---

## 📞 Contributing to Docs

### Adding New Feature Documentation

1. Create directory: `docs/features/<feature-name>/`
2. Required files:
   - `README.md` (overview, status, quick start)
   - `FEATURE_SPEC.md` (requirements, architecture)
   - `LLM_IMPLEMENTATION_GUIDE.md` (if complex implementation)
3. Optional files:
   - `ARCHITECTURE_DECISIONS.md` (for non-trivial design choices)
   - `reference-components/` (example code)
4. Update this index

### Template Checklist

- [ ] Every directory has README.md
- [ ] README explains: Purpose, Contents, Guidelines
- [ ] File paths use relative links (`./path/to/file.md`)
- [ ] Audience is clear (LLMs vs Humans)
- [ ] Prompt examples are token-efficient
- [ ] GitHub links use `/blob/main/` for stability

---

## 🏆 Best Practices

### Documentation Philosophy

1. **Self-Documenting Structure** - README in every directory
2. **Audience Targeting** - Different formats for LLMs vs humans
3. **Prerequisite Ordering** - Files to read, in sequence
4. **Pattern Emphasis** - Show existing code to copy
5. **Token Efficiency** - Let files explain, prompts point

### LLM Implementation Guides Should Include

- [ ] Phase 0: Prerequisite files (in order, with WHY)
- [ ] Phase 1: Existing patterns to copy
- [ ] Phase 2: Step-by-step checklist
- [ ] Phase 3: Common pitfalls
- [ ] Phase 4: Testing strategy

### Architecture Decision Records Should Include

- [ ] Context (what's the problem?)
- [ ] Options (2-3 alternatives)
- [ ] Pros/Cons for each option
- [ ] Impact estimate (hours of work)
- [ ] Recommendation with rationale

---

**Last Updated:** 2025-10-04
**Maintained By:** Development Team
**Status:** Living Document

For questions about organization strategy, see [ORGANIZATION_SUMMARY.md](./ORGANIZATION_SUMMARY.md)
