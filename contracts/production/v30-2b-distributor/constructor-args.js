// V30.2B R2 — FlowRewardsMerkleDistributor constructor arguments (human order).
// ABI-encoded form is frozen verbatim in constructor-args.txt.
module.exports = [
  "0xcaaB50F36252a57529AFeF651fa6B9f9281917fF", // token_ (V30.2B FlowToken)
  "0x88A4CC1F5771523baeB83DaEea07D323a3ce9507", // admin_ (Governance Safe)
  "0x88A4CC1F5771523baeB83DaEea07D323a3ce9507", // budgetManager_ (Governance Safe)
  "0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94", // publisher_ (Root Publisher)
  "0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF", // pauser_ (Operations Safe)
  "0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4", // recoveryRecipient_ (Treasury Safe)
  "86400"                                        // minPublishDelay_ (24h)
];
