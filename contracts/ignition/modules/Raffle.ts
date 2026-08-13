import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

// npx hardhat ignition deploy ignition/modules/Raffle.ts --network baseSepolia
export default buildModule("Raffle", (m) => {
  const ticketPrice = m.getParameter("ticketPrice", parseEther("0.001"));
  const minEntrants = m.getParameter("minEntrants", 2);
  const game = m.contract("Raffle", [ticketPrice, minEntrants]);
  return { game };
});
