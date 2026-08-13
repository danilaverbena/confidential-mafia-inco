import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

// Deploy a War game with a configurable bet.
export default buildModule("War", (m) => {
  const bet = m.getParameter("bet", parseEther("0.01"));
  const game = m.contract("War", [bet]);
  return { game };
});
