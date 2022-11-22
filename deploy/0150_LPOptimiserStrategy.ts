import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";
import { combineVaults, MAIN_NETWORKS, setupVault, TRANSACTION_GAS_LIMITS } from "./0000_utils";
import { constants } from "ethers";
import { assert } from "console";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const kind = "DAI_31Dec22";
    const INSTANCE_NAME = `LPOptimiserStrategy-${kind}`;

    // Get the global deployment variables
    const { deployments, getNamedAccounts } = hre;
    const { deploy, read, log } = deployments;
    const { deployer, usdc, usdt, dai, weth, mStrategyTreasury } =
        await getNamedAccounts();

    // Setup the parameters of the deployment
    const VAULTS_TO_DEPLOY = 2;

    // Get the tokens 
    // const tokens = [usdc].map((t) => t.toLowerCase()).sort();
    // const tokens = [usdt].map((t) => t.toLowerCase()).sort();
    const tokens = [dai].map((t) => t.toLowerCase()).sort();
    // const tokens = [weth].map((t) => t.toLowerCase()).sort();

    log("Tokens:", tokens);
    log();

    // Get the singleton Voltz vault helper
    const voltzVaultHelper = (await hre.ethers.getContract("VoltzVaultHelper"))
        .address;

    log("Voltz Vault Helper Singleton:", voltzVaultHelper);
    log();

    const marginEngines: {[key: string]: string} = {
        'aUSDC_v3': '0xB785E7e71F099adA43222E1690Ee0bf701f80396',
        'borrow_aUSDC_v1': '0x33bA6A0B16750206195c777879Edd8706204154B',
        'borrow_cUSDT_v1': '0x111A75E91625142E85193b67B10E53Acf82838cD',
        'aDAI_v3': '0x0F533F6b042593C00C9F4A2AD28106F524FCEb94',
        'cDAI_v3': '0x75cDBD0e66Fdf4E2C80334F72B39628105fbeB20',

        "stETH_v1": "0x21F9151d6e06f834751b614C2Ff40Fc28811B235",
        "rETH_v1": "0xB1125ba5878cF3A843bE686c6c2486306f03E301",
        "aETH_v1": "0x6F7ccb0cfD6130E75e88e4c72168fD8A6926c943",
        "borrow_aETH_v1": "0x9b76B4d09229c339B049053F171BFB22cbE50092",
    }

    const vaultInitialParamDict: {[key: string]: {
        tickLower: number,
        tickUpper: number,
        leverageWad: string,
        marginMultiplierPostUnwindWad: string,
    }} = {
        'aUSDC_v3': {
            tickLower: -7620,
            tickUpper: 38820,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'borrow_aUSDC_v1': {
            tickLower: -12060,
            tickUpper: 300,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'borrow_cUSDT_v1': {
            tickLower: -15840,
            tickUpper: -7260,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'aDAI_v3': {
            tickLower: -7500,
            tickUpper: 2100,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'cDAI_v3': {
            tickLower: -7380,
            tickUpper: 7500,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },

        'stETH_v1': {
            tickLower: -19080,
            tickUpper: -17400,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'rETH_v1': {
            tickLower: -19020,
            tickUpper: -14160,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'aETH_v1': {
            tickLower: -9180,
            tickUpper: 11820,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
        'borrow_aETH_v1': {
            tickLower: -11940,
            tickUpper: -7620,
            leverageWad: "50000000000000000000",
            marginMultiplierPostUnwindWad: "2000000000000000000",
        },
    }

    const vaultStrategyParamDict: {[key: string]: {
        sigmaWad: string;
        maxPossibleLowerBoundWad: string;
        proximityWad: string;
        weight: string;
    }} = {
        'aUSDC_v3': {
            sigmaWad: "1059469974466510000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "14024637172194800",
            weight: "100",
        },
        'borrow_aUSDC_v1': {
            sigmaWad: "1183652801711350000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "27432723972240800",
            weight: "100",
        },
        'borrow_cUSDT_v1': {
            sigmaWad: "1403960951174310000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "77138374607844200",
            weight: "100",
        },
        'aDAI_v3': {
            sigmaWad: "654228686487046000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "10507487663232100",
            weight: "85",
        },
        'cDAI_v3': {
            sigmaWad: "807771568062656000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "99994889768137400",
            weight: "15",
        },

        'stETH_v1': {
            sigmaWad: "518332746913213000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "26886037100646100",
            weight: "52",
        },
        'rETH_v1': {
            sigmaWad: "1298028550120740000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "69087513217907900",
            weight: "18",
        },
        'aETH_v1': {
            sigmaWad: "1095114934880330000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "99669859268131800",
            weight: "15",
        },
        'borrow_aETH_v1': {
            sigmaWad: "579696599024643000",
            maxPossibleLowerBoundWad: "10000000000000000000",
            proximityWad: "99931443604533200",
            weight: "15",
        },
    }

    const VAULT_CAP = "500000000000000000000000";

    // Voltz vault parameters
    const voltzVaultParams = [[
        tokens, // tokens
        deployer, // 
        marginEngines['aDAI_v3'], // margin engine
        voltzVaultHelper, // voltz vault helper singleton
        vaultInitialParamDict['aDAI_v3'], // initial parameters
    ],
    [
        tokens, // tokens
        deployer, // 
        marginEngines['cDAI_v3'], // margin engine
        voltzVaultHelper, // voltz vault helper singleton
        vaultInitialParamDict['cDAI_v3'], // initial parameters
    ]];
    // const voltzVaultParams = [[
    //     tokens, // tokens
    //     deployer, // 
    //     marginEngines['stETH_v1'], // margin engine
    //     voltzVaultHelper, // voltz vault helper singleton
    //     vaultInitialParamDict['stETH_v1'], // initial parameters
    // ],
    // [
    //     tokens, // tokens
    //     deployer, // 
    //     marginEngines['rETH_v1'], // margin engine
    //     voltzVaultHelper, // voltz vault helper singleton
    //     vaultInitialParamDict['rETH_v1'], // initial parameters
    // ],
    // [
    //     tokens, // tokens
    //     deployer, // 
    //     marginEngines['aETH_v1'], // margin engine
    //     voltzVaultHelper, // voltz vault helper singleton
    //     vaultInitialParamDict['aETH_v1'], // initial parameters
    // ],
    // [
    //     tokens, // tokens
    //     deployer, // 
    //     marginEngines['borrow_aETH_v1'], // margin engine
    //     voltzVaultHelper, // voltz vault helper singleton
    //     vaultInitialParamDict['borrow_aETH_v1'], // initial parameters
    // ]];

    const vaultStrategyParams = [vaultStrategyParamDict['aDAI_v3'], vaultStrategyParamDict['cDAI_v3']];
    // const vaultStrategyParams = [vaultStrategyParamDict['stETH_v1'], vaultStrategyParamDict['rETH_v1'], vaultStrategyParamDict['aETH_v1'], vaultStrategyParamDict['borrow_aETH_v1']];

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

    // Deploy the master LP Optimiser Strategy
    // await deploy("LPOptimiserStrategy", {
    //     from: deployer,
    //     contract: "LPOptimiserStrategy",
    //     args: [deployer],
    //     log: true,
    //     autoMine: true,
    //     ...TRANSACTION_GAS_LIMITS
    // });

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

    // read the erc20 root vault contract
    const erc20RootVault = await read(
        "VaultRegistry",
        "vaultForNft",
        erc20VaultNft + 1
    );

    console.log("ERC20 Roout Vault:", erc20RootVault);
};

export default func;
func.tags = ["LPOptimiserStrategy", ...MAIN_NETWORKS];
func.dependencies = [
    // "ProtocolGovernance",
    // "VaultRegistry",
    // "VoltzVaultGovernance",
    // "ERC20VaultGovernance",
];
