;; sbtc-token.clar
;; Minimal SIP-010 sBTC stub for local Clarinet testing.
;; On testnet/mainnet, use the real sBTC contract deployed by Hiro/Bitcoin Layers.

(define-fungible-token sbtc)

(define-constant ERR-NOT-AUTHORIZED (err u401))
(define-constant ERR-INSUFFICIENT-BALANCE (err u402))

;; SIP-010 trait implementation

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (ft-transfer? sbtc amount sender recipient)
  )
)

(define-read-only (get-name) (ok "sBTC"))
(define-read-only (get-symbol) (ok "sBTC"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-balance (account principal)) (ok (ft-get-balance sbtc account)))
(define-read-only (get-total-supply) (ok (ft-get-supply sbtc)))
(define-read-only (get-token-uri) (ok none))

;; Mint for testing only — not present in real sBTC contract
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? sbtc amount recipient)
)
