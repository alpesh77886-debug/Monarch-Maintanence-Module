# Loop 41 — the refill was only half stopped

Loop 40 shipped a test-run self-cleanup and I reported it as closing the
"database refills itself" problem. Loop 41 started by checking whether that
claim actually held on the next real CI run. It did not, in two separate ways,
and one of them was worse than the original problem.

---

## F-41-1 — Playwright had no teardown at all

**Evidence, from the CI run that merged PR #41:**

| Time (UTC) | Event |
|---|---|
| 18:11:58 | `lint-and-build` finishes — Vitest teardown runs here |
| 18:13:07–18:13:46 | the `e2e` job creates 4 cases |
| after the run | all 4 still in the database |

| Case id | Symptom |
|---|---|
| `a5e3caf2` | `[AUTOTEST-E2E] conveyor motor overheating` |
| `924af305` | `[AUTOTEST-E2E] emergency two-step` |
| `d18a4351` | `[AUTOTEST-E2E] notification delivery` |
| `a6a2a662` | `[AUTOTEST-E2E] spare approval gate` |

The teardown lived in `vitest.config.ts`'s `globalSetup`. Playwright never runs
that. And even if the two had shared a config, the ordering makes it impossible:
`e2e` `needs: lint-and-build`, so Vitest's teardown fires *before* the e2e cases
exist. **Four leaked cases per CI run, forever.**

**Fix:** `e2e/global-teardown.ts`, wired through `playwright.config.ts`'s
`globalSetup`. That Playwright calls a returned function as the global teardown
was verified in the installed runner (`playwright/lib/runner`:
`if (typeof globalSetupResult === "function") await globalSetupResult()`), not
assumed. The teardown body was extracted to `tests/cleanup-run.ts` and is now
shared, so the two suites cannot drift into two different ideas of "safe".

---

## F-41-2 — a run could delete another run's in-flight cases

This is the serious one, and it was introduced by Loop 40's own fix.

`cleanup_test_cases_since(p_since)` selected on nothing but:

```sql
created_at >= p_since AND symptom like '[AUTOTEST%'
```

There was **no notion of which run owned a case.** Meanwhile `ci.yml` scopes
concurrency to `ci-${{ github.ref }}` — so a pull-request run and a main-branch
run are in **different groups and may overlap.** When they do, the run that
finishes first deletes the other run's *in-flight* rows, and a suite that did
nothing wrong fails on records that vanished underneath it.

Not a hypothetical: merging PR #41 started a main-branch run creating cases at
18:17, minutes after the PR run's suite finished at 18:13. Those two were
sequential by timing luck, not by any mechanism.

**Fix:** every synthetic case now carries a `[run=<tag>]` marker
(`tests/run-tag.ts`), and cleanup is scoped to it. CI sets a distinct
`MAINTENANCE_TEST_RUN_ID` per job — the `-unit` / `-e2e` suffix matters, or the
two jobs of one workflow run would clean each other's rows. Locally the tag is
null and behaviour is unchanged (window-only), which is correct: there is no
second concurrent run to race.

---

## The fix was wrong on its first attempt, and its own red-team test caught it

Migration `0040` matched the tag with `LIKE '%[run=' || p_run_tag || ']%'` and
validated the tag against `^[A-Za-z0-9._-]{4,64}$`.

**That charset allows the underscore, and in `LIKE` the underscore is a
single-character wildcard.**

Live proof, run against the database:

| Step | Result |
|---|---|
| create 2 cases tagged `loop41-RUNAAA`, 1 tagged `loop41-RUNBBB` | 3 cases |
| cleanup scoped to `loop41-RUNAAA` | `deleted_cases: 2` |
| RUNAAA remaining / RUNBBB remaining | **0 / 1** — isolation working |
| attack: cleanup scoped to `loop41-RUN___` | **not refused** |
| RUNBBB remaining after the attack | **0 — the other run's case was deleted** |

So the parameter added to prevent cross-run deletion could itself perform a
cross-run deletion. `'%'` was caught by the charset check; `'_'` was not,
because `_` was on the allow-list.

**Fix (`0041`), removing the bug class rather than the character:**

1. Matching moves from `LIKE` to `strpos()` — a literal substring search where
   no metacharacter has any meaning at all.
2. `_` is dropped from the allowed charset anyway. (`.` stays; it is not a
   `LIKE` metacharacter.)

**Re-verified after the fix:**

| Attack | Result |
|---|---|
| tag `%` | `INVALID_RUN_TAG` |
| tag `loop41-RETEST___` | `INVALID_RUN_TAG` |
| no staff identity | `FORBIDDEN` (authority checked before the tag) |
| correct tag `loop41-RETESTAAA` | `deleted_cases: 1` |
| other run's case after that | **survived** |

Every fixture created for this exercise was removed afterwards; nothing was
left in the database.

---

## Least privilege

`0039` left `EXECUTE` on `cleanup_test_cases_since` granted to `PUBLIC`, and
therefore to `anon`. It was **never exploitable** — the first statement in the
body is an unconditional `is_staff()` refusal and an anonymous caller has no
`auth.uid()`, verified live (`FORBIDDEN`). But an unauthenticated role should
not hold `EXECUTE` on a delete-capable function.

| | before | after |
|---|---|---|
| grantees | `PUBLIC, postgres, anon, authenticated, service_role` | `postgres, authenticated, service_role` |

`cleanup_synthetic_cases` — the function that actually deletes — remains
revoked from every client role (`postgres, service_role` only).

---

## The arity trap, third encounter, avoided

`create or replace` on a function with a *different* number of parameters
creates a **new overload** instead of replacing. This repo has been bitten twice
(`enter_waiting` in 0037, and earlier). `0040` adds a parameter, so the
single-argument version was dropped explicitly first and the catalogue
re-checked afterwards:

```
cleanup_test_cases_since | p_since timestamp with time zone, p_run_tag text
```

**One row. One overload.** `0041` keeps the same arity, so `create or replace`
genuinely replaces there.

---

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files, anchored regex) | clean |
| every case-creating call site uses a tagged symptom helper | verified — no untagged leak path |
| `cleanup_test_cases_since` overloads | 1 |

7 new tests in `tests/run-tag-scoping.test.ts`.

**Honest limit on those tests:** the isolation property in its dangerous
direction (run A's cleanup leaves run B's rows alone) is proven live above, not
in the suite. A test asserting it would have to leave a second run's rows behind
to show they survived — leaking exactly the rows this feature exists to stop
leaking. What the suite pins is the safe direction (a foreign tag deletes zero)
plus every refusal path.

---

## What this loop says about Loop 40

Loop 40's cleanup was reported as done and it was not. It handled one of two
suites, and the mechanism it introduced could destroy a concurrent run's data.
Both were found by checking the next real CI run against the claim rather than
re-reading the code. **A green CI run was not evidence the cleanup worked — the
leaked rows were sitting in the database the whole time it was green.**
