# Code Quality Documentation

**Purpose:** Documents code quality audits, refactoring opportunities, and technical debt.

**Status:** Version controlled - these docs should be committed to git

---

## Contents

### REMAINING_ISSUES.md
- **Date:** 2025-10-04
- **Scope:** Comprehensive scan after PR #15 security hardening
- **Findings:** 5 remaining magic numbers (non-critical UI timing)
- **Status:** All critical issues resolved, remaining items are optional quality improvements

**Use Cases:**
- Reference for future refactoring
- Onboarding documentation (understand deliberate tech debt)
- Prioritization of quality improvements

---

## Guidelines

**What belongs here:**
- ✅ Code quality audit results
- ✅ Technical debt documentation
- ✅ Refactoring plans
- ✅ Performance analysis reports
- ✅ Security audit findings

**What does NOT belong here:**
- ❌ Feature specifications (use `docs/features/`)
- ❌ API documentation (use `docs/api/`)
- ❌ User guides (use `docs/guides/`)
- ❌ Temporary analysis files (use `.claude/`)

---

**Maintained By:** Development Team
**Review Frequency:** Quarterly or after major refactors
