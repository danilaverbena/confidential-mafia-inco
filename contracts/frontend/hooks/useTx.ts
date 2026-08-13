"use client";

// One write + receipt-wait, shared by every game page. Reports pending,
// confirming, on-chain revert, and wallet errors - and only refetches on a
// genuinely successful receipt.
import { useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";

export function useTx(onConfirm?: () => void) {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { data: receipt, isLoading: confirming } = useWaitForTransactionReceipt({ hash });
  const cb = useRef(onConfirm);
  cb.current = onConfirm;
  const handled = useRef<string | undefined>(undefined);

  // Success vs revert: waitForTransactionReceipt resolves for BOTH, so check status.
  useEffect(() => {
    if (!receipt || handled.current === receipt.transactionHash) return;
    handled.current = receipt.transactionHash;
    if (receipt.status === "success") {
      toast.success("Confirmed");
      cb.current?.();
    } else {
      toast.error("Transaction reverted on-chain");
    }
    reset();
  }, [receipt, reset]);

  // Wallet-side failures (user rejected, gas estimation, etc.).
  useEffect(() => {
    if (error) toast.error((error as { shortMessage?: string }).shortMessage || error.message.split("\n")[0]);
  }, [error]);

  const busy = isPending || confirming;
  const phase = isPending ? "waiting for wallet" : confirming ? "confirming" : null;
  return { send: writeContract, busy, phase, hash };
}
