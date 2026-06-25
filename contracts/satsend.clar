;; satsend.clar
;; On-chain sBTC invoice protocol.
;;
;; Flow: creator calls create-invoice → shares link with payer →
;; payer calls pay-invoice (sBTC transfers on-chain) → invoice marked settled.
;;
;; The sBTC token is accepted via the SIP-010 trait rather than a hardcoded
;; contract address. This means the same contract works on testnet and mainnet
;; without redeployment — the caller passes the appropriate sBTC principal.

;; ---------------------------------------------------------------------------
;; Traits
;; ---------------------------------------------------------------------------

(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

;; ---------------------------------------------------------------------------
;; Constants — error codes
;; ---------------------------------------------------------------------------

(define-constant ERR-INVALID-AMOUNT    (err u100))
(define-constant ERR-INVALID-DEADLINE  (err u101))
(define-constant ERR-NOT-FOUND         (err u102))
(define-constant ERR-ALREADY-SETTLED   (err u103))
(define-constant ERR-CANCELLED         (err u104))
(define-constant ERR-EXPIRED           (err u105))
(define-constant ERR-SELF-PAYMENT      (err u106))
(define-constant ERR-TRANSFER-FAILED   (err u107))
(define-constant ERR-NOT-CREATOR       (err u108))

;; Status strings stored with each invoice
(define-constant STATUS-PENDING    "pending")
(define-constant STATUS-SETTLED    "settled")
(define-constant STATUS-CANCELLED  "cancelled")

;; ---------------------------------------------------------------------------
;; Data
;; ---------------------------------------------------------------------------

;; Auto-incrementing counter; first invoice gets ID 1.
(define-data-var invoice-counter uint u0)

;; Primary invoice store.
;; status is stored as a string to make off-chain reads human-readable without
;; requiring a secondary lookup table.
(define-map invoices uint {
  creator:  principal,
  amount:   uint,
  deadline: uint,                   ;; Stacks block height
  memo:     (string-ascii 256),
  status:   (string-ascii 16),
  payer:    (optional principal)
})

;; ---------------------------------------------------------------------------
;; Private helpers
;; ---------------------------------------------------------------------------

;; Returns the current invoice counter value before incrementing it,
;; effectively reserving the next ID for the caller.
(define-private (next-invoice-id)
  (let ((current (var-get invoice-counter)))
    (var-set invoice-counter (+ current u1))
    (+ current u1)
  )
)

;; Returns true when the invoice deadline has already passed.
(define-private (is-expired (deadline uint))
  (>= block-height deadline)
)

;; ---------------------------------------------------------------------------
;; Public functions
;; ---------------------------------------------------------------------------

;; create-invoice
;; Creates a new invoice stored on-chain.
;; `amount`   — sBTC in satoshis (must be > 0)
;; `deadline` — Stacks block height after which the invoice expires (must be future)
;; `memo`     — free-text description shown to the payer
;; Returns the new invoice ID on success.
(define-public (create-invoice
    (amount   uint)
    (deadline uint)
    (memo     (string-ascii 256)))
  (begin
    ;; Amount must be non-zero
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    ;; Deadline must be strictly in the future so the invoice is payable
    (asserts! (> deadline block-height) ERR-INVALID-DEADLINE)

    (let ((invoice-id (next-invoice-id)))
      (map-set invoices invoice-id {
        creator:  tx-sender,
        amount:   amount,
        deadline: deadline,
        memo:     memo,
        status:   STATUS-PENDING,
        payer:    none
      })
      (ok invoice-id)
    )
  )
)

;; pay-invoice
;; Pays an existing invoice by transferring sBTC from tx-sender to the creator.
;; The invoice must be pending and within its deadline.
;; `invoice-id`    — ID returned by create-invoice
;; `sbtc-contract` — the SIP-010 sBTC token contract principal
;; Returns true on successful payment.
(define-public (pay-invoice
    (invoice-id    uint)
    (sbtc-contract <sip-010-trait>))
  (let ((invoice (unwrap! (map-get? invoices invoice-id) ERR-NOT-FOUND)))
    ;; Guard: invoice must be in a payable state
    (asserts! (is-eq (get status invoice) STATUS-PENDING)
              (if (is-eq (get status invoice) STATUS-SETTLED)
                  ERR-ALREADY-SETTLED
                  ERR-CANCELLED))
    ;; Guard: deadline must not have passed
    (asserts! (not (is-expired (get deadline invoice))) ERR-EXPIRED)
    ;; Guard: creator cannot pay themselves
    (asserts! (not (is-eq tx-sender (get creator invoice))) ERR-SELF-PAYMENT)

    ;; Transfer sBTC from payer to creator
    (unwrap!
      (contract-call? sbtc-contract transfer
        (get amount invoice)
        tx-sender
        (get creator invoice)
        none)
      ERR-TRANSFER-FAILED)

    ;; Mark invoice settled and record who paid
    (map-set invoices invoice-id (merge invoice {
      status: STATUS-SETTLED,
      payer:  (some tx-sender)
    }))
    (ok true)
  )
)

;; cancel-invoice
;; Lets the creator cancel an unpaid invoice at any time before it is settled.
;; Only the original creator can call this.
;; Returns true on success.
(define-public (cancel-invoice (invoice-id uint))
  (let ((invoice (unwrap! (map-get? invoices invoice-id) ERR-NOT-FOUND)))
    ;; Only the creator may cancel
    (asserts! (is-eq tx-sender (get creator invoice)) ERR-NOT-CREATOR)
    ;; Cannot cancel an already-settled invoice
    (asserts! (not (is-eq (get status invoice) STATUS-SETTLED)) ERR-ALREADY-SETTLED)
    ;; Cannot cancel an already-cancelled invoice
    (asserts! (not (is-eq (get status invoice) STATUS-CANCELLED)) ERR-CANCELLED)

    (map-set invoices invoice-id (merge invoice { status: STATUS-CANCELLED }))
    (ok true)
  )
)

;; ---------------------------------------------------------------------------
;; Read-only functions
;; ---------------------------------------------------------------------------

;; get-invoice
;; Returns full invoice details for the given ID, or none if not found.
;; Callers should check whether the invoice is expired by comparing
;; the returned `deadline` against the current block height themselves,
;; since this function is stateless and does not mutate the stored status.
(define-read-only (get-invoice (invoice-id uint))
  (map-get? invoices invoice-id)
)

;; get-invoice-count
;; Returns the total number of invoices ever created (= highest invoice ID).
(define-read-only (get-invoice-count)
  (var-get invoice-counter)
)
