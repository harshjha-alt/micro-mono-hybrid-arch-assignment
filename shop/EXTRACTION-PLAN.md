# Inventory Extraction Plan

## Candidate and signal

I would consider extracting inventory because it owns stock availability and
reservation, a clear business responsibility. The signal I am using is a need
for independent scaling or ownership around stock contention. I would confirm
that this matches the signal named in course step 14 before treating it as the
final choice.

## Data ownership

Inventory owns the `stock` table, accessed through `src/modules/inventory/repo.ts`.
Orders currently reads that table directly in the original code; after the
boundary change, orders should only ask inventory to reserve stock through its
public API. The flow test seeds inventory data directly as test setup.

Before extracting inventory, I would check that no production module reads or
writes the stock table except inventory itself.

## What changes when calls use a network

Orders calls `reserve(sku, qty)`. If that becomes a network call and times out,
orders cannot tell whether inventory never received the request or reserved the
stock but its reply was lost. Orders must not continue to charge when it has no
reservation result. Retrying also needs an idempotency key so one order cannot
reserve the same stock twice.

Orders also calls payments. If payment times out after inventory reserved stock,
the order may be left with stock reserved but no confirmed payment. Before
extraction, I would define how to cancel or expire that reservation and how to
reconcile uncertain payment results.

If notifications is unavailable for ten minutes, the order should remain
placed; the customer confirmation should be delayed, not silently lost. An
in-memory event bus cannot deliver an event while its process is unavailable.
Before relying on separate services, I would add durable event storage or an
outbox, retry delivery, make notification handling idempotent, and monitor
messages that keep failing.

## Five-step approach

Use the exact step names from course step 15 as the headings below.

### Step 1: Confirm the boundary and baseline

Keep inventory as a module in the existing application. Check the flow tests,
record current reserve behavior, and verify that only inventory owns stock
writes. Do not create a new service yet.

Check before moving on: the flow tests pass and the boundary checker reports no
cross-module access to the stock repo.

### Step 2: Define the contract

Document the inventory operations orders needs, their inputs and results, and
the expected error cases. Add an idempotency key to reservation requests before
a remote call is introduced.

Check before moving on: callers can use the contract without depending on the
inventory repo or table types.

### Step 3: Put the contract behind an adapter

Keep the call in-process, but make orders depend on the inventory contract
rather than inventory implementation details. Test success, unknown SKU,
out-of-stock, and repeated reservation requests.

Check before moving on: tests show the adapter preserves existing order behavior.

### Step 4: Prepare data ownership and failure handling

Ensure inventory is the only owner of stock data. Design reservation expiry,
cancellation, retry, and reconciliation for timeouts. Add durable delivery and
retry behavior for order confirmation events.

Check before moving on: failure tests demonstrate that retries do not double
reserve stock or lose confirmations.

### Step 5: Extract gradually and observe

Only after the contract and failure behavior are proven, deploy inventory as a
separate service behind the adapter. Shift a small amount of traffic first,
monitor timeouts, reservation failures, latency, and reconciliation, and keep
a rollback path.

Check before moving on: observed production behavior matches the in-process
baseline and the team can operate the service reliably.

## Stop point

I would stop after the in-process contract and adapter are working. I would not
deploy a separate service until reservation retries are idempotent, timeouts can
be reconciled, inventory data has one clear owner, and the team can monitor and
support the service.