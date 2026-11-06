"use client";

import {
  ArrowRight,
  Check,
  Coffee,
  RotateCcw,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";

/** A clearly labelled walkthrough. It never connects a wallet or submits a payment. */
export function CheckoutPreview() {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();
  return (
    <div className="checkout-scene">
      <div className="scene-orbit" aria-hidden="true" />
      <LiquidGlassCard
        draggable={false}
        shadowIntensity="xs"
        glowIntensity="sm"
        className="checkout-preview"
        borderRadius="28px"
      >
        <div className="preview-topline">
          <span>
            <Coffee size={15} /> Chai &amp; Co.
          </span>
          <span className="preview-label">Interactive walkthrough</span>
        </div>
        <div className="preview-content" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              {step < 2 ? (
                <>
                  <div className="checkout-icon">
                    <Coffee size={29} strokeWidth={1.4} />
                  </div>
                  <p className="preview-caption">
                    {step === 0
                      ? "A little chai. A better checkout."
                      : "Your signature. Your payment."}
                  </p>
                  <div className="payment-amount">
                    1.00 <span>USDT</span>
                  </div>
                  <div className="checkout-lines">
                    <div>
                      <span>Network</span>
                      <span>Whitechain Sepolia</span>
                    </div>
                    <div>
                      <span>Network fee</span>
                      <span className="blue-text">
                        Sponsored by the shop <Zap size={12} />
                      </span>
                    </div>
                  </div>
                  {step === 1 && (
                    <p className="walkthrough-note">
                      In a real checkout, your wallet asks you to sign an
                      authorization bound to this invoice.
                    </p>
                  )}
                  <button
                    type="button"
                    className="payment-button"
                    onClick={() => setStep(step + 1)}
                  >
                    {step === 0 ? (
                      <>
                        <Wallet size={17} /> Preview checkout
                      </>
                    ) : (
                      <>
                        Simulate signature <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="preview-success">
                  <span className="success-icon">
                    <Check size={30} />
                  </span>
                  <h3>Straight to the shop.</h3>
                  <p>1.00 USDT</p>
                  <div className="checkout-lines">
                    <div>
                      <span>Recipient</span>
                      <span>Merchant wallet</span>
                    </div>
                    <div>
                      <span>Sableye balance</span>
                      <span>0 USDT</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="payment-button"
                    onClick={() => setStep(0)}
                  >
                    <RotateCcw size={16} /> Replay walkthrough
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="preview-bottom">
          <ShieldCheck size={13} />
          <span>Illustration only. No wallet or funds involved.</span>
        </div>
      </LiquidGlassCard>
      <LiquidGlassCard
        draggable={false}
        shadowIntensity="xs"
        glowIntensity="none"
        borderRadius="16px"
        className="settlement-float"
      >
        <span className="settlement-icon">
          <ArrowRight size={20} />
        </span>
        <div>
          <strong>Your wallet. Your revenue.</strong>
          <span>No custodial payout queue.</span>
        </div>
      </LiquidGlassCard>
    </div>
  );
}
