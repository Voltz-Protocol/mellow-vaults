import "hardhat-deploy";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import "@nomiclabs/hardhat-ethers";

import {
    combineVaults,
    setupVault,
    MAIN_NETWORKS,
    TRANSACTION_GAS_LIMITS,
} from "./0000_utils";

import { BigNumber, Contract } from "ethers";

const deployVoltzStrategy = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    let { address } = await deploy("LPOptimiserStrategyBase", {
        from: deployer,
        contract: "LPOptimiserStrategy",
        args: [deployer],
        log: true,
        autoMine: true,
    });

    return await hre.ethers.getContractAt("LPOptimiserStrategy", address);
};

const setupVoltzStrategy = async (
    marginEngines: string[],
    underlyingToken: string,
    hre: HardhatRuntimeEnvironment,
    baseStrategy: Contract,
    deploymentName: string
) => {
    const { deployments, getNamedAccounts } = hre;
    const { read, log, execute } = deployments;

    const { deployer, mStrategyTreasury, mStrategyAdmin } =
        await getNamedAccounts();

    const tokens = [underlyingToken].map((t) => t.toLowerCase()).sort();
    const startNft =
        (await read("VaultRegistry", "vaultsCount")).toNumber() + 1;

    const voltzVaultsCount = marginEngines.length;

    let erc20RootVaultNft = startNft + voltzVaultsCount + 1;

    const voltzVaultHelper = (await hre.ethers.getContract("VoltzVaultHelper"))
        .address;

    var nfts = [startNft];
    await setupVault(hre, nfts[0], "ERC20VaultGovernance", {
        createVaultArgs: [tokens, deployer],
    });

    // TODO: check
    for (var marginEngine of marginEngines) {
        nfts.push(nfts[nfts.length - 1] + 1);
        await setupVault(hre, nfts[nfts.length - 1], "VoltzVaultGovernance", {
            createVaultArgs: [
                tokens,
                deployer,
                marginEngine,
                voltzVaultHelper,
                {
                    tickLower: 0,
                    tickUpper: 60,
                    leverageWad: BigNumber.from("10000000000000000000"), // 10
                    marginMultiplierPostUnwindWad: BigNumber.from(
                        "2000000000000000000"
                    ), // 2
                    lookbackWindowInSeconds: 1209600, // 14 days
                    estimatedAPYDecimalDeltaWad: BigNumber.from("0"),
                },
            ],
        });
    }

    const erc20Vault = await read("VaultRegistry", "vaultForNft", nfts[0]);

    let voltzVaultsAddresses: string[] = [];
    for (var i = 1; i < nfts.length; ++i) {
        voltzVaultsAddresses.push(
            (await read("VaultRegistry", "vaultForNft", nfts[i])) as string
        );
    }

    let voltzVaultsParams: any[] = [];
    // TODO: check
    for (var i = 0; i < voltzVaultsCount; i++) {
        voltzVaultsParams.push({
            sigmaWad: "100000000000000000",
            maxPossibleLowerBoundWad: "1500000000000000000",
            proximityWad: "100000000000000000",
            weight: "1",
        });
    }

    const params = [
        erc20Vault,
        voltzVaultsAddresses,
        voltzVaultsParams,
        deployer,
    ];

    const address = await baseStrategy.callStatic.createStrategy(...params);
    await execute(
        "LPOptimiserStrategyBase",
        {
            from: deployer,
            log: true,
            autoMine: true,
            ...TRANSACTION_GAS_LIMITS,
        },
        "createStrategy",
        ...params
    );

    await deployments.save(deploymentName, {
        abi: (await deployments.get("LPOptimiserStrategyBase")).abi,
        address,
    });

    await combineVaults(
        hre,
        erc20RootVaultNft,
        nfts,
        address,
        mStrategyTreasury
    );

    log("Transferring ownership to LPOptimiserStrategy");

    const lPOptimiserStrategy = await hre.ethers.getContractAt(
        "LPOptimiserStrategy",
        address
    );
    const ADMIN_ROLE = await lPOptimiserStrategy.ADMIN_ROLE();
    const ADMIN_DELEGATE_ROLE = await lPOptimiserStrategy.ADMIN_DELEGATE_ROLE();

    await lPOptimiserStrategy.grantRole(ADMIN_ROLE, mStrategyAdmin);
    await lPOptimiserStrategy.grantRole(ADMIN_DELEGATE_ROLE, deployer);
    await lPOptimiserStrategy.grantRole(ADMIN_DELEGATE_ROLE, mStrategyAdmin);

    // const OPERATOR = await lPOptimiserStrategy.OPERATOR();
    // grant OPERATOR role for operator address:
    // await lPOptimiserStrategy.grantRole(OPERATOR, operator);
};

const buldVoltzStrategies: () => DeployFunction =
    () => async (hre: HardhatRuntimeEnvironment) => {
        const { getNamedAccounts } = hre;
        const { weth, usdc } = await getNamedAccounts();

        const baseStrategy = await deployVoltzStrategy(hre);

        // TODO: check
        await setupVoltzStrategy(
            [
                "0xD2807056Edb207b50d74aF8e9B4316Ae2422b300",
                "0x264cbc6C7BE32a06cBD967d38Ae1D07312e9A300",
            ],
            weth,
            hre,
            baseStrategy,
            "LPOptimiserStrategy_WETH"
        );
        await setupVoltzStrategy(
            [
                "0xc3847d49909Bf77463190197A560D2fA571Ac8Ec",
                "0xC0e6105B53622ea21937531557b27F21EAF57C17",
            ],
            usdc,
            hre,
            baseStrategy,
            "LPOptimiserStrategy_USDC"
        );
    };

const func = buldVoltzStrategies();

export default func;
func.tags = ["LPOptimiserStrategy", ...MAIN_NETWORKS];
func.dependencies = [
    "ProtocolGovernance",
    "VaultRegistry",
    "VoltzVaultGovernance",
    "ERC20VaultGovernance",
];
