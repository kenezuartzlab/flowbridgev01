/**
 * FlowBridge V13.1 — deterministic reference simulator for FlowStakingVault.
 *
 * A faithful integer port of contracts/FlowStakingVault.sol accounting used for
 * local dry-runs and invariant tests. Simulates nothing economic by itself: all
 * amounts/durations must be supplied by the caller from an owner-approved
 * config. It never derives an APR/APY.
 */

export class StakingSimError extends Error {}

export interface SimAccount {
  balance: bigint;
  userRewardPerTokenPaid: bigint;
  rewards: bigint;
  wallet: bigint;
}

const WAD = 10n ** 18n;

export class FlowStakingVaultSim {
  readonly token: string;
  owner: string;
  paused = false;

  totalStaked = 0n;
  rewardInventory = 0n;
  rewardCommitted = 0n;
  minStake = 0n;
  maxStakePerWallet = 0n;

  rewardRate = 0n;
  periodFinish = 0n;
  lastUpdateTime = 0n;
  rewardPerTokenStored = 0n;

  now: bigint;
  /** Simulated FLOW balance the vault holds (principal + reward inventory). */
  vaultTokenBalance = 0n;
  accounts = new Map<string, SimAccount>();

  constructor(opts: { token: string; owner: string; startTime?: bigint }) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(opts.token)) throw new StakingSimError("TokenZeroAddress");
    this.token = opts.token;
    this.owner = opts.owner;
    this.now = opts.startTime ?? 0n;
  }

  // -------------------------------------------------------------- utilities

  private acct(who: string): SimAccount {
    let a = this.accounts.get(who);
    if (!a) {
      a = { balance: 0n, userRewardPerTokenPaid: 0n, rewards: 0n, wallet: 0n };
      this.accounts.set(who, a);
    }
    return a;
  }

  credit(who: string, amount: bigint) {
    this.acct(who).wallet += amount;
  }

  warp(seconds: bigint) {
    if (seconds < 0n) throw new StakingSimError("time cannot move backwards");
    this.now += seconds;
  }

  lastTimeRewardApplicable(): bigint {
    return this.now < this.periodFinish ? this.now : this.periodFinish;
  }

  rewardPerToken(): bigint {
    if (this.totalStaked === 0n) return this.rewardPerTokenStored;
    const t = this.lastTimeRewardApplicable();
    if (t <= this.lastUpdateTime) return this.rewardPerTokenStored;
    return this.rewardPerTokenStored + ((t - this.lastUpdateTime) * this.rewardRate * WAD) / this.totalStaked;
  }

  earned(who: string): bigint {
    const a = this.acct(who);
    return a.rewards + (a.balance * (this.rewardPerToken() - a.userRewardPerTokenPaid)) / WAD;
  }

  uncommittedRewards(): bigint {
    return this.rewardInventory > this.rewardCommitted ? this.rewardInventory - this.rewardCommitted : 0n;
  }

  scheduleActive(): boolean {
    return this.rewardRate > 0n && this.now < this.periodFinish;
  }

  balanceOf(who: string): bigint {
    return this.acct(who).balance;
  }

  walletOf(who: string): bigint {
    return this.acct(who).wallet;
  }

  private update(who: string | null) {
    this.rewardPerTokenStored = this.rewardPerToken();
    this.lastUpdateTime = this.lastTimeRewardApplicable();
    if (who) {
      const a = this.acct(who);
      a.rewards = this.earned(who);
      a.userRewardPerTokenPaid = this.rewardPerTokenStored;
    }
  }

  // ------------------------------------------------------------ user paths

  stake(who: string, amount: bigint) {
    if (this.paused) throw new StakingSimError("EnforcedPause");
    if (amount <= 0n) throw new StakingSimError("ZeroAmount");
    const a = this.acct(who);
    if (a.wallet < amount) throw new StakingSimError("ERC20InsufficientBalance");
    const next = a.balance + amount;
    if (this.minStake !== 0n && next < this.minStake) throw new StakingSimError("BelowMinStake");
    if (this.maxStakePerWallet !== 0n && next > this.maxStakePerWallet) throw new StakingSimError("AboveMaxStake");

    this.update(who);
    a.balance = next;
    this.totalStaked += amount;
    a.wallet -= amount;
    this.vaultTokenBalance += amount;
  }

  /** Principal withdrawal — intentionally available while paused. */
  withdraw(who: string, amount: bigint) {
    if (amount <= 0n) throw new StakingSimError("ZeroAmount");
    const a = this.acct(who);
    if (a.balance < amount) throw new StakingSimError("InsufficientStake");
    this.update(who);
    a.balance -= amount;
    this.totalStaked -= amount;
    a.wallet += amount;
    this.vaultTokenBalance -= amount;
  }

  claimReward(who: string): bigint {
    if (this.paused) throw new StakingSimError("EnforcedPause");
    this.update(who);
    const a = this.acct(who);
    const amount = a.rewards;
    if (amount === 0n) throw new StakingSimError("NothingToClaim");
    a.rewards = 0n;
    this.rewardInventory -= amount;
    this.rewardCommitted -= amount;
    a.wallet += amount;
    this.vaultTokenBalance -= amount;
    return amount;
  }

  // ----------------------------------------------------------- owner paths

  fundRewards(from: string, amount: bigint) {
    if (amount <= 0n) throw new StakingSimError("ZeroAmount");
    const a = this.acct(from);
    if (a.wallet < amount) throw new StakingSimError("ERC20InsufficientBalance");
    a.wallet -= amount;
    this.rewardInventory += amount;
    this.vaultTokenBalance += amount;
  }

  activateSchedule(caller: string, budget: bigint, duration: bigint) {
    if (caller !== this.owner) throw new StakingSimError("OwnableUnauthorizedAccount");
    if (duration <= 0n) throw new StakingSimError("InvalidDuration");
    if (budget <= 0n) throw new StakingSimError("ZeroAmount");
    if (this.scheduleActive()) throw new StakingSimError("ScheduleActive");
    if (budget > this.uncommittedRewards()) throw new StakingSimError("ScheduleUnderfunded");
    this.update(null);
    this.rewardCommitted += budget;
    this.rewardRate = budget / duration;
    if (this.rewardRate === 0n) throw new StakingSimError("ScheduleUnderfunded");
    this.lastUpdateTime = this.now;
    this.periodFinish = this.now + duration;
  }

  setMinStake(caller: string, value: bigint) {
    if (caller !== this.owner) throw new StakingSimError("OwnableUnauthorizedAccount");
    this.minStake = value;
  }

  setMaxStakePerWallet(caller: string, value: bigint) {
    if (caller !== this.owner) throw new StakingSimError("OwnableUnauthorizedAccount");
    this.maxStakePerWallet = value;
  }

  pause(caller: string) {
    if (caller !== this.owner) throw new StakingSimError("OwnableUnauthorizedAccount");
    this.paused = true;
  }

  unpause(caller: string) {
    if (caller !== this.owner) throw new StakingSimError("OwnableUnauthorizedAccount");
    this.paused = false;
  }

  recoverUncommittedRewards(caller: string, to: string, amount: bigint) {
    if (caller !== this.owner) throw new StakingSimError("OwnableUnauthorizedAccount");
    if (amount <= 0n) throw new StakingSimError("ZeroAmount");
    if (amount > this.uncommittedRewards()) throw new StakingSimError("NotRecoverable");
    this.rewardInventory -= amount;
    this.acct(to).wallet += amount;
    this.vaultTokenBalance -= amount;
  }

  // ------------------------------------------------------------ invariants

  /** I1/I3: vault token balance always covers principal + reward inventory. */
  checkInvariants(): string[] {
    const broken: string[] = [];
    if (this.vaultTokenBalance < this.totalStaked + this.rewardInventory) broken.push("I1 solvency");
    let sum = 0n;
    for (const a of this.accounts.values()) sum += a.balance;
    if (sum !== this.totalStaked) broken.push("principal accounting");
    if (this.rewardCommitted > this.rewardInventory) broken.push("I2 over-committed rewards");
    return broken;
  }
}
