# TC-MOB-ORDERS-002 — [Orders · Android, iOS] Orders screen — Standard user restarts the app → the seeded draft is listed as Draft
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** mobile  **Module:** orders  **Priority:** P1
**Platform:** android, ios
**AC:** AC-001
**Tags:** @mobile @orders @P1 @platform:android @platform:ios @smoke @req:orders/REQ-001 @agentic:gen

## Grounding
- wiki: wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
A draft order created before the app restarts is still listed, with status Draft, after it restarts.

## Technique
- state-transition → positive

## Isolation
- creates: one draft order (API)
- cleans: the order, deleted through the API in onFlowComplete
- actor: pool `standard`
- lock: device (one session per device)

## Platforms
- android, ios

## Device profile
- Devices: gate tier (`pixel-8-emu-api34`, `iphone-15-sim-17`)
- Conditions: cold start with cleared app state; permissions allowed

## Preconditions
- App installed at the build under test; [DATA:order-draft]

## Steps
1. Action: launch the app with cleared state and sign in as `standard`
   Expected: home screen visible
2. Action: open Orders
   Expected: the seeded draft is listed
3. Action: open the seeded draft
   Expected: status shows "Draft"

## Expected Result
- The draft survives a cold start on both platforms; no crash

## Data
- [DATA:order-draft] created through POST /orders with a unique name; ids from elements/orders.js
