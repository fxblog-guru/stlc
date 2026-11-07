# WCAG 2.2 AA checklist → check kind (reference for designing-accessibility-cases)

Conformance target default: **WCAG 2.2 Level AA** (A + AA criteria). `automated` = provable by
axe-core (rule ids listed) and/or a Playwright assertion; `manual` = needs a human with a screen
reader / keyboard / eyes. axe's WCAG tags used by `shared/a11y/axe.ts`: `wcag2a wcag2aa wcag21a
wcag21aa wcag22aa`. Rule ids are axe-core 4.10 names.

## Perceivable

| SC | Name | Kind | How / axe rules | Typical screen states |
|---|---|---|---|---|
| 1.1.1 | Non-text content | automated | `image-alt`, `input-image-alt`, `svg-img-alt`, `role-img-alt`, `object-alt`, `area-alt` | icons-only buttons, charts, logos |
| 1.2.x | Time-based media | manual | captions / transcripts present and accurate | video help |
| 1.3.1 | Info and relationships | automated + manual | `label`, `list`, `listitem`, `definition-list`, `th-has-data-cells`, `td-headers-attr`, `table-fake-caption`, `aria-required-children/parent`; manual: visual grouping conveyed to AT | forms, data tables, fieldsets |
| 1.3.2 | Meaningful sequence | manual | read order (VoiceOver/NVDA) matches visual order | multi-column layouts, cards |
| 1.3.3 | Sensory characteristics | manual | instructions do not rely on shape/colour/position alone | "click the green button" |
| 1.3.4 | Orientation | manual | works in portrait and landscape | mobile viewports |
| 1.3.5 | Identify input purpose | automated | `autocomplete-valid` | address / payment forms |
| 1.4.1 | Use of colour | manual | status conveyed by more than colour (icon/text) | status chips, validation |
| 1.4.2 | Audio control | manual | autoplay audio controllable | rarely applies |
| 1.4.3 | Contrast (minimum) | automated | `color-contrast` (4.5:1 text, 3:1 large) | every state; disabled states exempt |
| 1.4.4 | Resize text | automated | 200 % zoom — no clipped/overlapping text (Playwright `page.setViewportSize` + CSS zoom or `deviceScaleFactor`) | dense screens |
| 1.4.5 | Images of text | manual | none except logos | marketing banners |
| 1.4.10 | Reflow | automated | 320 CSS px width — no horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`) | lists, tables (allowed exceptions: data tables) |
| 1.4.11 | Non-text contrast | automated (partial) + manual | `color-contrast` does not cover UI components — check focus rings, borders, icons ≥ 3:1 manually | inputs, toggles, icons |
| 1.4.12 | Text spacing | manual (scriptable) | inject the WCAG text-spacing CSS, assert no clipping | long labels |
| 1.4.13 | Content on hover/focus | manual | tooltips dismissible (Esc), hoverable, persistent | tooltips, menus |

## Operable

| SC | Name | Kind | How / axe rules | Typical screen states |
|---|---|---|---|---|
| 2.1.1 | Keyboard | automated + manual | `expectTabOrder` over registry stops; Enter/Space activate; manual for custom widgets (date pickers, drag) | every interactive screen |
| 2.1.2 | No keyboard trap | automated | Tab cycles out of overlays; Esc closes | modals, embedded editors |
| 2.1.4 | Character key shortcuts | manual | single-key shortcuts remappable/disable-able | power-user screens |
| 2.2.1 | Timing adjustable | manual | session timeout warning + extend | auth |
| 2.2.2 | Pause, stop, hide | manual | auto-updating content controllable | dashboards |
| 2.3.1 | Three flashes | manual | none | animations |
| 2.4.1 | Bypass blocks | automated | `bypass`, `region`, `landmark-*` | every page |
| 2.4.2 | Page titled | automated | `document-title` + `expect(page).toHaveTitle(/…/)` | every route |
| 2.4.3 | Focus order | automated + manual | `expectTabOrder`; focus moves into dialog and back to trigger | overlays, validation |
| 2.4.4 | Link purpose (in context) | automated | `link-name` | "read more" links |
| 2.4.5 | Multiple ways | manual | nav + search + sitemap | app shell |
| 2.4.6 | Headings and labels | automated (partial) + manual | `empty-heading`, `heading-order` (best-practice), `label-title-only` | forms, sections |
| 2.4.7 | Focus visible | automated (partial) + manual | assert `:focus-visible` outline/box-shadow computed style on stops; manual across themes | every interactive screen |
| 2.4.11 | Focus not obscured (min) — **2.2** | manual | focused element not hidden under sticky header/footer/cookie bar | sticky layouts |
| 2.5.1 | Pointer gestures | manual | multipoint/path gestures have single-pointer alternative | maps, sliders |
| 2.5.2 | Pointer cancellation | manual | actions on up-event | drag/drop |
| 2.5.3 | Label in name | automated | `label-content-name-mismatch` | icon+text buttons |
| 2.5.4 | Motion actuation | manual | shake/tilt alternatives | mobile |
| 2.5.7 | Dragging movements — **2.2** | manual | drag has click/keyboard alternative | kanban, reorder |
| 2.5.8 | Target size (minimum) — **2.2** | automated (partial) | `target-size` (24×24 CSS px or spacing) | dense toolbars, table row actions |

## Understandable

| SC | Name | Kind | How / axe rules | Typical screen states |
|---|---|---|---|---|
| 3.1.1 | Language of page | automated | `html-has-lang`, `html-lang-valid` | every page |
| 3.1.2 | Language of parts | automated | `valid-lang` | mixed-language content |
| 3.2.1 | On focus | manual | focus does not trigger navigation | selects, tabs |
| 3.2.2 | On input | manual | changing a control does not auto-submit unexpectedly | filters |
| 3.2.3 | Consistent navigation | manual | nav order stable across pages | app shell |
| 3.2.4 | Consistent identification | manual | same icon = same function | toolbars |
| 3.2.6 | Consistent help — **2.2** | manual | help/contact in the same place on every page | app shell |
| 3.3.1 | Error identification | automated + manual | error text present and linked (`aria-describedby`); manual: wording identifies the field | form validation state |
| 3.3.2 | Labels or instructions | automated | `label`, `form-field-multiple-labels` | every form |
| 3.3.3 | Error suggestion | manual | error says how to fix | validation |
| 3.3.4 | Error prevention (legal, financial) | manual | review/confirm/undo on money & legal actions | payments, deletions |
| 3.3.7 | Redundant entry — **2.2** | manual | previously entered data auto-filled or selectable | multi-step forms |
| 3.3.8 | Accessible authentication (min) — **2.2** | manual | no cognitive test; paste allowed; password managers work | login, MFA |

## Robust

| SC | Name | Kind | How / axe rules | Typical screen states |
|---|---|---|---|---|
| 4.1.2 | Name, role, value | automated | `button-name`, `aria-roles`, `aria-valid-attr`, `aria-valid-attr-value`, `aria-allowed-attr`, `aria-required-attr`, `aria-hidden-focus`, `nested-interactive`, `select-name`, `frame-title` | custom components, icon buttons |
| 4.1.3 | Status messages | automated (partial) + manual | assert `role=status|alert` / `aria-live` on toasts + error summaries; manual: announced without focus move | success/toast, validation |

## Severity mapping (CONTRACTS §7)

axe `critical → Critical` · `serious → High` · `moderate → Medium` · `minor → Low`. The gate
(`§Quality gates` → Accessibility) fails on unresolved Critical/High; `A11Y_FAIL_ON` in
`<qa-root>/.env.<env>` makes the spec fail on the same impacts.
