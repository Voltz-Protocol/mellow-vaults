import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { combineVaults, setupVault, TRANSACTION_GAS_LIMITS } from "./0000_utils";
import { constants } from "ethers";

type VaultInitialParam = {
    tickLower: number,
    tickUpper: number,
    leverageWad: string,
    marginMultiplierPostUnwindWad: string,
};

type VaultStrategyParam = {
    sigmaWad: string;
    maxPossibleLowerBoundWad: string;
    proximityWad: string;
    weight: string;
};

type VaultSetup = {
    marginEngine: string;
    vaultInitialParam: VaultInitialParam;
    vaultStrategyParam: VaultStrategyParam;
}

type NetworkSetup = { [key: string]: VaultSetup };

const setup: { [key: string]: NetworkSetup } = {
    goerli: {
        'cETH': {
            marginEngine: '0xdC0a874dD8E4038Dd59132B95E7eA8E0B5C8bbCa',
            vaultInitialParam: {
                tickLower: -7620,
                tickUpper: 38820,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "1059469974466510000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "14024637172194800",
                weight: "100",
            }
        },
        'cETH_v2': {
            marginEngine: '0xbacAeF4e088d3490C1F4200afa824C624238c7c8',
            vaultInitialParam: {
                tickLower: -7620,
                tickUpper: 38820,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "1059469974466510000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "14024637172194800",
                weight: "100",
            }
        },
        'cETH_v3': {
            marginEngine: '0xf1e61ac3ede1e5944257aA2F7ce28d8be4114078',
            vaultInitialParam: {
                tickLower: -7620,
                tickUpper: 38820,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "1059469974466510000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "14024637172194800",
                weight: "100",
            }
        },
        'cUSDC': {
            marginEngine: '0x522555dC12C62aaCF5aDB1104b6D24AC184aA143',
            vaultInitialParam: {
                tickLower: -7620,
                tickUpper: 38820,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "1059469974466510000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "14024637172194800",
                weight: "100",
            }
        },
        'borrow_cUSDT': {
            marginEngine: '0xe326De8BC0826ED524e93Be142F7525B53FD6D96',
            vaultInitialParam: {
                tickLower: -7620,
                tickUpper: 38820,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "1059469974466510000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "14024637172194800",
                weight: "100",
            }
        }
    },

    mainnet: {
        'aUSDC_v4': { // 31 Jan 23
            marginEngine: '0x8361bcb0109eA36eE8aE18Bf513F0625F4Ac183b',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },

        'cDAI_v4': { // 31 Mar 23
            marginEngine: '0x720BE99ee947292Be5d0e8Ef8D8687a7bC542f73',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },

        'aDAI_v4': { // 31 Mar 23
            marginEngine: '0xBb3583EFc060eD1CFFFFC06A28f6B5381031B601',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },

        'aUSDC_v5': { // 31 Mar 23
            marginEngine: '0x295891Cc72A230bcB2C2bEa3276Ac4D470495894',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },

        'rETH_v2': { // 31 Mar 23
            marginEngine: '0x5E885417968b65fFAC944a2fB975C101566B4aCa',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },

        'stETH_v2': { // 31 Mar 23
            marginEngine: '0x626Cf6B2fBF578653f7Fa5424962972161A79de7',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },

        'borrow_aUSDT_v1': { // 31 Mar 23
            marginEngine: '0xB8A339Cd4eD2e69725d95931a18482269E006FF1',
            vaultInitialParam: {
                tickLower: -60,
                tickUpper: 60,
                leverageWad: "0",
                marginMultiplierPostUnwindWad: "0",
            },
            vaultStrategyParam: {
                sigmaWad: "0",
                maxPossibleLowerBoundWad: "0",
                proximityWad: "0",
                weight: "100",
            }
        },
    }
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const network = hre.network.name;
    const networkSetup = (network === 'hardhat' || network === 'localhost') ? setup['mainnet'] : setup[network];

    const SKIP = true;
    if (SKIP) {
        return;
    }

    // Get the global deployment variables
    const { deployments, getNamedAccounts } = hre;
    const { deploy, read, log } = deployments;
    const { deployer, usdc, dai, usdt, weth, mStrategyTreasury } =
        await getNamedAccounts();
    
    const getTokenPadding = (token: string): string => {
        switch (token) {
            case usdc: {
                return "000000";
            }
            case usdt: {
                return "000000";
            }
            case weth: {
                return "000000000000000000";
            }
            case dai: {
                return "000000000000000000";
            }
            default: {
                throw new Error("Invalid token");
            }
        }
    }

    const voltzVaultHelper = (await hre.ethers.getContract("VoltzVaultHelper"))
        .address;

    console.log("voltzVaultHelper", voltzVaultHelper);

    // Deploy the master LP Optimiser Strategy if flag set to true
    const DEPLOY_MASTER_STRATEGY = false;

    if (DEPLOY_MASTER_STRATEGY) {
        await deploy("LPOptimiserStrategy", {
            from: deployer,
            contract: "LPOptimiserStrategy",
            args: [deployer],
            log: true,
            autoMine: true,
            ...TRANSACTION_GAS_LIMITS
        });
    }

    // Grab master strategy
    const masterStrategy = await hre.ethers.getContract(
        "LPOptimiserStrategy"
    );

    console.log("masterStrategy:", masterStrategy.address);

    // Set the deployment parameters

    // // Goerli
    // const INSTANCE_NAME = `LPOptimiserStrategy-ETH_7Jan23`;
    // const voltzPools = ['cETH_v3'];
    // const VAULT_CAP = 250000 * voltzPools.length;
    // const token = weth;

    // // Mainnet 1
    // const INSTANCE_NAME = `LPOptimiserStrategy-USDC_31Jan23_v2`;
    // const voltzPools = ['aUSDC_v4'];
    // const VAULT_CAP = 250000 * voltzPools.length; // 250,000 USDC
    // const token = usdc;

    // // Mainnet 2
    // const INSTANCE_NAME = `LPOptimiserStrategy-USDC_31Mar23_v2`;
    // const voltzPools = ['aUSDC_v5'];
    // const VAULT_CAP = 250000 * voltzPools.length; // 250,000 USDC
    // const token = usdc;

    // // Mainnet 3
    // const INSTANCE_NAME = `LPOptimiserStrategy-DAI_31Mar23_v2`;
    // const voltzPools = ['cDAI_v4', 'aDAI_v4'];
    // const VAULT_CAP = 250000 * voltzPools.length; // 500,000 DAI
    // const token = dai;

    // // Mainnet 4
    // const INSTANCE_NAME = `LPOptimiserStrategy-ETH_31Mar23_v2`;
    // const voltzPools = ['rETH_v2', 'stETH_v2'];
    // const VAULT_CAP = 250 * voltzPools.length; // 500 ETH
    // const token = weth;

    // Mainnet 5
    const INSTANCE_NAME = `LPOptimiserStrategy-USDT_31Mar23_v2`;
    const voltzPools = ['borrow_aUSDT_v1'];
    const VAULT_CAP = 250000 * voltzPools.length; // 250,000 USDT
    const token = usdt;

    // Build the deployment parameters

    const tokens = [token].map((t) => t.toLowerCase()).sort();
    const vaultCap = (VAULT_CAP.toString()).concat(getTokenPadding(token));

    const voltzVaultParams = voltzPools.map((pool) => [
        deployer,
        networkSetup[pool].marginEngine,
        voltzVaultHelper,
        networkSetup[pool].vaultInitialParam
    ]);
    const vaultStrategyParams = voltzPools.map((pool) => networkSetup[pool].vaultStrategyParam);

    // Build the options
    const options = {
        limits: tokens.map((_: any) => constants.MaxUint256),
        strategyPerformanceTreasuryAddress: mStrategyTreasury,
        tokenLimitPerAddress: hre.ethers.constants.MaxUint256,
        tokenLimit: vaultCap,
        managementFee: "0",
        performanceFee: "0",
    };

    log("Options:", options);
    log();

    // Get the next available NFT of the vaultRegistry
    const startNft =
        (await read("VaultRegistry", "vaultsCount")).toNumber() + 1;

    // Get the next N NFTs for Voltz vaults
    let voltzVaultNfts: number[] = [];
    for (let i = 0; i < voltzPools.length; i++) {
        voltzVaultNfts.push(startNft + i);
    }

    // Get the next NFT for ERC20 vault
    let erc20VaultNft = startNft + voltzPools.length;

    log("Voltz vault NFTs:", voltzVaultNfts);
    log("ERC20 vault NFT:", erc20VaultNft);
    log();

    // Setup the Voltz vaults
    for (let i = 0; i < voltzPools.length; i++) {
        await setupVault(hre, voltzVaultNfts[i], "VoltzVaultGovernance", {
            createVaultArgs: [tokens, ...voltzVaultParams[i]],
        });
    }

    // Setup the ERC20 vault
    await setupVault(hre, erc20VaultNft, "ERC20VaultGovernance", {
        createVaultArgs: [tokens, deployer],
    });

    // read the vault contracts
    const erc20Vault = await read(
        "VaultRegistry",
        "vaultForNft",
        erc20VaultNft
    );

    log("ERC20 vault:", erc20Vault);

    let voltzVaults: any[] = [];
    for (let i = 0; i < voltzPools.length; i++) {
        voltzVaults.push(await read(
            "VaultRegistry",
            "vaultForNft",
            voltzVaultNfts[i],
        ));
    }

    log("Voltz vaults:", voltzVaults);
    log();

    // Set the parameters for the strategy
    const params = [
        erc20Vault,
        voltzVaults,
        vaultStrategyParams,
        deployer,
    ];

    log("Strategy constructor params:", params);
    log();

    // Deploy instance of the LP optimiser strategy
    const strategyAddress = await masterStrategy.callStatic.createStrategy(
        ...params
    );
    log("Strategy address:", strategyAddress);


    const tmpOverrides = {
        ...TRANSACTION_GAS_LIMITS,
        gasLimit: "2000000",
    }
    const tx = await masterStrategy.createStrategy(...params, tmpOverrides);
    await tx.wait();

    log("Strategy deployed");
    log();

    // Save it in deployments
    await hre.deployments.save(INSTANCE_NAME, {
        abi: (await deployments.get("LPOptimiserStrategy")).abi,
        address: strategyAddress,
    });

    // Get the actual contracts
    const lPOptimiserStrategy = await hre.ethers.getContractAt(
        "LPOptimiserStrategy",
        strategyAddress
    );

    log("Strategy picked up:", lPOptimiserStrategy.address);
    log();

    const erc20RootVaultGovernance = await hre.ethers.getContract(
        "ERC20RootVaultGovernance"
    );

    log("Approving nfts...");
    for (let nft of [erc20VaultNft].concat(voltzVaultNfts)) {
        await deployments.execute(
            "VaultRegistry",
            {
                from: deployer,
                autoMine: true,
                ...TRANSACTION_GAS_LIMITS,
            },
            "approve(address,uint256)",
            erc20RootVaultGovernance.address,
            nft
        );
    }
    log("Approved nfts!..");

    // Combine the vaults and get the ERC20 root vault
    await combineVaults(
        hre,
        erc20VaultNft + 1,
        [erc20VaultNft].concat(voltzVaultNfts),
        strategyAddress,
        mStrategyTreasury,
        options
    );

    // Read the erc20 root vault contract
    const erc20RootVault = await read(
        "VaultRegistry",
        "vaultForNft",
        erc20VaultNft + 1
    );

    console.log("ERC20 Roout Vault:", erc20RootVault);
};

export default func;
func.tags = ["MainnetLPOptimiserStrategy"];
func.dependencies = [];
