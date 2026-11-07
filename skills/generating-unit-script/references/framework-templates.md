# Framework templates for generated unit tests

One template per framework `§Unit testing` may name. Every template carries the same fixed parts:
the **header comment** (case, subject citation, generated-at sha, guards, doubles), a **container
named with the Case ID**, one **`// Row N:` per matrix row**, table-driven rows where the shape
repeats, separate tests for throw/interaction/property rows, and **no I/O, clock, random, sleep,
logic, or skip markers**. Copy the surrounding project's conventions (namespaces, import style,
assertion library) from a sibling test — the templates show structure, not house style.

Target-path conventions come from `§Unit testing` (e.g. `tests/<same folder>/<Subject>Tests.cs`,
`<subject>.test.ts` beside the subject, `tests/test_<subject>.py`, `src/test/java/<pkg>/<Subject>Test.java`).

---

## xUnit (C# / .NET) — `.cs`

```csharp
// Case: TC-UNIT-BILLING-001 — PriceCalculator.Total — discounts and rounding
// Feature: invoice-pricing   Plan: <qa-root>/plans/invoice-pricing/2026-09-10-test-plan.md
// Subject: backend:src/Billing/PriceCalculator.cs#Total @ a1b2c3d   Generated @ a1b2c3d (@agentic:gen)
// Guards: Row 1 → `*` in line net · Row 2 → rounding mode (half-up) · Row 3 → `>= 0` clamp · Row 4 → `> 100` check · Row 7 → per-line discount
// Doubles: IClock (stub) · IRateTable (stub) — never PriceCalculator / Money / LineItem
using Xunit;
using Billing;                       // real subject namespace, confirmed at HEAD
using Billing.Tests.Fakes;           // existing fakes reused (FixedClock, StubRateTable)

namespace Billing.Tests;

[Trait("Case", "TC-UNIT-BILLING-001")]
public sealed class PriceCalculatorTotalTests
{
    private static PriceCalculator Sut() =>
        new(new FixedClock(new DateTimeOffset(2026, 3, 31, 10, 0, 0, TimeSpan.Zero)),
            new StubRateTable(vat: 0.20m));

    // Row 1 / Row 3 / Row 5 / Row 7 — same shape (order → total), table-driven
    [Theory]
    [InlineData(1, 2, 10.00, 0, 24.00)]      // Row 1: 1 line, qty 2 × 10.00, no discount, VAT 20%
    [InlineData(1, 1, 10.00, 100, 0.00)]     // Row 3: discount 100% → 0.00, never negative
    [InlineData(0, 0, 0.00, 0, 0.00)]        // Row 5: 0 lines → 0.00
    public void Total_ValidOrder_ReturnsExpected(int lines, int qty, decimal unit, decimal discountPct, decimal expected)
    {
        // Arrange
        var order = OrderBuilder.WithLines(lines, qty, unit).WithDiscount(discountPct).Build();

        // Act
        var total = Sut().Total(order);

        // Assert
        Assert.Equal(expected, total);
    }

    // Row 2: 10.005 rounds half-up to 10.01 (not banker's 10.00)
    [Fact]
    public void Total_HalfPenny_RoundsHalfUp()
    {
        var order = OrderBuilder.WithLines(1, 1, 10.005m).Build();

        var total = Sut().Total(order);

        Assert.Equal(10.01m, total);
    }

    // Row 4: discount 101% → ValidationException naming "discount"; order unchanged
    [Fact]
    public void Total_DiscountOver100_ThrowsValidation_AndDoesNotMutateOrder()
    {
        var order = OrderBuilder.WithLines(1, 1, 10.00m).WithDiscount(101).Build();
        var before = order.Snapshot();

        var ex = Assert.Throws<ValidationException>(() => Sut().Total(order));

        Assert.Equal("discount", ex.Field);
        Assert.Equal(before, order.Snapshot());
    }

    // Row 6: lines = null → ArgumentNullException("order.Lines")
    [Fact]
    public void Total_NullLines_ThrowsArgumentNull()
    {
        var order = OrderBuilder.WithNullLines().Build();

        var ex = Assert.Throws<ArgumentNullException>(() => Sut().Total(order));

        Assert.Equal("order.Lines", ex.ParamName);
    }

    // Row 7: discount on line 2 only → applied once, to line 2 only
    [Fact]
    public void Total_LineDiscount_AppliesToThatLineOnly()
    {
        var order = OrderBuilder.WithLines(2, 1, 10.00m).WithLineDiscount(lineIndex: 1, pct: 50).Build();

        var total = Sut().Total(order);

        Assert.Equal(18.00m, total);                 // (10 + 5) × 1.20
        Assert.Equal(10.00m, order.Lines[0].Net);    // untouched
        Assert.Equal(5.00m, order.Lines[1].Net);
    }

    // Row 8 (property: idempotent, no mutation) — FsCheck when the test project has it; fixed samples otherwise
    [Theory]
    [InlineData(1, 1, 10.00)]
    [InlineData(3, 2, 19.99)]
    [InlineData(5, 7, 0.01)]
    public void Total_CalledTwice_IsIdempotentAndDoesNotMutate(int lines, int qty, decimal unit)
    {
        var order = OrderBuilder.WithLines(lines, qty, unit).Build();
        var before = order.Snapshot();

        var first = Sut().Total(order);
        var second = Sut().Total(order);

        Assert.Equal(first, second);
        Assert.Equal(before, order.Snapshot());
    }
}
```

**NUnit** differs only in attributes: `[TestFixture]`, `[TestCase(...)]`, `[Test]`,
`Assert.That(total, Is.EqualTo(24.00m))`, `Assert.Throws<T>(() => …)`, `[Category("TC-UNIT-…")]`
for the Case ID. **MSTest**: `[TestClass]`, `[DataTestMethod]/[DataRow]`, `[TestMethod]`,
`[TestCategory("TC-UNIT-…")]`.

Compile-only gate: `dotnet build <test project>.csproj --no-restore` (or `-c Release` per repo).
Run filter for `/qa-run`: `dotnet test --filter "Case=TC-UNIT-BILLING-001"` (Trait) or
`FullyQualifiedName~Billing`.

---

## Vitest / Jest (TypeScript) — `.test.ts`

```ts
// Case: TC-UNIT-BILLING-001 — priceTotal — discounts and rounding
// Feature: invoice-pricing   Plan: <qa-root>/plans/invoice-pricing/2026-09-10-test-plan.md
// Subject: frontend:src/billing/price.ts#priceTotal @ 9f8e7d6   Generated @ 9f8e7d6 (@agentic:gen)
// Guards: Row 1 → `*` in line net · Row 2 → rounding mode · Row 3 → `>= 0` clamp · Row 4 → `> 100` check
// Doubles: clock (stub via parameter) — never priceTotal / Money
import { describe, it, expect } from 'vitest';          // or '@jest/globals'
import { priceTotal, ValidationError } from './price';   // real import path, confirmed at HEAD
import { orderWith } from './__fixtures__/order.builder'; // existing builder reused

const clock = () => new Date('2026-03-31T10:00:00Z');    // stub: fixed instant per case

describe('TC-UNIT-BILLING-001 — priceTotal', () => {
  // Row 1 / Row 3 / Row 5 — same shape, table-driven. Money in integer pence.
  it.each([
    { row: 1, lines: 1, qty: 2, unitPence: 1000, discountPct: 0,   expectedPence: 2400 }, // Row 1
    { row: 3, lines: 1, qty: 1, unitPence: 1000, discountPct: 100, expectedPence: 0 },    // Row 3
    { row: 5, lines: 0, qty: 0, unitPence: 0,    discountPct: 0,   expectedPence: 0 },    // Row 5
  ])('Row $row: returns $expectedPence pence', ({ lines, qty, unitPence, discountPct, expectedPence }) => {
    const order = orderWith({ lines, qty, unitPence, discountPct });

    const total = priceTotal(order, { vat: 0.2, clock });

    expect(total).toBe(expectedPence);
  });

  // Row 2: half-penny rounds half-up
  it('Row 2: rounds 1000.5 pence half-up to 1001', () => {
    const order = orderWith({ lines: 1, qty: 1, unitPence: 1000.5 });

    expect(priceTotal(order, { vat: 0, clock })).toBe(1001);
  });

  // Row 4: discount 101% → ValidationError('discount'); input not mutated
  it('Row 4: throws ValidationError("discount") for 101% and leaves the order unchanged', () => {
    const order = orderWith({ lines: 1, qty: 1, unitPence: 1000, discountPct: 101 });
    const before = structuredClone(order);

    expect(() => priceTotal(order, { vat: 0.2, clock })).toThrowError(
      expect.objectContaining({ name: 'ValidationError', field: 'discount' }),
    );
    expect(order).toEqual(before);
  });

  // Row 6: lines = null → TypeError naming order.lines
  it('Row 6: throws TypeError("order.lines") when lines is null', () => {
    const order = orderWith({ lines: null as unknown as never });

    expect(() => priceTotal(order, { vat: 0.2, clock })).toThrow(/order\.lines/);
  });

  // Row 8 (property: idempotent) — fast-check when present in the repo; fixed samples otherwise
  it.each([[1, 1, 1000], [3, 2, 1999], [5, 7, 1]])('Row 8: idempotent for %i lines × %i × %i', (lines, qty, unitPence) => {
    const order = orderWith({ lines, qty, unitPence });

    const a = priceTotal(order, { vat: 0.2, clock });
    const b = priceTotal(order, { vat: 0.2, clock });

    expect(a).toBe(b);
  });
});
```

Notes: never `vi.useFakeTimers()` as a substitute for an injectable clock when the subject
accepts one; `vi.mock('./module')` only for a **port module** the case lists (never the subject's
module). Floats: only through the repo's decimal/pence convention. Compile-only gate:
`npx tsc --noEmit -p <test tsconfig>`; run filter: `npx vitest run <path>` / `-t "TC-UNIT-…"`.

---

## pytest (Python) — `.py`

```python
# Case: TC-UNIT-BILLING-001 — price_total — discounts and rounding
# Feature: invoice-pricing   Plan: <qa-root>/plans/invoice-pricing/2026-09-10-test-plan.md
# Subject: backend:app/billing/price.py#price_total @ 5c6d7e8   Generated @ 5c6d7e8 (@agentic:gen)
# Guards: Row 1 → `*` in line net · Row 2 → ROUND_HALF_UP · Row 3 → `>= 0` clamp · Row 4 → `> 100` check
# Doubles: clock (callable stub) — never price_total / Money
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.billing.price import ValidationError, price_total      # real import, confirmed at HEAD
from tests.builders import order_with                             # existing builder reused

CLOCK = lambda: datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc)  # noqa: E731 — fixed instant


@pytest.mark.case("TC-UNIT-BILLING-001")
class TestPriceTotal:
    # Row 1 / Row 3 / Row 5 — same shape, parametrised
    @pytest.mark.parametrize(
        "row, lines, qty, unit, discount_pct, expected",
        [
            (1, 1, 2, Decimal("10.00"), 0, Decimal("24.00")),    # Row 1
            (3, 1, 1, Decimal("10.00"), 100, Decimal("0.00")),   # Row 3
            (5, 0, 0, Decimal("0.00"), 0, Decimal("0.00")),      # Row 5
        ],
    )
    def test_total_valid_order_returns_expected(self, row, lines, qty, unit, discount_pct, expected):
        order = order_with(lines=lines, qty=qty, unit=unit, discount_pct=discount_pct)

        total = price_total(order, vat=Decimal("0.20"), clock=CLOCK)

        assert total == expected

    # Row 2: half-penny rounds half-up
    def test_total_half_penny_rounds_half_up(self):
        order = order_with(lines=1, qty=1, unit=Decimal("10.005"))

        assert price_total(order, vat=Decimal("0"), clock=CLOCK) == Decimal("10.01")

    # Row 4: discount 101% → ValidationError('discount'); no mutation
    def test_total_discount_over_100_raises_and_does_not_mutate(self):
        order = order_with(lines=1, qty=1, unit=Decimal("10.00"), discount_pct=101)
        before = order.snapshot()

        with pytest.raises(ValidationError) as exc:
            price_total(order, vat=Decimal("0.20"), clock=CLOCK)

        assert exc.value.field == "discount"
        assert order.snapshot() == before

    # Row 6: lines = None → TypeError naming order.lines
    def test_total_none_lines_raises_type_error(self):
        order = order_with(lines=None)

        with pytest.raises(TypeError, match=r"order\.lines"):
            price_total(order, vat=Decimal("0.20"), clock=CLOCK)

    # Row 8 (property: idempotent) — Hypothesis when the project has it; fixed samples otherwise
    @pytest.mark.parametrize("lines, qty, unit", [(1, 1, "10.00"), (3, 2, "19.99"), (5, 7, "0.01")])
    def test_total_called_twice_is_idempotent(self, lines, qty, unit):
        order = order_with(lines=lines, qty=qty, unit=Decimal(unit))

        assert price_total(order, vat=Decimal("0.20"), clock=CLOCK) == price_total(order, vat=Decimal("0.20"), clock=CLOCK)
```

`case` marker: register once in the project's `conftest.py`/`pytest.ini` (`markers = case: TC id`)
— a `> **Project setup required:**` HANDOFF note if absent (never edit the config yourself in
`propose` mode). Compile/collect gate: `python -m pytest --collect-only -q <file>`; run filter:
`-m "case"` or `-k TC_UNIT` / the file path.

---

## JUnit 5 (Java / Kotlin) — `.java` / `.kt`

```java
// Case: TC-UNIT-BILLING-001 — PriceCalculator.total — discounts and rounding
// Feature: invoice-pricing   Plan: <qa-root>/plans/invoice-pricing/2026-09-10-test-plan.md
// Subject: backend:src/main/java/com/acme/billing/PriceCalculator.java#total @ 7a8b9c0   Generated @ 7a8b9c0 (@agentic:gen)
// Guards: Row 1 → `*` in line net · Row 2 → RoundingMode.HALF_UP · Row 3 → `>= 0` clamp · Row 4 → `> 100` check
// Doubles: Clock (Clock.fixed) — never PriceCalculator / Money
package com.acme.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@Tag("TC-UNIT-BILLING-001")
@DisplayName("TC-UNIT-BILLING-001 — PriceCalculator.total")
class PriceCalculatorTotalTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-03-31T10:00:00Z"), ZoneOffset.UTC);
    private final PriceCalculator sut = new PriceCalculator(CLOCK, RateTables.vat("0.20"));

    // Row 1 / Row 3 / Row 5 — same shape, parameterised
    @ParameterizedTest(name = "Row {0}: total = {5}")
    @CsvSource({
        "1, 1, 2, 10.00, 0,   24.00",   // Row 1
        "3, 1, 1, 10.00, 100, 0.00",    // Row 3
        "5, 0, 0, 0.00,  0,   0.00",    // Row 5
    })
    void total_validOrder_returnsExpected(int row, int lines, int qty, BigDecimal unit, BigDecimal discountPct, BigDecimal expected) {
        var order = OrderBuilder.withLines(lines, qty, unit).withDiscount(discountPct).build();

        var total = sut.total(order);

        assertThat(total).isEqualByComparingTo(expected);
    }

    // Row 2: half-penny rounds half-up
    @Test
    void total_halfPenny_roundsHalfUp() {
        var order = OrderBuilder.withLines(1, 1, new BigDecimal("10.005")).build();

        assertThat(sut.total(order)).isEqualByComparingTo("10.01");
    }

    // Row 4: discount 101% → ValidationException("discount"); order unchanged
    @Test
    void total_discountOver100_throwsValidation_andDoesNotMutate() {
        var order = OrderBuilder.withLines(1, 1, new BigDecimal("10.00")).withDiscount(new BigDecimal("101")).build();
        var before = order.snapshot();

        assertThatThrownBy(() -> sut.total(order))
            .isInstanceOf(ValidationException.class)
            .hasFieldOrPropertyWithValue("field", "discount");
        assertThat(order.snapshot()).isEqualTo(before);
    }

    // Row 6: lines = null → NullPointerException / IllegalArgumentException per contract, naming order.lines
    @Test
    void total_nullLines_throwsIllegalArgument() {
        var order = OrderBuilder.withNullLines().build();

        assertThatThrownBy(() -> sut.total(order))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("order.lines");
    }
}
```

Property rows → jqwik `@Property` when present, else `@ParameterizedTest` samples. Compile gate:
`mvn -q test-compile` / `gradle compileTestJava`; run filter: `-Dgroups=TC-UNIT-BILLING-001` /
`--tests '*PriceCalculatorTotalTest'`.

---

## Static-gate token list (all frameworks) — the generator greps its own output for these

```
DateTime.Now  DateTime.UtcNow  DateTimeOffset.Now  Date.now(  new Date()  datetime.now(  Instant.now(  LocalDate.now(
Random  Math.random  Guid.NewGuid  uuid4(  UUID.randomUUID
Thread.Sleep  Task.Delay  setTimeout  time.sleep  Thread.sleep
HttpClient  fetch(  axios  requests.  WebClient  RestTemplate
File.  fs.  open(  Files.  Path(  Environment.  process.env  os.environ  System.getenv
.skip  .only  Skip =  @Disabled  @pytest.mark.skip  xit(  fit(  [Ignore]
Assert.True(true)  expect(true).toBe(true)  assert True
```
A hit inside the test body (not inside a fake/builder the case lists) fails the static gate.
