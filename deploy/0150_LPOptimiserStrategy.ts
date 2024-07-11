import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { MAIN_NETWORKS } from "./0000_utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy("LPOptimiserStrategy", {
        from: deployer,
        contract: "LPOptimiserStrategy",
        args: [deployer],
        log: true,
        autoMine: true,
    });
};

export default func;
func.tags = ["LPOptimiserStrategy", ...MAIN_NETWORKS];
func.dependencies = [];
