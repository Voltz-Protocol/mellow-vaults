
import mustache from "mustache";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { task } from "hardhat/config";
import { combineVaults, setupVault, TRANSACTION_GAS_LIMITS } from "../deploy/0000_utils";
import { constants } from "ethers";

// deployment and parametrisation done via a gnosis safe multisig 
// by submitting a json file generated by this script to the transaction builder


interface voltzEndOfYearTemplateData {
    voltzVaults: {
        vaultTokens_: string[],
        owner_: string,
        marginEngine_: string,
        voltzVaultHelperSingleton_: string,
        initializeParams: VaultInitialParam
    }[];
}


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
    mainnet: {
        'aUSDC_v4': { // 31 Jan 23
            marginEngine: '0x8361bcb0109eA36eE8aE18Bf513F0625F4Ac183b',
            vaultInitialParam: {
                tickLower: -2640,
                tickUpper: 3540,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "300012536197026000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "75426743600639900",
                weight: "100",
            }
        },

        'cDAI_v4': { // 31 Mar 23
            marginEngine: '0x720BE99ee947292Be5d0e8Ef8D8687a7bC542f73',
            vaultInitialParam: {
                tickLower: -4080,
                tickUpper: 6900,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "499999762330392000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "95785677123315700",
                weight: "85",
            }
        },

        'aDAI_v4': { // 31 Mar 23
            marginEngine: '0xBb3583EFc060eD1CFFFFC06A28f6B5381031B601',
            vaultInitialParam: {
                tickLower: -2640,
                tickUpper: 3540,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "300009072791141000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "67940410361345600",
                weight: "15",
            }
        },

        'aUSDC_v5': { // 31 Mar 23
            marginEngine: '0x295891Cc72A230bcB2C2bEa3276Ac4D470495894',
            vaultInitialParam: {
                tickLower: -2640,
                tickUpper: 3540,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "300012536197026000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "75426743600639900",
                weight: "100",
            }
        },

        'rETH_v2': { // 31 Mar 23
            marginEngine: '0x5E885417968b65fFAC944a2fB975C101566B4aCa',
            vaultInitialParam: {
                tickLower: -2640,
                tickUpper: 3540,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "300001378599781000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "89131943783069800",
                weight: "15",
            }
        },

        'stETH_v2': { // 31 Mar 23
            marginEngine: '0x626Cf6B2fBF578653f7Fa5424962972161A79de7',
            vaultInitialParam: {
                tickLower: -2640,
                tickUpper: 3540,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "300002061763262000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "65059023285524400",
                weight: "85",
            }
        },

        'borrow_aUSDT_v1': { // 31 Mar 23
            marginEngine: '0xB8A339Cd4eD2e69725d95931a18482269E006FF1',
            vaultInitialParam: {
                tickLower: -2640,
                tickUpper: 3540,
                leverageWad: "50000000000000000000",
                marginMultiplierPostUnwindWad: "2000000000000000000",
            },
            vaultStrategyParam: {
                sigmaWad: "300001329882793000",
                maxPossibleLowerBoundWad: "10000000000000000000",
                proximityWad: "87322878356170500",
                weight: "100",
            }
        },
    }
}

task("voltz-end-of-year-deployments", "Voltz End of Year Deployments")
.setAction(
    async (taskArgs, hre) => {

        ////////////////////////////// SETUP //////////////////////////////

        const network = hre.network.name;
        // multisig json is only needed for mainnet deployments
        const networkSetup = (network === 'hardhat' || network === 'localhost') ? setup['mainnet'] : setup[network];

        const { deployments, getNamedAccounts } = hre;
        const { deploy, read, log } = deployments;
        const { voltzMultisig, usdc, dai, usdt, weth, mStrategyTreasury } =
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

        const voltzVaultHelper = (await hre.ethers.getContract("VoltzVaultHelper")).address;

        // Grab master strategy
        const masterStrategy = await hre.ethers.getContract(
            "LPOptimiserStrategy"
        );

        console.log("masterStrategy:", masterStrategy.address);

        // Set the deployment parameters

        // todo: bring the rest of the vaults once this one works
        
        // Mainnet 5
        const INSTANCE_NAME = `LPOptimiserStrategy-USDT_31Mar23_v2`; // save the proxy in the deployments folder using this name
        const voltzPools = ['borrow_aUSDT_v1'];
        const VAULT_CAP = 250000 * voltzPools.length; // 250,000 USDT
        const token = usdt;

        // Build the deployment parameters

        const tokens = [token].map((t) => t.toLowerCase()).sort();
        const vaultCap = (VAULT_CAP.toString()).concat(getTokenPadding(token));
        const voltzVaultParams = voltzPools.map((pool) => [
            voltzMultisig, // multisig (not eoa)
            networkSetup[pool].marginEngine,
            voltzVaultHelper,
            networkSetup[pool].vaultInitialParam
        ]);
        const vaultStrategyParams = voltzPools.map((pool) => networkSetup[pool].vaultStrategyParam);

        console.log("tokens", tokens);
        console.log("vaultCap", vaultCap);
        console.log("voltzVaultParams", voltzVaultParams);
        console.log("vaultStrategyParams", vaultStrategyParams);

        // Build the options
        const options = {
            limits: tokens.map((_: any) => constants.MaxUint256),
            strategyPerformanceTreasuryAddress: mStrategyTreasury,
            tokenLimitPerAddress: hre.ethers.constants.MaxUint256,
            tokenLimit: vaultCap,
            managementFee: "0",
            performanceFee: "0",
        };        

        console.log("Options:", options);

        // Get the next available NFT of the vaultRegistry
        const startNft =
        (await read("VaultRegistry", "vaultsCount")).toNumber() + 1;

        // Get the next N NFTs for Voltz vaults (each vault is represented as an nft)
        // within the vault registry, keep track of all the vaults deployed in mellow
        let voltzVaultNfts: number[] = [];
        for (let i = 0; i < voltzPools.length; i++) {
            voltzVaultNfts.push(startNft + i);
        }

        // Get the next NFT for ERC20 vault
        let erc20VaultNft = startNft + voltzPools.length;

        console.log("Voltz vault NFTs:", voltzVaultNfts);
        console.log("ERC20 vault NFT:", erc20VaultNft);


        // Setup the Voltz vaults
        // todo: convert setup vault into a multisig friendly setup

        for (let i = 0; i < voltzPools.length; i++) {


            // 


            // await setupVault(hre, voltzVaultNfts[i], "VoltzVaultGovernance", {
            //     createVaultArgs: [tokens, ...voltzVaultParams[i]],
            // });
        
        
        
        }

    }
)

