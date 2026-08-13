import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// npx hardhat ignition deploy ignition/modules/ConfidentialMafia.ts --network baseSepolia
export default buildModule("ConfidentialMafia", (m) => {
  const mafiaCount = m.getParameter("mafiaCount", 1);
  const game = m.contract("ConfidentialMafia", [mafiaCount]);
  return { game };
});
