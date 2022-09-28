// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./IIntegrationVault.sol";
import "../external/voltz/IMarginEngine.sol";
import "../external/voltz/IVAMM.sol";
import "../external/voltz/IPeriphery.sol";
import "../external/voltz/rate_oracles/IRateOracle.sol";

interface IVoltzVault is IIntegrationVault {
    struct TickRange {
        int24 tickLower;
        int24 tickUpper;
    }

    struct InitializeParams {
        int24 tickLower;
        int24 tickUpper;
        uint256 leverageWad;
        uint256 marginMultiplierPostUnwindWad;
        uint256 lookbackWindowInSeconds;
        uint256 estimatedAPYUnitDeltaWad;
    }

    // -------------------  EXTERNAL, MUTATING  -------------------

    /// @notice Initializes a new contract.
    /// @dev Can only be initialized by vault governance
    /// @param nft_ NFT of the vault in the VaultRegistry
    /// @param vaultTokens_ ERC20 tokens that will be managed by this Vault
    /// @param marginEngine_ the underlying margin engine of the Voltz pool
    function initialize(
        uint256 nft_,
        address[] memory vaultTokens_,
        address marginEngine_,
        InitializeParams memory initializeParams
    ) external;

    /// @notice Updates ticks of current active position
    /// @dev Unwinds existing active position and 
    /// @dev creates a new one with the new ticks
    /// @param ticks The lower and upper ticks of the new position
    function rebalance(TickRange memory ticks) external;

    /// @notice Function that settles the position (if not settled already) 
    /// and withdraws margin.
    function settleVaultPositionAndWithdrawMargin(TickRange memory position) external;

    /// @notice Settles tracked positions and withdraws all funds
    /// to the vault balance (up to batchSize). Should be called only after maturity. 
    /// @param batchSize Limits the number of positions settled (settles all
    /// positions if 0).
    /// @return settledBatchSize Number of positions which were settled and withdrawn from.
    function settleVault(uint256 batchSize) external returns (uint256 settledBatchSize);

    /// @notice Updates estimated tvl values.
    function updateTvl() external returns (
        uint256[] memory minTokenAmounts, 
        uint256[] memory maxTokenAmounts
    ); 

    /// @notice Sets the leverage used for minting liquidity
    function setLeverage(uint256 leverageWad) external;

    /// @notice Sets the multipler used to decide how 
    /// much margin must be left in an unwound position
    function setMarginMultiplierPostUnwind(uint256 marginMultiplierPostUnwindWad) external;

    /// @notice Sets the lookback window used to estimate
    /// the APY between now and end of the pool: the APY
    /// between now and end is estimated to be the APY 
    /// in the past lookback window seconds
    function setLookbackWindow(uint256 lookbackWindowInSeconds) external;

    /// @notice Sets the delta multiplier used to create lower
    /// and upper bounds on the estimated APY
    function setEstimatedAPYUnitDelta(uint256 estimatedAPYUnitDeltaWad) external;

    // -------------------  EXTERNAL, VIEW  -------------------

    /// @notice Returns the current leverage
    function leverage() external view returns (uint256);

    /// @notice Returns the current initialMarginMultiplierPostUnwind
    function marginMultiplierPostUnwind() external view returns (uint256);

    /// @notice Returns the current lookbackWindow
    function lookbackWindow() external view returns (uint256);

    /// @notice Returns the current estimatedAPYMultiplier
    function estimatedAPYUnitDelta() external view returns (uint256);

    /// @notice Reference to IMarginEngine of Voltz Protocol.
    function marginEngine() external view returns (IMarginEngine);

    /// @notice Reference to IVAMM of Voltz Protocol.
    function vamm() external view returns (IVAMM);

    /// @notice Reference to IRateOracle of Voltz Protocol.
    function rateOracle() external view returns (IRateOracle);

    /// @notice Reference to IPeriphery of Voltz Protocol.
    function periphery() external view returns (IPeriphery);

    /// @notice Returns the tick range of the current position
    function currentPosition() external view returns (TickRange memory);

    event PositionRebalance(
        TickRange oldPosition,
        int256 marginLeftInOldPosition,
        TickRange newPosition,
        uint256 marginDepositedInNewPosition
    );

    event VaultInitialized(
        address indexed marginEngine,
        int24 tickLower,
        int24 tickUpper,
        uint256 leverageWad,
        uint256 marginMultiplierPostUnwindWad,
        uint256 lookbackWindowInSeconds,
        uint256 estimatedAPYUnitDeltaWad
    );

    event PushDeposit(
        uint256 amountDeposited,
        uint256 liquidityMinted
    );

    event PullWithdraw(
        address to,
        uint256 amountRequestedToWithdraw,
        uint256 amountWithdrawn
    );

    event TvlUpdate(
        int256 minTvl,
        int256 maxTvl,
        uint256 tvlUpdateTimestamp
    );

    event PositionSettledAndMarginWithdrawn(
        int24 tickLower,
        int24 tickUpper
    );

    event VaultSettle(
        uint256 batchSizeRequested,
        uint256 fromIndex,
        uint256 toIndex
    );
}
