import { ethers, getNamedAccounts } from "hardhat";
import { Contract, ContractFactory } from "@ethersproject/contracts";
import { Signer } from "@ethersproject/abstract-signer";

import { sleep, sortContractsByAddresses, encodeToBytes } from "./Helpers";
import {
    ERC20,
    ERC20Vault,
    ProtocolGovernance,
    VaultGovernance,
    LpIssuerGovernance,
    VaultRegistry,
    ProtocolGovernance_constructorArgs,
    VaultGovernance_constructorArgs,
    LpIssuerGovernance_constructorArgs,
    ProtocolGovernance_Params,
    ERC20Test_constructorArgs,
    VaultFactory,
    VaultType,
    VaultGovernance_InternalParams,
    IVaultGovernance,
    Vault,
    IGatewayVault,
    SubVaultType,
} from "./Types";
import { BigNumber } from "@ethersproject/bignumber";
import { Address } from "hardhat-deploy/dist/types";

export async function deployERC20Tokens(length: number): Promise<ERC20[]> {
    let tokens: ERC20[] = [];
    let token_constructorArgs: ERC20Test_constructorArgs[] = [];
    const Contract: ContractFactory = await ethers.getContractFactory(
        "ERC20Test"
    );

    for (let i = 0; i < length; ++i) {
        token_constructorArgs.push({
            name: "Test Token",
            symbol: `TEST_${i}`,
        });
    }

    for (let i: number = 0; i < length; ++i) {
        const contract: ERC20 = await Contract.deploy(
            token_constructorArgs[i].name + `_${i.toString()}`,
            token_constructorArgs[i].symbol
        );
        await contract.deployed();
        tokens.push(contract);
    }
    return tokens;
}

export const deployProtocolGovernance = async (options: {
    constructorArgs?: ProtocolGovernance_constructorArgs;
    initializerArgs?: {
        params: ProtocolGovernance_Params;
    };
    adminSigner: Signer;
}) => {
    // defaults<
    const constructorArgs: ProtocolGovernance_constructorArgs =
        options.constructorArgs ?? {
            admin: await options.adminSigner.getAddress(),
        };
    // />
    const contractFactory: ContractFactory = await ethers.getContractFactory(
        "ProtocolGovernance"
    );
    const contract: ProtocolGovernance = await contractFactory.deploy(
        constructorArgs.admin
    );

    if (options?.initializerArgs) {
        await contract
            .connect(options!.adminSigner)
            .setPendingParams(options.initializerArgs.params);
        await sleep(Number(options.initializerArgs.params.governanceDelay));
        await contract.connect(options!.adminSigner).commitParams();
    }
    return contract;
};

export const deployVaultRegistryAndProtocolGovernance = async (options: {
    name?: string;
    symbol?: string;
    adminSigner: Signer;
    treasury: Address;
}) => {
    const protocolGovernance = await deployProtocolGovernance({
        adminSigner: options.adminSigner,
    });
    const VaultRegistryFactory: ContractFactory =
        await ethers.getContractFactory("VaultRegistry");
    let contract: VaultRegistry = await VaultRegistryFactory.deploy(
        options.name ?? "Test Vault Registry",
        options.symbol ?? "TVR",
        protocolGovernance.address
    );
    await contract.deployed();
    await protocolGovernance.connect(options.adminSigner).setPendingParams({
        permissionless: true,
        maxTokensPerVault: BigNumber.from(10),
        governanceDelay: BigNumber.from(60 * 60 * 24), // 1 day
        strategyPerformanceFee: BigNumber.from(10 * 10 ** 9),
        protocolPerformanceFee: BigNumber.from(2 * 10 ** 9),
        protocolExitFee: BigNumber.from(10 ** 9),
        protocolTreasury: options.treasury,
        vaultRegistry: contract.address,
    });
    await sleep(Number(await protocolGovernance.governanceDelay()));
    await protocolGovernance.connect(options.adminSigner).commitParams();
    return {
        vaultRegistry: contract,
        protocolGovernance: protocolGovernance,
    };
};

export async function deployVaultFactory(options: {
    vaultGovernance: IVaultGovernance;
    vaultType: VaultType;
}): Promise<VaultFactory> {
    const Contract = await ethers.getContractFactory(`${options.vaultType}Factory`);
    const contract = await Contract.deploy(options.vaultGovernance);
    return contract;
}

export const deployVaultGovernance = async (options: {
    constructorArgs: VaultGovernance_constructorArgs;
    adminSigner: Signer;
    treasury: Address;
    vaultType: VaultType;
}) => {
    let contract: Contract;
    const Contract = await ethers.getContractFactory(
        `${options.vaultType}Governance`
    );
    contract = await Contract.deploy(options.constructorArgs.params);
    await contract.deployed();
    return contract;
};

export async function deployVaultGovernanceSystem(options: {
    adminSigner: Signer;
    treasury: Address;
    vaultType: VaultType;
}): Promise<{
    vaultFactory: VaultFactory;
    vaultRegistry: VaultRegistry;
    protocolGovernance: ProtocolGovernance;
    vaultGovernance: VaultGovernance;
}> {
    const { vaultRegistry, protocolGovernance } =
        await deployVaultRegistryAndProtocolGovernance({
            name: "VaultRegistry",
            symbol: "MVR",
            adminSigner: options.adminSigner,
            treasury: options.treasury,
        });

    let params: VaultGovernance_InternalParams = {
        protocolGovernance: protocolGovernance.address,
        registry: vaultRegistry.address,
    };
    const contractFactory: ContractFactory = await ethers.getContractFactory(
        `${options.vaultType}Governance`
    );
    let vaultGovernance: VaultGovernance;
    switch (options.vaultType) {
        case "AaveVault": {
            const { aaveLendingPool } = await getNamedAccounts();
            vaultGovernance = await contractFactory.deploy(params, {
                lendingPool: aaveLendingPool,
            });
            break;
        }
        case "UniV3Vault": {
            const { uniswapV3PositionManager } = await getNamedAccounts();
            vaultGovernance = await contractFactory.deploy(params, {
                positionManager: uniswapV3PositionManager,
            });
            break;
        }
        case "GatewayVault": {
            vaultGovernance = await contractFactory.deploy(params);
            break;
        }
        default: {
            vaultGovernance = await contractFactory.deploy(params);
            break;
        }
    }
    await vaultGovernance.deployed();
    const vaultFactory = await deployVaultFactory({
        vaultType: options.vaultType,
        vaultGovernance: vaultGovernance.address,
    });
    await vaultGovernance.initialize(vaultFactory.address);
    await vaultGovernance
        .connect(options.adminSigner)
        .stageInternalParams(params);
    await sleep(Number(await protocolGovernance.governanceDelay()));
    await vaultGovernance.connect(options.adminSigner).commitInternalParams();
    return {
        vaultFactory: vaultFactory,
        vaultRegistry: vaultRegistry,
        protocolGovernance: protocolGovernance,
        vaultGovernance: vaultGovernance,
    };
}

export async function deployTestVaultGovernance(options: {
    adminSigner: Signer;
    treasury: Address;
    vaultType: VaultType;
}): Promise<{
    vaultFactory: VaultFactory;
    vaultRegistry: VaultRegistry;
    protocolGovernance: ProtocolGovernance;
    vaultGovernance: VaultGovernance;
}> {
    const { vaultRegistry, protocolGovernance } =
        await deployVaultRegistryAndProtocolGovernance({
            name: "VaultRegistry",
            symbol: "MVR",
            adminSigner: options.adminSigner,
            treasury: options.treasury,
        });

    let contractFactory: ContractFactory = await ethers.getContractFactory(
        "TestVaultGovernance"
    );
    let contract = await contractFactory.deploy({
        protocolGovernance: protocolGovernance.address,
        registry: vaultRegistry.address,
        factory: ethers.constants.AddressZero,
    });

    let vaultFactory = await deployVaultFactory({
        vaultGovernance: contract.address,
        vaultType: "ERC20Vault",
    });

    await contract.stageInternalParams({
        protocolGovernance: protocolGovernance.address,
        registry: vaultRegistry.address,
        factory: vaultFactory.address,
    });

    await sleep(Number(await protocolGovernance.governanceDelay()));
    await contract.commitInternalParams();

    return {
        vaultFactory: vaultFactory,
        vaultRegistry: vaultRegistry,
        protocolGovernance: protocolGovernance,
        vaultGovernance: contract,
    };
}

export async function deployVaultRegistry(options: {
    name: string;
    symbol: string;
    protocolGovernance: ProtocolGovernance;
}): Promise<Contract> {
    let Contract = await ethers.getContractFactory("VaultRegistry");
    let contract = await Contract.deploy(
        options.name,
        options.symbol,
        options.protocolGovernance.address
    );
    await contract.deployed();
    return contract;
}

export async function deployCommonLibrary(): Promise<Contract> {
    const Library: ContractFactory = await ethers.getContractFactory("Common");
    const library: Contract = await Library.deploy();
    await library.deployed();
    return library;
}

export async function deployCommonLibraryTest(): Promise<Contract> {
    const CommonTest: ContractFactory = await ethers.getContractFactory(
        "CommonTest"
    );
    const commonTest: Contract = await CommonTest.deploy();
    await commonTest.deployed();
    return commonTest;
}

export const deployLpIssuerGovernance = async (options: {
    constructorArgs?: LpIssuerGovernance_constructorArgs;
    adminSigner?: Signer;
    treasury?: Address;
}) => {
    // defaults<

    let deployer: Signer;
    let treasury: Signer;

    [deployer, treasury] = await ethers.getSigners();

    const {
        vaultFactory: vaultFactory,
        vaultRegistry: vaultRegistry,
        protocolGovernance: protocolGovernance,
        vaultGovernance: vaultGovernance,
    } = await deployVaultGovernanceSystem({
        adminSigner: deployer,
        treasury: await treasury.getAddress(),
        vaultType: "ERC20Vault",
    });

    const constructorArgs: LpIssuerGovernance_constructorArgs =
        options.constructorArgs ?? {
            registry: vaultRegistry.address,
            protocolGovernance: protocolGovernance.address,
            factory: vaultFactory.address,
        };
    // />
    const Contract: ContractFactory = await ethers.getContractFactory(
        "LpIssuerGovernance"
    );

    let contract: LpIssuerGovernance = await Contract.deploy(constructorArgs);
    await contract.deployed();
    return {
        LpIssuerGovernance: contract,
        protocolGovernance: protocolGovernance,
        vaultRegistry: vaultRegistry,
        vaultFactory: vaultFactory,
    };
};

export async function deploySubVaultSystem(options: {
    tokensCount: number;
    adminSigner: Signer;
    treasury: Address;
    vaultOwner: Address;
    vaultType: SubVaultType;
}): Promise<{
    vaultFactory: VaultFactory;
    vaultRegistry: VaultRegistry;
    protocolGovernance: ProtocolGovernance;
    vaultGovernance: VaultGovernance;
    tokens: ERC20[];
    vault: Vault;
    nft: number;
}> {
    const { vaultRegistry, protocolGovernance, vaultFactory, vaultGovernance } =
        await deployVaultGovernanceSystem({
            adminSigner: options.adminSigner,
            treasury: options.treasury,
            vaultType: options.vaultType,
        });
    const vaultTokens: ERC20[] = sortContractsByAddresses(
        await deployERC20Tokens(options.tokensCount)
    );
    await protocolGovernance
        .connect(options.adminSigner)
        .setPendingVaultGovernancesAdd([vaultGovernance.address]);
    await sleep(Number(await protocolGovernance.governanceDelay()));
    await protocolGovernance
        .connect(options.adminSigner)
        .commitVaultGovernancesAdd();
    let optionsBytes: any = [];
    if (options.vaultType === "UniV3Vault") {
        optionsBytes = encodeToBytes(["uint"], [1]);
    }
    const { vault, nft } = await vaultGovernance.callStatic.deployVault(
        vaultTokens.map((token) => token.address),
        optionsBytes,
        options.vaultOwner
    );
    await vaultGovernance.deployVault(
        vaultTokens.map((token) => token.address),
        optionsBytes,
        options.vaultOwner
    );
    const vaultContract: Vault = await ethers.getContractAt(
        options.vaultType,
        vault
    );
    await vaultGovernance
        .connect(options.adminSigner)
        .stageDelayedStrategyParams(nft, [options.treasury]);
    await sleep(Number(await protocolGovernance.governanceDelay()));
    await vaultGovernance
        .connect(options.adminSigner)
        .commitDelayedStrategyParams(BigNumber.from(nft));
    return {
        vaultFactory: vaultFactory,
        vaultRegistry: vaultRegistry,
        protocolGovernance: protocolGovernance,
        vaultGovernance: vaultGovernance,
        tokens: vaultTokens,
        vault: vaultContract,
        nft: nft,
    };
}

export async function deploySubVaultXGatewayVaultSystem(options: {
    adminSigner: Signer;
    vaultOwnerSigner: Signer;
    treasury: Address;
    strategy: Address;
    vaultType: SubVaultType;
}): Promise<{
    vaultFactory: VaultFactory;
    vaultRegistry: VaultRegistry;
    protocolGovernance: ProtocolGovernance;
    vaultGovernance: VaultGovernance;
    tokens: ERC20[];
    vault: ERC20Vault;
    nft: number;
    gatewayVaultGovernance: VaultGovernance;
    gatewayVaultFactory: VaultFactory;
    gatewayVault: Vault;
    gatewayNft: number;
}> {
    const {
        vaultFactory,
        vaultRegistry,
        protocolGovernance,
        vaultGovernance,
        tokens,
        vault,
        nft,
    } = await deploySubVaultSystem({
        tokensCount: 2,
        adminSigner: options.adminSigner,
        treasury: options.treasury,
        vaultOwner: await options.vaultOwnerSigner.getAddress(),
        vaultType: options.vaultType,
    });
    let args: VaultGovernance_constructorArgs = {
        params: {
            protocolGovernance: protocolGovernance.address,
            registry: vaultRegistry.address,
        },
    };
    const gatewayVaultGovernance = await deployVaultGovernance({
        constructorArgs: args,
        adminSigner: options.adminSigner,
        treasury: options.treasury,
        vaultType: "GatewayVault",
    });
    await protocolGovernance
        .connect(options.adminSigner)
        .setPendingVaultGovernancesAdd([gatewayVaultGovernance.address]);
    await sleep(Number(await protocolGovernance.governanceDelay()));
    await protocolGovernance
        .connect(options.adminSigner)
        .commitVaultGovernancesAdd();
    const gatewayVaultFactory = await deployVaultFactory({
        vaultGovernance: gatewayVaultGovernance.address,
        vaultType: "GatewayVault",
    });
    await gatewayVaultGovernance
        .connect(options.adminSigner)
        .stageInternalParams(args.params);
    await sleep(Number(await protocolGovernance.governanceDelay()));
    await gatewayVaultGovernance
        .connect(options.adminSigner)
        .commitInternalParams();
    await gatewayVaultGovernance.initialize(gatewayVaultFactory.address);
    await vaultRegistry.approve(
        gatewayVaultGovernance.address,
        BigNumber.from(nft)
    );
    let gatewayVaultAddress: IGatewayVault;
    let gatewayNft: number = 0;
    const deployArgs = [
        [], // Gateway vault has no tokens
        encodeToBytes(["uint256[]"], [[nft]]),
        options.strategy,
    ];
    let response = await gatewayVaultGovernance.callStatic.deployVault(
        ...deployArgs
    );
    gatewayVaultAddress = response.vault;
    gatewayNft = response.nft;
    await gatewayVaultGovernance.deployVault(...deployArgs);
    const gatewayVault: Vault = await ethers.getContractAt(
        "GatewayVault",
        gatewayVaultAddress
    );
    return {
        vaultFactory,
        vaultRegistry,
        protocolGovernance,
        vaultGovernance,
        tokens,
        vault,
        nft,
        gatewayVaultGovernance,
        gatewayVaultFactory,
        gatewayVault,
        gatewayNft,
    };
}
