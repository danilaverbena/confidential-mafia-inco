import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploy a Blackjack table (then fund the house bankroll).
export default buildModule("Blackjack", (m) => {
  const game = m.contract("Blackjack", []);
  return { game };
});
