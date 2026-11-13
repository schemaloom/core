# Eval run 2026-11-13T01-16_baseline_test

- Split: **test** (6 cases x 3 repeats = 18 trials)
- Target: library, model gemini-3-flash-preview, temperature 1, retries 0
- Commit: `f1248b8` (dirty), dataset `0f6d20aed926`, prompt v1


## Summary

| Metric | Value |
|---|---|
| Pass rate | 39% (7/18 trials) |
| Consistent cases | 1/6 passed every repeat |
| Mean extracted | 1.00 |
| Mean structure | 1.00 |
| Mean grounding | 0.89 |
| Mean conceptRecall | 0.78 |
| Mean edgeRecall | 0.71 |
| Mean sizeInRange | 1.00 |
| Reversed edges | 0 |
| Latency p50 / p95 | 10.1s / 20.4s |
| Tokens in / out | 9495 / 14172 |

## Failures

| Gate scorer | Failed trials |
|---|---|
| grounding | 5 |
| conceptRecall | 9 |

| Issue type | Trials |
|---|---|
| ungrounded_node | 5 |

## By tag

| Tag | Pass rate |
|---|---|
| ambiguous-relations | 0% (3 trials) |
| biology | 0% (3 trials) |
| computing | 0% (3 trials) |
| cross-references | 100% (3 trials) |
| economics | 0% (3 trials) |
| general | 33% (6 trials) |
| hard | 100% (3 trials) |
| long | 100% (3 trials) |
| math | 67% (3 trials) |
| medium | 0% (9 trials) |
| ml | 67% (3 trials) |
| networking | 100% (3 trials) |
| short | 67% (6 trials) |
| technical | 42% (12 trials) |

## By case

| Case | Pass rate |
|---|---|
| cellular-respiration | 0% |
| compiler | 0% |
| inflation | 0% |
| internet-protocol-suite | 100% |
| machine-learning | 67% |
| probability-theory | 67% |
