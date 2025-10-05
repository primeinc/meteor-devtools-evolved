# 🤖 Coding with GitHub Copilot Agents - Team Workflow Guide

**Author:** Claude Code + Will
**Date:** 2025-10-05
**Status:** Battle-tested ✅

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [The Problem We Solved](#the-problem-we-solved)
3. [Core Workflow](#core-workflow)
4. [Critical Git Patterns](#critical-git-patterns)
5. [PR Review Process](#pr-review-process)
6. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
7. [Best Practices](#best-practices)
8. [Quick Reference](#quick-reference)

---

## Overview

This guide documents our proven workflow for collaborating with GitHub Copilot agents on complex features. We've refined this through real-world implementation of the Minimongo Query View feature (PR #29).

**Key Insight:** Copilot agents work on **branches**, not PRs directly. Understanding this distinction is critical to effective collaboration.

---

## The Problem We Solved

### Initial Confusion
- ❌ Created local review branches disconnected from the actual PR
- ❌ Lost track of which branch Copilot was working on
- ❌ Accidentally mixed code from different contexts
- ❌ Pushed commits to wrong branches

### Solution
- ✅ Always work directly on Copilot's branch
- ✅ Use consistent naming conventions
- ✅ Rebase from `dev/main` to share bug fixes
- ✅ Clear separation between review and development

---

## Core Workflow

### Phase 1: Issue Creation

**1. Create GitHub Issues for Copilot**

```bash
# Example: Create workload issues with proper labels
gh issue create \
  --title "[Workload A] Minimongo Instrumentation & DDP Correlation" \
  --body-file .github/workload-a-issue.md \
  --label "workload-a" \
  --label "feature"
```

**Key Points:**
- Use clear, actionable titles prefixed with context (e.g., `[Workload A]`)
- Include detailed implementation guides in the issue body
- Reference documentation with full paths or URLs
- Add blocking labels for dependencies (e.g., `blocked-by-a`)

**Issue Template Structure:**
```markdown
# [Workload X] Feature Name

## 📋 Overview
[Brief description]

## 📚 Documentation
- 📖 [implementation/workload-x.md](link)
- ⚠️ [architecture-gotchas.md](link)
- ✅ [testing-strategy.md](link)

## 🎯 Deliverables
- [ ] Task 1 (Xh)
- [ ] Task 2 (Xh)

## 🔑 Key Files
**Created:** [list]
**Modified:** [list]

## ✅ Definition of Done
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Feature complete
```

### Phase 2: Copilot Creates PR

**2. Wait for Copilot to Create the PR**

Copilot will:
1. Create a branch (e.g., `copilot/fix-<uuid>`)
2. Implement the feature
3. Open a PR from that branch

**DO NOT:**
- ❌ Create a local branch manually
- ❌ Use `git fetch origin pull/XX/head:local-branch`
- ❌ Review in a disconnected branch

### Phase 3: Review & Collaborate

**3. Checkout the Actual Copilot Branch**

```bash
# Find the Copilot branch name from the PR
gh pr view <PR_NUMBER>

# Checkout the actual branch Copilot is using
git checkout copilot/fix-<uuid>

# Or fetch it first if not local
git fetch origin copilot/fix-<uuid>
git checkout copilot/fix-<uuid>
```

**4. Run Tests & Build**

```bash
# Always test before reviewing
yarn test
yarn build:chrome
yarn typecheck
```

**5. Review Code & Create Feedback**

```bash
# Create comprehensive review
vim .github/PR_<NUMBER>_REVIEW.md

# Stage, commit, and push to the Copilot branch
git add .github/PR_<NUMBER>_REVIEW.md
git commit -m "docs: add comprehensive PR review"
git push
```

**6. Comment on PR with @copilot**

```bash
gh pr comment <PR_NUMBER> --body "@copilot

Please review and address the feedback in \`.github/PR_<NUMBER>_REVIEW.md\`

## Summary
[Brief overview of issues and what's good]

## What You Need to Fix
[Numbered list of tasks with code examples]

See the full review: \`.github/PR_<NUMBER>_REVIEW.md\`
"
```

### Phase 4: Share Bug Fixes

**7. Rebase Copilot Branch from dev/main**

When you fix bugs on `dev/main` that the Copilot branch needs:

```bash
# On the Copilot branch
git checkout copilot/fix-<uuid>

# Rebase from dev/main to get bug fixes
git rebase dev/main

# Force push (safe because it's Copilot's branch)
git push --force-with-lease
```

**Why this works:**
- Copilot's branch automatically gets your bug fixes
- PR updates automatically
- Clean linear history
- No merge conflicts

---

## Critical Git Patterns

### ✅ DO: Work on Copilot's Branch Directly

```bash
# Good - actual PR branch
git checkout copilot/fix-abc123

# Make changes, commit, push
git push
```

### ❌ DON'T: Create Local Review Branches

```bash
# Bad - creates orphaned branch
git fetch origin pull/29/head:pr-29
git checkout pr-29

# This branch is NOT connected to the PR!
# Pushing here does NOTHING to the PR
```

### ✅ DO: Rebase to Share Fixes

```bash
# dev/main has bug fixes
git checkout dev/main
git commit -m "fix: critical bug"
git push

# Share with Copilot branch
git checkout copilot/fix-abc123
git rebase dev/main
git push --force-with-lease
```

### ❌ DON'T: Cherry-pick or Merge

```bash
# Bad - creates messy history
git cherry-pick <commit>
git merge dev/main
```

---

## PR Review Process

### Review Checklist

**Before Reviewing:**
- [ ] Checkout the actual Copilot branch
- [ ] Run `yarn test` - all tests must pass
- [ ] Run `yarn build:chrome` - build must succeed
- [ ] Run `yarn typecheck` - no TypeScript errors
- [ ] Check git history is clean

**During Review:**
- [ ] Verify all deliverables from the issue are complete
- [ ] Check for performance issues (e.g., unnecessary operations in loops)
- [ ] Ensure UI components are actually integrated (not orphaned)
- [ ] Look for missing settings/toggles
- [ ] Review test coverage

**Review Document Structure:**

```markdown
# PR #XX Review: [Feature Name]

**Status:** ✅ Tests Pass | ✅ Build Success | ⚠️ Needs Work

## 🎯 Executive Summary
[What works, what's missing, completion %]

## 📋 Test Results
[Test output, build status]

## 🔍 Code Quality Review
### ✅ Strengths
[What's good]

### ⚠️ Issues Found
[Numbered list with code examples]

## 📝 Agent Instructions to Complete PR
### Task 1: [Name] (PRIORITY)
**File:** `path/to/file.ts`
**Problem:** [Description]
**Fix:** [Code example]

## ✅ Approval Status
**Current:** ❌ Changes Requested
**Blockers:** [List]
```

---

## Common Pitfalls & Solutions

### Pitfall 1: "I don't know which branch is the PR"

**Solution:** Always check PR details first
```bash
gh pr view <NUMBER>
# Shows: "from copilot/fix-abc123"
```

### Pitfall 2: "My review file isn't showing up in the PR"

**Cause:** You committed to a local branch, not Copilot's branch
**Solution:**
```bash
# Check current branch
git branch --show-current

# Should be: copilot/fix-<uuid>
# NOT: pr-29 or any local branch
```

### Pitfall 3: "Copilot didn't see my changes"

**Cause:** Forgot to push to Copilot's branch
**Solution:**
```bash
git checkout copilot/fix-<uuid>
git add .
git commit -m "fix: issue"
git push  # Must push!
```

### Pitfall 4: "I committed bug fixes to wrong branch"

**Cause:** Working on feature branch instead of dev/main
**Solution:** Use rebase to share fixes
```bash
# Fix is on dev/main
git checkout copilot/fix-<uuid>
git rebase dev/main
git push --force-with-lease
```

### Pitfall 5: "Tests pass but feature doesn't work"

**Common Issues:**
- UI components created but not imported/rendered
- Settings added to store but no UI toggle
- Performance optimizations not applied (e.g., checking feature flags)

**Solution:** Check for orphaned code
```bash
# Find unused components
rg "export.*QueryLogList" --files-with-matches
rg "QueryLogList" --files-with-matches
# If counts don't match, it's orphaned!
```

---

## Best Practices

### 1. Clear Communication with Copilot

**Good Issue Description:**
```markdown
## Task
Implement X feature with Y behavior

## Documentation
- [Primary guide](link)
- [Architecture gotchas](link)
- [Testing strategy](link)

## Key Files to Create
- path/to/file.ts
- path/to/test.ts

## Key Files to Modify
- path/to/existing.ts (add X method)
```

**Good PR Comment:**
```markdown
@copilot

Fix these 3 blockers:

1. Performance issue in file.ts:123
[code example of fix]

2. Missing UI integration in page.tsx
[code example of fix]

3. Settings toggle missing
[code example of fix]

See full review: .github/PR_XX_REVIEW.md
```

### 2. Atomic Commits

```bash
# Good - one concern per commit
git commit -m "fix: download filename race condition"
git commit -m "fix: remove EJSON log spam"

# Bad - mixed concerns
git commit -m "fix: various issues"
```

### 3. Branch Hygiene

```bash
# Delete orphaned local branches
git branch -D pr-29

# Keep only necessary branches
git branch -a
# Should see:
# * copilot/fix-abc123
#   dev/main
#   remotes/origin/copilot/fix-abc123
```

### 4. Documentation Before Action

Always commit review documents BEFORE leaving PR comments:
```bash
# 1. Write review
git add .github/PR_29_REVIEW.md
git commit -m "docs: add PR review"
git push

# 2. Then comment
gh pr comment 29 --body "@copilot See .github/PR_29_REVIEW.md"
```

---

## Quick Reference

### Essential Commands

```bash
# View PR details (find branch name)
gh pr view <NUMBER>

# Checkout Copilot branch
git checkout copilot/fix-<uuid>

# Test & Build
yarn test && yarn build:chrome && yarn typecheck

# Commit review to Copilot branch
git add .github/PR_XX_REVIEW.md
git commit -m "docs: add review"
git push

# Comment on PR
gh pr comment <NUMBER> --body "@copilot [instructions]"

# Share bug fixes from dev/main
git checkout copilot/fix-<uuid>
git rebase dev/main
git push --force-with-lease
```

### Branch Naming Convention

- `dev/main` - Main development branch
- `copilot/fix-<uuid>` - Copilot's PR branch (work here!)
- `feature/name` - Human feature branches
- ❌ `pr-29` - DON'T create these!

### File Organization

```
.github/
  ├── PR_29_REVIEW.md          # Review for specific PR
  ├── test-generation-issue.md # Issue template/prompt
  └── COPILOT_AGENT_WORKFLOW.md # This guide

docs/features/feature-name/
  ├── README.md                # Feature overview
  ├── CHANGELOG.md             # Feature evolution
  ├── implementation/
  │   ├── workload-a.md        # Implementation guides
  │   ├── workload-b.md
  │   └── testing-strategy.md
  └── IMPLEMENTATION_PLAN.md   # Overall plan
```

---

## Lessons Learned

### What Worked Well

1. **Detailed Issue Templates** - Copilot performs better with comprehensive context
2. **Code Examples in Reviews** - Show the exact fix, not just descriptions
3. **Rebase for Sharing** - Clean way to share bug fixes across branches
4. **Pushing Review Docs First** - Ensures Copilot can reference them

### What Didn't Work

1. **Local Review Branches** - Created confusion, not connected to PR
2. **Vague PR Comments** - Copilot needs specific, actionable instructions
3. **Committing Without Pushing** - Changes invisible to Copilot
4. **Cherry-picking** - Created messy history, rebase is cleaner

### Key Realizations

- **Copilot works on branches, not PRs** - The PR is just a view of the branch
- **Git branch names matter** - Use the exact branch Copilot created
- **Reviews must be on the branch** - Not in comments, not in local files
- **@copilot tag is critical** - Without it, Copilot won't respond

---

## Success Metrics

**Before this workflow:**
- ❌ 3+ hours debugging which branch is correct
- ❌ Multiple orphaned branches
- ❌ Lost review feedback
- ❌ Confusion about where Copilot's work is

**After this workflow:**
- ✅ 5 minutes to get oriented on any PR
- ✅ Single source of truth (Copilot's branch)
- ✅ Reviews visible in PR automatically
- ✅ Clean collaboration with rebase

---

## Contributing to This Guide

Found a better pattern? Add it here:

```bash
# 1. Checkout the branch this guide is on
git checkout dev/main  # or feature branch

# 2. Edit this file
vim .github/COPILOT_AGENT_WORKFLOW.md

# 3. Commit with clear description
git add .github/COPILOT_AGENT_WORKFLOW.md
git commit -m "docs: add pattern for [use case]"
git push
```

---

## Related Resources

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [PR #29 - Real Example](https://github.com/primeinc/meteor-devtools-evolved/pull/29)
- [Workload Implementation Guides](../docs/features/minimongo-query-view/implementation/)

---

**Last Updated:** 2025-10-05
**Validated On:** PR #29 (Minimongo Query View)
**Team:** Claude Code + Will
