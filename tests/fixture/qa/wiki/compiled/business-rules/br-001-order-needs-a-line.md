---
title: An order needs at least one line
category: business-rule
sources:
  - archive/orders-brd.md#creating-an-order
---

# BR-001 — An order needs at least one line

An order is created only with one or more lines. Its total is the sum of line totals, each rounded
half-up to 2 decimals before summing. A request with no lines is refused with 400 and nothing is
stored.
