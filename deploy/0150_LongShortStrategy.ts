import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import {
    combineVaults,
    MAIN_NETWORKS,
    setupVault,
} from "./0000_utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, read, log } = deployments;
    console.log('before')
    const {
        deployer,
        usdc,
        marginEngine,
        mStrategyTreasury,
        mStrategyAdmin,
    } = await getNamedAccounts();
    console.log('here')
    const tokens = [usdc].map((t) => t.toLowerCase()).sort();
    const startNft =
        (await read("VaultRegistry", "vaultsCount")).toNumber() + 1;
    console.log('after startNft')
    let voltzVaultNft = startNft;
    let erc20VaultNft = startNft + 1;

    await setupVault(hre, voltzVaultNft, "VoltzVaultGovernance", {
        createVaultArgs: [tokens, deployer, marginEngine, 0, 60],
    });
    console.log('succesfully set up voltz vault governance vault');
    await setupVault(hre, erc20VaultNft, "ERC20VaultGovernance", {
        createVaultArgs: [tokens, deployer],
    });
    console.log('succesfully set up erc20 vault governance vault');

    const erc20Vault = await read(
        "VaultRegistry",
        "vaultForNft",
        erc20VaultNft
    );
    const voltzVault = await read(
        "VaultRegistry",
        "vaultForNft",
        voltzVaultNft
    );

    let strategyDeployParams = await deploy("LongShortStrategy", {
        from: deployer,
        contract: "LongShortStrategy",
        args: [
            erc20Vault,
            voltzVault,
            deployer,
        ],
        log: true,
        autoMine: true,
    });
    console.log('succesfully deployed long short strategy');

    await combineVaults(
        hre,
        erc20VaultNft + 1,
        [erc20VaultNft, voltzVaultNft],
        strategyDeployParams.address,
        mStrategyTreasury
    );

    const longShortStrategy = await ethers.getContract("LongShortStrategy");
    console.log('get long short strat contract', longShortStrategy.address);

    log("Transferring ownership to longShortStrategy");

    const ADMIN_ROLE =
        "0xf23ec0bb4210edd5cba85afd05127efcd2fc6a781bfed49188da1081670b22d8"; // keccak256("admin")
    const ADMIN_DELEGATE_ROLE =
        "0xc171260023d22a25a00a2789664c9334017843b831138c8ef03cc8897e5873d7"; // keccak256("admin_delegate")
    const OPERATOR_ROLE =
        "0x46a52cf33029de9f84853745a87af28464c80bf0346df1b32e205fc73319f622"; // keccak256("operator")

    await longShortStrategy.grantRole(ADMIN_ROLE, mStrategyAdmin);
    await longShortStrategy.grantRole(ADMIN_DELEGATE_ROLE, mStrategyAdmin);
    await longShortStrategy.grantRole(ADMIN_DELEGATE_ROLE, deployer);
    await longShortStrategy.grantRole(OPERATOR_ROLE, mStrategyAdmin);
    await longShortStrategy.revokeRole(OPERATOR_ROLE, deployer);
    await longShortStrategy.revokeRole(ADMIN_DELEGATE_ROLE, deployer);
    await longShortStrategy.revokeRole(ADMIN_ROLE, deployer);
};

export default func;
func.tags = ["LongShortStrategy", ...MAIN_NETWORKS];
func.dependencies = [
    "ProtocolGovernance",
    "VaultRegistry",
    "VoltzVaultGovernance",
    "ERC20VaultGovernance",
];
