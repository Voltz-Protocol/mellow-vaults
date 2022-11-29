import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { combineVaults, setupVault, TRANSACTION_GAS_LIMITS } from "./0000_utils";
import { constants } from "ethers";
import { assert } from "console";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const SKIP = true;
    if (SKIP) {
        return;
    }
    
    const kind = "USDC_31Dec22";
    const INSTANCE_NAME = `LPOptimiserStrategy-${kind}`;

    // Get the global deployment variables
    const { deployments, getNamedAccounts } = hre;
    const { deploy, read, log } = deployments;
    const { deployer, usdc, mStrategyTreasury } =
        await getNamedAccounts();

    // Setup the parameters of the deployment
    const VAULTS_TO_DEPLOY = 0;

    // Get the tokens 
    const tokens = [usdc].map((t) => t.toLowerCase()).sort();

    log("Tokens:", tokens);
    log();

    // Get the singleton Voltz vault helper
    const voltzVaultHelper = (await hre.ethers.getContract("VoltzVaultHelper"))
        .address;

    log("Voltz Vault Helper Singleton:", voltzVaultHelper);
    log();

    const marginEngines: {[key: string]: string} = {
        // 'aUSDC_v3': '0xB785E7e71F099adA43222E1690Ee0bf701f80396',
    }

    const vaultInitialParamDict: {[key: string]: {
        tickLower: number,
        tickUpper: number,
        leverageWad: string,
        marginMultiplierPostUnwindWad: string,
    }} = {
        // 'aUSDC_v3': {
        //     tickLower: -7620,
        //     tickUpper: 38820,
        //     leverageWad: "50000000000000000000",
        //     marginMultiplierPostUnwindWad: "2000000000000000000",
        // },
    }

    const vaultStrategyParamDict: {[key: string]: {
        sigmaWad: string;
        maxPossibleLowerBoundWad: string;
        proximityWad: string;
        weight: string;
    }} = {
        // 'aUSDC_v3': {
        //     sigmaWad: "1059469974466510000",
        //     maxPossibleLowerBoundWad: "10000000000000000000",
        //     proximityWad: "14024637172194800",
        //     weight: "100",
        // },
    }

    const VAULT_CAP = "250000000000";

    const DEPLOY_MASTER_STRATEGY = false;

    // Voltz vault parameters
    const voltzVaultParams = [[
        tokens, // tokens
        deployer, // 
        marginEngines['aUSDC_v3'], // margin engine
        voltzVaultHelper, // voltz vault helper singleton
        vaultInitialParamDict['aUSDC_v3'], // initial parameters
    ]];

    const vaultStrategyParams = [vaultStrategyParamDict['aUSDC_v3']];

    assert(voltzVaultParams.length === VAULTS_TO_DEPLOY, "length doesn't match");
    assert(vaultStrategyParams.length === VAULTS_TO_DEPLOY, "length doesn't match");

    log("Voltz vault params:", voltzVaultParams);
    log();

    log("Voltz vault strategy params:", vaultStrategyParams);
    log();

    const options = {
        limits: tokens.map((_: any) =>  constants.MaxUint256),
        strategyPerformanceTreasuryAddress: mStrategyTreasury,
        tokenLimitPerAddress: hre.ethers.constants.MaxUint256,
        tokenLimit: VAULT_CAP,
        managementFee: "0",
        performanceFee: "0",
    };

    log("Options:", options);
    log();

    if (DEPLOY_MASTER_STRATEGY) {
        // Deploy the master LP Optimiser Strategy
        await deploy("LPOptimiserStrategy", {
            from: deployer,
            contract: "LPOptimiserStrategy",
            args: [deployer],
            log: true,
            autoMine: true,
            ...TRANSACTION_GAS_LIMITS
        });
    }

    const masterStrategy = await hre.ethers.getContract(
        "LPOptimiserStrategy"
    );

    log("Master strategy:", masterStrategy.address);
    log();

    // Get the next available NFT of the vaultRegistry
    const startNft =
        (await read("VaultRegistry", "vaultsCount")).toNumber() + 1;

    // Get the next N NFTs for Voltz vaults
    let voltzVaultNfts: number[] = [];
    for (let i = 0; i < VAULTS_TO_DEPLOY; i++) {
        voltzVaultNfts.push(startNft + i);
    }

    // Get the next NFT for ERC20 vault
    let erc20VaultNft = startNft + VAULTS_TO_DEPLOY;

    log("Voltz vault NFTs:", voltzVaultNfts);
    log("ERC20 vault NFT:", erc20VaultNft);
    log();

    // Setup the Voltz vaults
    for (let i = 0; i < VAULTS_TO_DEPLOY; i++) {
        await setupVault(hre, voltzVaultNfts[i], "VoltzVaultGovernance", {
            createVaultArgs: voltzVaultParams[i],
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
    for (let i = 0; i < VAULTS_TO_DEPLOY; i++) {
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
