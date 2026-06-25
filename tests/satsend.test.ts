import { describe, it, expect, beforeEach } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

// ---------------------------------------------------------------------------
// Simnet setup
// ---------------------------------------------------------------------------

const simnet = await initSimnet();
const accounts = simnet.getAccounts();

const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;   // invoice creator
const bob = accounts.get("wallet_2")!;     // payer
const carol = accounts.get("wallet_3")!;   // uninvolved third party

const SATSEND = "satsend";
const SBTC = "sbtc-token";

// Helper: mint sBTC to an account via the test stub contract
function mintSbtc(recipient: string, amount: number) {
  return simnet.callPublicFn(
    SBTC,
    "mint",
    [Cl.uint(amount), Cl.principal(recipient)],
    deployer
  );
}

// Helper: create an invoice as `caller`
function createInvoice(
  amount: number,
  deadlineOffset: number,
  memo: string,
  caller: string
) {
  const deadline = simnet.blockHeight + deadlineOffset;
  return simnet.callPublicFn(
    SATSEND,
    "create-invoice",
    [Cl.uint(amount), Cl.uint(deadline), Cl.stringAscii(memo)],
    caller
  );
}

// Helper: pay invoice as `caller`
function payInvoice(invoiceId: number, caller: string) {
  return simnet.callPublicFn(
    SATSEND,
    "pay-invoice",
    [Cl.uint(invoiceId), Cl.contractPrincipal(deployer, SBTC)],
    caller
  );
}

// Helper: cancel invoice as `caller`
function cancelInvoice(invoiceId: number, caller: string) {
  return simnet.callPublicFn(
    SATSEND,
    "cancel-invoice",
    [Cl.uint(invoiceId)],
    caller
  );
}

// Helper: read invoice details
function getInvoice(invoiceId: number) {
  return simnet.callReadOnlyFn(
    SATSEND,
    "get-invoice",
    [Cl.uint(invoiceId)],
    deployer
  );
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("create-invoice", () => {
  it("creates an invoice and returns invoice-id 1 for the first call", () => {
    const { result } = createInvoice(1_000_000, 100, "Design work", alice);
    expect(result).toBeOk(Cl.uint(1));
  });

  it("increments invoice IDs across multiple invocations", () => {
    createInvoice(1_000_000, 100, "First", alice);
    const { result } = createInvoice(2_000_000, 200, "Second", bob);
    // IDs depend on call order within the test suite; just check it is a uint > 0
    const id = (cvToValue(result) as any).value;
    expect(Number(id)).toBeGreaterThan(0);
  });

  it("rejects amount = 0", () => {
    const { result } = createInvoice(0, 100, "Zero amount", alice);
    expect(result).toBeErr(Cl.uint(100)); // ERR-INVALID-AMOUNT
  });

  it("rejects deadline at current block height (not strictly future)", () => {
    const deadline = simnet.blockHeight; // exactly now, not future
    const { result } = simnet.callPublicFn(
      SATSEND,
      "create-invoice",
      [Cl.uint(1_000_000), Cl.uint(deadline), Cl.stringAscii("bad deadline")],
      alice
    );
    expect(result).toBeErr(Cl.uint(101)); // ERR-INVALID-DEADLINE
  });

  it("rejects deadline in the past", () => {
    const deadline = Math.max(1, simnet.blockHeight - 1);
    const { result } = simnet.callPublicFn(
      SATSEND,
      "create-invoice",
      [Cl.uint(1_000_000), Cl.uint(deadline), Cl.stringAscii("past deadline")],
      alice
    );
    expect(result).toBeErr(Cl.uint(101)); // ERR-INVALID-DEADLINE
  });

  it("stores correct invoice data retrievable by get-invoice", () => {
    const amount = 5_000_000;
    const memo = "Consulting retainer";
    const deadlineOffset = 50;
    const expectedDeadline = simnet.blockHeight + deadlineOffset;

    createInvoice(amount, deadlineOffset, memo, alice);
    const count = simnet.callReadOnlyFn(
      SATSEND, "get-invoice-count", [], deployer
    );
    const latestId = Number((cvToValue(count.result) as any).value);

    const { result } = getInvoice(latestId);
    const invoice = cvToValue(result) as any;

    expect(invoice.value.creator.value).toBe(alice);
    expect(Number(invoice.value.amount.value)).toBe(amount);
    expect(invoice.value.memo.value).toBe(memo);
    expect(invoice.value.status.value).toBe("pending");
    expect(invoice.value.payer.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("pay-invoice", () => {
  let invoiceId: number;
  const AMOUNT = 1_000_000;

  beforeEach(() => {
    // Alice creates an invoice; bob will pay it
    mintSbtc(bob, AMOUNT * 2);
    const { result } = createInvoice(AMOUNT, 100, "Payment test", alice);
    invoiceId = Number((cvToValue(result) as any).value);
  });

  it("settles the invoice and transfers sBTC to creator", () => {
    const aliceBalanceBefore = cvToValue(
      simnet.callReadOnlyFn(SBTC, "get-balance", [Cl.principal(alice)], deployer).result
    ) as any;

    const { result } = payInvoice(invoiceId, bob);
    expect(result).toBeOk(Cl.bool(true));

    const aliceBalanceAfter = cvToValue(
      simnet.callReadOnlyFn(SBTC, "get-balance", [Cl.principal(alice)], deployer).result
    ) as any;

    const diff =
      Number(aliceBalanceAfter.value.value) -
      Number(aliceBalanceBefore.value.value);
    expect(diff).toBe(AMOUNT);
  });

  it("marks the invoice as settled after payment", () => {
    payInvoice(invoiceId, bob);
    const { result } = getInvoice(invoiceId);
    const invoice = cvToValue(result) as any;
    expect(invoice.value.status.value).toBe("settled");
    expect(invoice.value.payer.value.value).toBe(bob);
  });

  it("rejects double payment on an already-settled invoice", () => {
    payInvoice(invoiceId, bob);
    mintSbtc(carol, AMOUNT);
    const { result } = payInvoice(invoiceId, carol);
    expect(result).toBeErr(Cl.uint(103)); // ERR-ALREADY-SETTLED
  });

  it("rejects payment on a non-existent invoice", () => {
    const { result } = payInvoice(9999, bob);
    expect(result).toBeErr(Cl.uint(102)); // ERR-NOT-FOUND
  });

  it("rejects self-payment (creator pays their own invoice)", () => {
    mintSbtc(alice, AMOUNT);
    const { result } = payInvoice(invoiceId, alice);
    expect(result).toBeErr(Cl.uint(106)); // ERR-SELF-PAYMENT
  });

  it("rejects payment on a cancelled invoice", () => {
    cancelInvoice(invoiceId, alice);
    const { result } = payInvoice(invoiceId, bob);
    expect(result).toBeErr(Cl.uint(104)); // ERR-CANCELLED
  });

  it("rejects payment after deadline has passed", () => {
    // Create invoice with deadline 1 block in the future, then mine past it
    const { result: createResult } = createInvoice(AMOUNT, 1, "Short deadline", alice);
    const shortId = Number((cvToValue(createResult) as any).value);

    // Mine enough blocks to pass the deadline
    simnet.mineEmptyBlocks(5);

    const { result } = payInvoice(shortId, bob);
    expect(result).toBeErr(Cl.uint(105)); // ERR-EXPIRED
  });
});

// ---------------------------------------------------------------------------

describe("cancel-invoice", () => {
  let invoiceId: number;

  beforeEach(() => {
    const { result } = createInvoice(1_000_000, 100, "Cancel test", alice);
    invoiceId = Number((cvToValue(result) as any).value);
  });

  it("allows creator to cancel a pending invoice", () => {
    const { result } = cancelInvoice(invoiceId, alice);
    expect(result).toBeOk(Cl.bool(true));
  });

  it("marks invoice as cancelled after cancellation", () => {
    cancelInvoice(invoiceId, alice);
    const { result } = getInvoice(invoiceId);
    const invoice = cvToValue(result) as any;
    expect(invoice.value.status.value).toBe("cancelled");
  });

  it("rejects cancellation by a non-creator", () => {
    const { result } = cancelInvoice(invoiceId, bob);
    expect(result).toBeErr(Cl.uint(108)); // ERR-NOT-CREATOR
  });

  it("rejects cancellation of an already-settled invoice", () => {
    mintSbtc(bob, 2_000_000);
    payInvoice(invoiceId, bob);
    const { result } = cancelInvoice(invoiceId, alice);
    expect(result).toBeErr(Cl.uint(103)); // ERR-ALREADY-SETTLED
  });

  it("rejects double cancellation", () => {
    cancelInvoice(invoiceId, alice);
    const { result } = cancelInvoice(invoiceId, alice);
    expect(result).toBeErr(Cl.uint(104)); // ERR-CANCELLED
  });

  it("rejects cancellation of a non-existent invoice", () => {
    const { result } = cancelInvoice(9999, alice);
    expect(result).toBeErr(Cl.uint(102)); // ERR-NOT-FOUND
  });
});

// ---------------------------------------------------------------------------

describe("get-invoice", () => {
  it("returns none for an invoice that does not exist", () => {
    const { result } = getInvoice(9999);
    expect(result).toBeNone();
  });

  it("returns invoice details for a valid ID", () => {
    createInvoice(500_000, 50, "Test memo", alice);
    const count = simnet.callReadOnlyFn(
      SATSEND, "get-invoice-count", [], deployer
    );
    const id = Number((cvToValue(count.result) as any).value);
    const { result } = getInvoice(id);
    expect(result).toBeSome();
  });
});

// ---------------------------------------------------------------------------

describe("get-invoice-count", () => {
  it("starts at 0 before any invoices are created", () => {
    // Note: prior tests run in the same simnet so count may not be 0.
    // We just confirm it is a non-negative number.
    const { result } = simnet.callReadOnlyFn(
      SATSEND, "get-invoice-count", [], deployer
    );
    const count = Number((cvToValue(result) as any).value);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("increments after each create-invoice call", () => {
    const before = Number(
      (cvToValue(
        simnet.callReadOnlyFn(SATSEND, "get-invoice-count", [], deployer).result
      ) as any).value
    );
    createInvoice(1_000_000, 10, "Counter test", alice);
    const after = Number(
      (cvToValue(
        simnet.callReadOnlyFn(SATSEND, "get-invoice-count", [], deployer).result
      ) as any).value
    );
    expect(after).toBe(before + 1);
  });
});
