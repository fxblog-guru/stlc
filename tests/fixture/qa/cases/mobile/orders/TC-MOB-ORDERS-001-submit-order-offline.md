# TC-MOB-ORDERS-001 — [Orders · Android, iOS] Orders screen — Standard user submits a draft offline, then reconnects → exactly one Open order
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** mobile  **Module:** orders  **Priority:** P0
**Platform:** android, ios
**AC:** AC-001
**Tags:** @mobile @orders @P0 @platform:android @platform:ios @regression @req:REQ-001 @agentic:gen

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
A draft submitted while offline is kept and becomes exactly one order once the network returns.

## Technique
- state-transition → positive
- error-guessing → negative

## Isolation
- creates: one order
- cleans: app data reset before the case; order deleted through the API after
- actor: pool `standard`
- lock: device (one session per device)

## Platforms
- android, ios

## Device profile
- Devices: gate tier (`pixel-8-emu-api34`, `iphone-15-sim-17`)
- Conditions: network offline → online

## Preconditions
- App installed at the build under test; user logged in as `standard`

## Steps
1. Action: open Orders from Home
   Expected: list visible
2. Action: submit the draft while offline
   Expected: offline banner; draft kept
3. Action: restore network, retry
   Expected: exactly one order, status Open
   Expected (android): system back returns to Home

## Expected Result
- Journey completes on both platforms; no duplicate; no crash

## Data
- ids: orders-tab, orders-list, order-offline-banner (mobile:src/screens/orders/OrdersScreen.ts#OrdersScreen @ a1b2c3d)
