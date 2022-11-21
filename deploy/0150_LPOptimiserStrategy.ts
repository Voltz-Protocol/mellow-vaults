import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { combineVaults, MAIN_NETWORKS, setupVault } from "./0000_utils";
import { BigNumber, constants } from "ethers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const kind = "Deployment";
    const INSTANCE_NAME = `LPOptimiserStrategy-${kind}`;

    // Get the global deployment variables
    const { deployments, getNamedAccounts } = hre;
    const { deploy, read, log } = deployments;
    const { deployer, usdc, mStrategyTreasury, mStrategyAdmin } =
        await getNamedAccounts();

    // Setup the parameters of the deployment
    const VAULTS_TO_DEPLOY = 1;

    // Get the tokens 
    const tokens = [usdc].map((t) => t.toLowerCase()).sort();

    // Get the singleton Voltz vault helper
    const voltzVaultHelper = (await hre.ethers.getContract("VoltzVaultHelper"))
        .address;

    // Voltz vault parameters
    const voltzVaultParams = [[
        tokens, // tokens
        deployer, // 
        "0x9ea5Cfd876260eDadaB461f013c24092dDBD531d", // margin engine
        voltzVaultHelper, // voltz vault helper singleton
        {
            tickLower: 0,
            tickUpper: 60,
            leverageWad: BigNumber.from("10000000000000000000"),
            marginMultiplierPostUnwindWad: BigNumber.from(
                "2000000000000000000"
            ),
            lookbackWindowInSeconds: 1209600,
            estimatedAPYDecimalDeltaWad: BigNumber.from("0"),
        }, // initial parameters
    ]];

    const vaultStrategyParams = [
        {
            sigmaWad: "100000000000000000",
            maxPossibleLowerBoundWad: "1500000000000000000",
            proximityWad: "100000000000000000",
            weight: "1",
        },
    ];

    const options = {
        limits: tokens.map((_: any) =>  constants.MaxUint256),
        strategyPerformanceTreasuryAddress: mStrategyTreasury,
        tokenLimitPerAddress: hre.ethers.constants.MaxUint256,
        tokenLimit: "250000000000",
        managementFee: "0",
        performanceFee: "0",
    };

    // Deploy the master LP Optimiser Strategy
    await deploy("LPOptimiserStrategy", {
        from: deployer,
        contract: "LPOptimiserStrategy",
        args: [deployer],
        log: true,
        autoMine: true,
    });

    const masterStrategy = await hre.ethers.getContract(
        "LPOptimiserStrategy"
    );

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

    let voltzVaults: any[] = [];
    for (let i = 0; i < VAULTS_TO_DEPLOY; i++) {
        voltzVaults.push(await read(
            "VaultRegistry",
            "vaultForNft",
            voltzVaultNfts[i],
        ));
    }

    // Set the parameters for the strategy
    const params = [
        erc20Vault,
        voltzVaults,
        vaultStrategyParams,
        deployer,
    ];

    // Deploy instance of the LP optimiser strategy
    const strategyAddress = await masterStrategy.callStatic.createStrategy(
        ...params
    );
    await masterStrategy.createStrategy(...params);

    // Save it in deployments
    await deployments.save(INSTANCE_NAME, {
        abi: (await deployments.get("LPOptimiserStrategy")).abi,
        address: strategyAddress,
    });

    // Get the actual contracts
    const lPOptimiserStrategy = await hre.ethers.getContract(INSTANCE_NAME);

    // Combine the vaults and get the ERC20 root vault
    await combineVaults(
        hre,
        erc20VaultNft + 1,
        [erc20VaultNft].concat(voltzVaultNfts),
        strategyAddress,
        mStrategyTreasury,
        options
    );

    log("Transferring ownership to LPOptimiserStrategy");

    const ADMIN_ROLE =
        "0xf23ec0bb4210edd5cba85afd05127efcd2fc6a781bfed49188da1081670b22d8"; // keccak256("admin")
    const ADMIN_DELEGATE_ROLE =
        "0xc171260023d22a25a00a2789664c9334017843b831138c8ef03cc8897e5873d7"; // keccak256("admin_delegate")
    const OPERATOR_ROLE =
        "0x46a52cf33029de9f84853745a87af28464c80bf0346df1b32e205fc73319f622"; // keccak256("operator")

    // Transfer ownership to the strategy admin
    await lPOptimiserStrategy.grantRole(ADMIN_ROLE, mStrategyAdmin);
    await lPOptimiserStrategy.grantRole(ADMIN_DELEGATE_ROLE, mStrategyAdmin);
    await lPOptimiserStrategy.grantRole(ADMIN_DELEGATE_ROLE, deployer);
    await lPOptimiserStrategy.grantRole(OPERATOR_ROLE, mStrategyAdmin);
    await lPOptimiserStrategy.revokeRole(OPERATOR_ROLE, deployer);
    await lPOptimiserStrategy.revokeRole(ADMIN_DELEGATE_ROLE, deployer);
    await lPOptimiserStrategy.revokeRole(ADMIN_ROLE, deployer);
};

export default func;
func.tags = ["LPOptimiserStrategy", ...MAIN_NETWORKS];
func.dependencies = [
    "ProtocolGovernance",
    "VaultRegistry",
    "VoltzVaultGovernance",
    "ERC20VaultGovernance",
];
